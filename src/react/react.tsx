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

/**
 * One scope opened through the adapter. `dispose` belongs to whichever system the
 * scope currently sits on, and is `null` while there is none.
 */
interface Registration {
  readonly handler: IntentHandler;
  options: IntentScopeOptions | undefined;
  dispose: VoidFunction | null;
}

/**
 * Every scope opened through one provider, in the order it was opened, and the system
 * they currently sit on. A rebuilt system gets them from here, oldest first, rather
 * than from each component re-pushing in an effect of its own: those effects run in
 * tree order, children before parents, so the stack would come back in the order the
 * scopes are *declared*, and a trap opened last could land beneath what it covers.
 *
 * Owned by the provider instance, never by the module — two providers on one page keep
 * two orders.
 */
interface ScopeRegistry {
  system: InputSystem | null;
  readonly entries: Registration[];
}

function openOn(registry: ScopeRegistry, entry: Registration): void {
  entry.dispose = registry.system?.pushScope(entry.handler, entry.options) ?? null;
}

function register(
  registry: ScopeRegistry,
  handler: IntentHandler,
  options: IntentScopeOptions | undefined,
): Registration {
  const entry: Registration = { handler, options, dispose: null };
  registry.entries.push(entry);
  openOn(registry, entry);
  return entry;
}

function release(registry: ScopeRegistry, entry: Registration): void {
  const index = registry.entries.indexOf(entry);
  if (index === -1) return;
  registry.entries.splice(index, 1);
  entry.dispose?.();
  entry.dispose = null;
}

/**
 * New options for a scope that stays where it was opened. The bus only pushes on top,
 * so the scope and everything opened after it are re-pushed, in order: re-pushing the
 * one scope alone would lift it over every scope opened since it, and a page scope
 * that turns `base` would climb over the dialog trap it exists to sit under.
 */
function reopen(registry: ScopeRegistry, entry: Registration, options: IntentScopeOptions): void {
  const index = registry.entries.indexOf(entry);
  if (index === -1) return;
  const moved = registry.entries.slice(index);
  for (const each of moved) each.dispose?.();
  entry.options = options;
  for (const each of moved) openOn(registry, each);
}

// The types a consumer of this entry point needs to name what it passes in and what
// it is handed back. A React application should not have to reach into the package
// root to type the argument of a hook it imports from here.
export type { InputPlugin, InputSystem } from "../input-system";
export type { IntentHandler, IntentScopeHost, IntentScopeOptions } from "../intent-bus";
export type { KeymapOverrides } from "../keymap";
export type { InputModality } from "../types";

const InputSystemContext = createContext<InputSystem | null>(null);

/**
 * Apart from the system so that a rebuild re-renders what reads the system and nothing
 * else: the hooks that open scopes depend on this one, which keeps its identity for the
 * life of the provider. It is also what tells "no provider above me" apart from "the
 * provider's effect has not run yet".
 */
const ScopeRegistryContext = createContext<ScopeRegistry | null>(null);

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
 * A `plugins` prop is a fresh array literal on every render even when the plugins
 * inside it are the same objects, and that array's identity is a dependency of the
 * effect below. Comparing the contents element by element keeps the identity stable
 * across those renders.
 *
 * What it does *not* do — and cannot — is absorb `plugins={[gamepadPlugin()]}`. That
 * builds a new plugin object per render, so the contents genuinely did change and the
 * system is rebuilt: a destroy, a rebuild, and the modality refcount going to zero
 * and back on the way. The contract is therefore that the caller hoists or memoises
 * the plugin instances; `NavProviderProps.plugins` says so, and
 * `react.browser.test.tsx` pins both halves.
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
  /**
   * Hoist these or wrap them in `useMemo`. The array itself may be a fresh literal
   * per render — that is compared away — but a plugin *built* in the JSX is a new
   * object each time, which rebuilds the whole system on every render.
   */
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
  const [registry] = useState<ScopeRegistry>(() => ({ system: null, entries: [] }));

  // An effect, not a render: `createInputSystem` needs a document and installs
  // capture-phase listeners. Children render once with `null`, which is also the
  // server's answer. Their effects run before this one, so on the first commit the
  // scopes they open are only recorded, and pushed from here.
  useEffect(() => {
    const instance = createInputSystem({
      doc: getDocument(),
      plugins,
      keymap,
      allowVerticalInText,
    });
    // Above what the plugins pushed while the system was built, and before any child
    // can see the new system.
    registry.system = instance;
    for (const entry of registry.entries) openOn(registry, entry);
    setSystem(instance);
    return () => {
      registry.system = null;
      for (const entry of registry.entries) entry.dispose = null;
      setSystem(null);
      instance.destroy();
    };
  }, [registry, getDocument, plugins, keymap, allowVerticalInText]);

  return (
    <ScopeRegistryContext.Provider value={registry}>
      <InputSystemContext.Provider value={system}>{children}</InputSystemContext.Provider>
    </ScopeRegistryContext.Provider>
  );
}

/** `null` until the provider's effect has run, and always `null` without one. */
export function useInputSystem(): InputSystem | null {
  return useContext(InputSystemContext);
}

/**
 * A scope host that survives the provider's first commit — what a machine is handed
 * instead of the system itself.
 *
 * The provider builds its system in an effect, so `useInputSystem()` answers `null` on
 * the first commit and a system from the second. A *machine* cannot wait for that. An
 * interpreter installs a state's effects on entering that state and offers no
 * dependency mechanism, so a dialog open on its first commit that pushed onto `null`
 * would answer no gamepad for as long as it stays open — a route-level modal with a
 * dead B button.
 *
 * So: one object, stable for the life of the provider, whose scopes go into the
 * provider's registry and follow it onto every system it builds, in the order they
 * were opened. `null` still means "no provider above me".
 */
export function useIntentScopeHost(): IntentScopeHost | null {
  const registry = useContext(ScopeRegistryContext);
  return useMemo<IntentScopeHost | null>(
    () =>
      registry && {
        pushScope(handler, options): VoidFunction {
          const entry = register(registry, handler, options);
          return () => release(registry, entry);
        },
      },
    [registry],
  );
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

export interface UseIntentOptions extends Omit<IntentScopeOptions, "within"> {
  /**
   * The component's element, for a trap its surface (ADR-0025): an element, a getter,
   * or a ref — the element only exists after the first commit, so it is read at
   * dispatch. A new value here never re-opens the scope.
   */
  readonly within?:
    | IntentScopeOptions["within"]
    | { readonly current: Element | null | undefined }
    | undefined;
}

/**
 * Opens an intent scope for the lifetime of the component. The handler is read
 * from a ref, so an inline arrow does not pop and re-push the scope on every
 * render — which would silently reorder it under any scope pushed since. `within`
 * is read the same way. A new `trapped` or `base` keeps the scope where it was
 * opened, and so does a rebuilt system: the provider re-opens every scope itself,
 * in open order.
 */
export function useIntent(handler: IntentHandler, options?: UseIntentOptions | undefined): void {
  const registry = useContext(ScopeRegistryContext);
  const latest = useRef(handler);
  latest.current = handler;
  const source = useRef(options?.within);
  source.current = options?.within;
  // One getter for the life of the component, so neither an inline arrow nor a ref
  // that only gets its element after this commit is a reason to re-open the scope.
  const [within] = useState(() => (): Element | null | undefined => {
    const current = source.current;
    return typeof current === "function"
      ? current()
      : current && "current" in current
        ? current.current
        : current;
  });
  // Read field by field rather than passing `options` through: the object is
  // usually a fresh literal per render, and depending on it would pop and re-push
  // the scope every time. `base` is forwarded too — the source dropped it
  // silently, and in a package whose headline consumer is the spatial engine
  // someone will pass it.
  const trapped = options?.trapped;
  const base = options?.base;
  const shape = useRef<IntentScopeOptions>({ trapped, base, within });
  shape.current = { trapped, base, within };
  const opened = useRef<Registration | null>(null);

  useEffect(() => {
    if (registry === null) {
      if (isDev() && typeof console !== "undefined") {
        console.warn("useIntent needs a <NavProvider> above it — the scope was not pushed.");
      }
      return;
    }
    const entry = register(registry, (event) => latest.current(event), shape.current);
    opened.current = entry;
    return () => {
      opened.current = null;
      release(registry, entry);
    };
  }, [registry]);

  useEffect(() => {
    const entry = opened.current;
    if (registry === null || entry === null) return;
    if (entry.options?.trapped === trapped && entry.options?.base === base) return;
    reopen(registry, entry, { trapped, base, within });
  }, [registry, trapped, base, within]);
}
