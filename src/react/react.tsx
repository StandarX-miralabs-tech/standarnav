/**
 * The input system in React terms. It stays an instance, never a singleton — two
 * micro-frontends on one page each get their own, and a test never inherits the
 * previous one.
 *
 * The engines are not imported here, and that is deliberate: the consumer builds
 * `gamepadPlugin()` / `spatialPlugin()` themselves and passes them in, so an app
 * that never mentions a gamepad pays zero bytes for one. A provider that imported
 * them to be helpful would put both engines in every bundle.
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createInputSystem, type InputPlugin, type InputSystem } from "../input-system";
import type { IntentHandler, IntentScopeHost, IntentScopeOptions } from "../intent-bus";
import { isDev } from "../internal/env";
import { arrayEquals, recordEquals } from "../internal/equality";
import type { KeymapOverrides } from "../keymap";
import { getInputModality, trackInputModality } from "../modality";
import type { InputModality } from "../types";
import { useSafeLayoutEffect } from "./use-safe-layout-effect";

/**
 * A slot rather than the system itself, so `null` from "no provider" stays
 * distinguishable from `null` from "the provider's effect has not run yet" — the
 * difference between a mistake worth warning about and the first render.
 */
interface InputSystemSlot {
  readonly system: InputSystem | null;
}

// The types a consumer of this entry point needs to name what it passes in and what
// it is handed back. A React application should not have to reach into the package
// root to type the argument of a hook it imports from here.
export type { InputPlugin, InputSystem } from "../input-system";
export type { IntentHandler, IntentScopeHost, IntentScopeOptions } from "../intent-bus";
export type { KeymapOverrides } from "../keymap";
export type { InputModality } from "../types";

const InputSystemContext = createContext<InputSystemSlot | null>(null);

const NO_PLUGINS: readonly InputPlugin[] = [];

export type DocumentSource = Document | (() => Document);

/**
 * One module-level constant, never an arrow built per render. It is the identity
 * that matters: a fresh `() => document` each render is a new dependency in the
 * effects below, which rebuilds the input system on every render and churns the
 * modality refcount between one and zero — at which point the tracker disposes and
 * `getInputModality` goes back to answering "pointer".
 */
const defaultDocument = (): Document => document;

const DocumentContext = createContext<() => Document>(defaultDocument);

export interface NavDocumentProviderProps {
  /** A Document, or a getter for one. An iframe, a popup, a test fixture. */
  readonly doc: DocumentSource;
  readonly children?: ReactNode;
}

/**
 * Only needed when the tree does not live in the page's own document. Without it
 * every hook below reads `document`, which is what an application wants.
 */
export function NavDocumentProvider(props: NavDocumentProviderProps): ReactNode {
  const { doc, children } = props;
  const latest = useRef(doc);
  latest.current = doc;
  const resolved = useRef<Document | null>(null);
  const [generation, setGeneration] = useState(0);

  // `doc={() => frame.contentDocument!}` is a new function on every parent render,
  // and this identity is a dependency of the provider's effect below — depending on
  // it directly would destroy and rebuild the whole input system each time, taking
  // the modality refcount to zero on the way. So the caller's value is read through
  // a ref and this identity changes only when the *resolved* document does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new identity per generation is the entire point; the closure reads the source through a ref, so nothing else can be the dependency.
  const getDocument = useMemo<() => Document>(() => {
    return () => {
      const source = latest.current;
      return typeof source === "function" ? source() : source;
    };
  }, [generation]);

  // A getter is free to answer with a different document later — an iframe that
  // navigated, a popup that was replaced. Pinning the identity above is what makes
  // this the only place that can notice.
  useEffect(() => {
    const source = latest.current;
    const next = typeof source === "function" ? source() : source;
    const previous = resolved.current;
    resolved.current = next;
    if (previous !== null && previous !== next) setGeneration((count) => count + 1);
  });

  return <DocumentContext.Provider value={getDocument}>{children}</DocumentContext.Provider>;
}

function useDocument(): () => Document {
  return useContext(DocumentContext);
}

/**
 * Plugins are usually built inline (`plugins={[gamepadPlugin()]}`), which is a new
 * array — and a new engine — on every render. Comparing the contents keeps the
 * identity stable so the effect below only tears the system down when the set of
 * plugins genuinely changed.
 */
function useStableList<T>(list: readonly T[]): readonly T[] {
  const stored = useRef(list);
  if (!arrayEquals(stored.current, list)) stored.current = list;
  return stored.current;
}

/**
 * The same treatment for `keymap={{ keys: { ... } }}`, which is a fresh literal per
 * render for exactly the same reason and reaches the same effect.
 */
function useStableKeymap(keymap: KeymapOverrides | undefined): KeymapOverrides | undefined {
  const stored = useRef(keymap);
  const current = stored.current;
  const same =
    current === keymap ||
    (current !== undefined &&
      keymap !== undefined &&
      recordEquals(current.keys, keymap.keys) &&
      recordEquals(current.keyCodes, keymap.keyCodes));
  if (!same) stored.current = keymap;
  return stored.current;
}

export interface NavProviderProps {
  readonly plugins?: readonly InputPlugin[] | undefined;
  readonly keymap?: KeymapOverrides | undefined;
  /** Lets ArrowUp/Down and PageUp/Down out of a text field. Off by default. */
  readonly allowVerticalInText?: boolean | undefined;
  readonly children?: ReactNode;
}

export function NavProvider(props: NavProviderProps): ReactNode {
  const { allowVerticalInText, children } = props;
  const plugins = useStableList(props.plugins ?? NO_PLUGINS);
  const keymap = useStableKeymap(props.keymap);
  const getDocument = useDocument();
  const [system, setSystem] = useState<InputSystem | null>(null);

  // An effect, not a render: `createInputSystem` needs a document and installs
  // capture-phase listeners. Children render once with `null`, which is also the
  // server's answer.
  useEffect(() => {
    const instance = createInputSystem({
      doc: getDocument(),
      plugins,
      keymap,
      allowVerticalInText,
    });
    setSystem(instance);
    return () => {
      setSystem(null);
      instance.destroy();
    };
  }, [getDocument, plugins, keymap, allowVerticalInText]);

  const slot = useMemo<InputSystemSlot>(() => ({ system }), [system]);
  return <InputSystemContext.Provider value={slot}>{children}</InputSystemContext.Provider>;
}

/** `null` until the provider's effect has run, and always `null` without one. */
export function useInputSystem(): InputSystem | null {
  return useContext(InputSystemContext)?.system ?? null;
}

interface TrackedScope {
  readonly handler: IntentHandler;
  readonly options: IntentScopeOptions | undefined;
  dispose: VoidFunction | null;
  disposed: boolean;
}

/**
 * A scope host that survives the provider's first commit — what a machine is handed
 * instead of the system itself.
 *
 * The provider builds its system in an effect, so `useInputSystem()` answers `null` on
 * the first commit and a system from the second. A component that pushes its scope from
 * an effect of its own is fine: `useIntent` has `system` in its dependencies and simply
 * re-runs. A *machine* has no such thing. An interpreter installs a state's effects on
 * entering that state and offers no dependency mechanism, so a dialog that is open on
 * its first commit reads `null`, returns early, and answers no gamepad for as long as
 * it stays open — a route-level modal with a dead B button.
 *
 * So: one object, stable for the life of the component, that remembers what was pushed
 * through it and re-opens it on whichever system is current. `null` still means "no
 * provider above me".
 */
export function useIntentScopeHost(): IntentScopeHost | null {
  const slot = useContext(InputSystemContext);
  const system = slot?.system ?? null;
  const live = useRef<InputSystem | null>(system);
  live.current = system;
  const scopes = useRef<TrackedScope[]>([]);

  const host = useMemo<IntentScopeHost>(
    () => ({
      pushScope(handler, options): VoidFunction {
        const scope: TrackedScope = { handler, options, dispose: null, disposed: false };
        scopes.current.push(scope);
        scope.dispose = live.current?.pushScope(handler, options) ?? null;

        return () => {
          if (scope.disposed) return;
          scope.disposed = true;
          scope.dispose?.();
          scope.dispose = null;
          const index = scopes.current.indexOf(scope);
          if (index !== -1) scopes.current.splice(index, 1);
        };
      },
    }),
    [],
  );

  // Layout rather than passive: the machine opened its scope in the layout effect of a
  // commit that has already happened, and the order the scopes were opened in is the
  // order the stack has to see them re-opened.
  useSafeLayoutEffect(() => {
    for (const scope of scopes.current) {
      scope.dispose?.();
      scope.dispose = system === null ? null : system.pushScope(scope.handler, scope.options);
    }
  }, [system]);

  return slot === null ? null : host;
}

/**
 * Works with or without a provider: the modality store is ref-counted per document,
 * so a component that only wants to know whether to draw a ring pays for a tracker,
 * not for an input system.
 */
export function useInputModality(): InputModality {
  const getDocument = useDocument();
  const [modality, setModality] = useState<InputModality>("pointer");

  useEffect(() => {
    const doc = getDocument();
    setModality(getInputModality(doc));
    return trackInputModality(doc, setModality);
  }, [getDocument]);

  return modality;
}

/**
 * Pushes an intent scope for the lifetime of the component. The handler is read
 * from a ref, so an inline arrow does not pop and re-push the scope on every
 * render — which would silently reorder it under any scope pushed since.
 */
export function useIntent(handler: IntentHandler, options?: IntentScopeOptions | undefined): void {
  const slot = useContext(InputSystemContext);
  const system = slot?.system ?? null;
  const latest = useRef(handler);
  latest.current = handler;
  // Read field by field rather than passing `options` through: the object is
  // usually a fresh literal per render, and depending on it would pop and re-push
  // the scope every time. `base` is forwarded too — the source dropped it
  // silently, and in a package whose headline consumer is the spatial engine
  // someone will pass it.
  const trapped = options?.trapped;
  const base = options?.base;

  useEffect(() => {
    if (system === null) {
      // Only the missing provider is worth a word; a system that simply has not
      // been built yet arrives on the very next commit.
      if (isDev() && slot === null && typeof console !== "undefined") {
        console.warn("useIntent needs a <NavProvider> above it — the scope was not pushed.");
      }
      return;
    }
    return system.pushScope((event) => latest.current(event), { trapped, base });
  }, [system, slot, trapped, base]);
}
