/**
 * The input system in Vue terms, the same contract as `@standarx/nav/react`: one system
 * per provider, never a singleton, and no engine imported here — the consumer builds
 * `gamepadPlugin()` / `spatialPlugin()` and passes them in, so an app that never mentions
 * a gamepad pays zero bytes for one.
 *
 * Plain `defineComponent` over setup functions, never a single-file component or JSX: the
 * package needs no Vue compiler to build, and a consumer's bundler needs none to read it.
 */

import {
  type Component,
  defineComponent,
  type InjectionKey,
  inject,
  type MaybeRefOrGetter,
  onBeforeUnmount,
  onMounted,
  type PropType,
  provide,
  type ShallowRef,
  shallowRef,
  toValue,
  watch,
} from "vue";
import {
  createInputSystem,
  type InputPlugin,
  type InputSystem,
  type InputSystemOptions,
} from "../input-system";
import type { IntentHandler, IntentScopeHost, IntentScopeOptions } from "../intent-bus";
import { isDev } from "../internal/env";
import { arrayEquals, recordEquals } from "../internal/equality";
import {
  openOn,
  type Registration,
  register,
  release,
  reopen,
  type ScopeRegistry,
} from "../internal/scope-registry";
import type { KeymapOverrides } from "../keymap";
import { getInputModality, trackInputModality } from "../modality";
import type { InputModality } from "../types";

export type { InputPlugin, InputSystem } from "../input-system";
export type { IntentHandler, IntentScopeHost, IntentScopeOptions } from "../intent-bus";
export type { KeymapOverrides } from "../keymap";
export type { InputModality } from "../types";

interface NavContext {
  readonly registry: ScopeRegistry;
  readonly system: Readonly<ShallowRef<InputSystem | null>>;
  readonly host: IntentScopeHost;
}

const NAV_CONTEXT: InjectionKey<NavContext> = Symbol("snav");
const NAV_DOCUMENT: InjectionKey<() => Document> = Symbol("snav-document");
const NO_PLUGINS: readonly InputPlugin[] = [];

const defaultDocument = (): Document => document;

/**
 * Runs `effect` from mount to unmount, and again, after the previous one's teardown,
 * whenever `source` answers something new. Mount is the point: neither runs on the
 * server, so nothing here touches a document during SSR, and a first render always
 * sees what the server saw.
 */
function whileMounted<T>(source: () => T, effect: (value: T) => VoidFunction): void {
  let stop: VoidFunction | undefined;
  onMounted(() => {
    stop = watch(source, (value, _previous, onCleanup) => onCleanup(effect(value)), {
      immediate: true,
    });
  });
  onBeforeUnmount(() => stop?.());
}

function keymapEquals(a: KeymapOverrides | undefined, b: KeymapOverrides | undefined): boolean {
  return (
    a === b ||
    (a !== undefined &&
      b !== undefined &&
      recordEquals(a.keys, b.keys) &&
      recordEquals(a.keyCodes, b.keyCodes))
  );
}

export type DocumentSource = Document | (() => Document);

export interface NavDocumentProviderProps {
  /**
   * A Document, or a getter for one: an iframe, a popup, a test fixture. Read when the
   * providers below mount, and again whenever what it reads is reactive and changes.
   */
  readonly doc: DocumentSource;
}

/**
 * Only needed when the tree does not live in the page's own document. Without it every
 * composable below reads `document`, which is what an application wants.
 */
export const NavDocumentProvider: Component<NavDocumentProviderProps> =
  defineComponent<NavDocumentProviderProps>(
    (props, { slots }) => {
      provide(NAV_DOCUMENT, () => {
        const source = props.doc;
        return typeof source === "function" ? source() : source;
      });
      return () => slots.default?.();
    },
    {
      name: "NavDocumentProvider",
      props: { doc: { type: [Object, Function] as PropType<DocumentSource>, required: true } },
    },
  );

export interface NavProviderProps {
  /**
   * Hold the instances in a plain constant, never in `ref` or `reactive`. The array may be
   * a fresh literal on every render — it is compared element by element — but a plugin
   * *built* in the render function is a new object each time and rebuilds the system.
   */
  readonly plugins?: readonly InputPlugin[] | undefined;
  /** Compared one level deep, so a literal in the render function is stable. */
  readonly keymap?: KeymapOverrides | undefined;
  /** Lets ArrowUp/Down and PageUp/Down out of a text field. Off by default. */
  readonly allowVerticalInText?: boolean | undefined;
}

export const NavProvider: Component<NavProviderProps> = defineComponent<NavProviderProps>(
  (props, { slots }) => {
    const getDocument = inject(NAV_DOCUMENT, defaultDocument);
    const system = shallowRef<InputSystem | null>(null);
    const registry: ScopeRegistry = { system: null, entries: [] };
    provide(NAV_CONTEXT, {
      registry,
      system,
      host: {
        pushScope(handler, options): VoidFunction {
          const entry = register(registry, handler, options);
          return () => release(registry, entry);
        },
      },
    });

    // One object for as long as nothing in it changed by content, so the watcher below
    // sees the same value across renders that only rebuilt a literal around it.
    let current: (InputSystemOptions & { readonly plugins: readonly InputPlugin[] }) | undefined;
    whileMounted(
      () => {
        const next = {
          doc: getDocument(),
          plugins: props.plugins ?? NO_PLUGINS,
          keymap: props.keymap,
          allowVerticalInText: props.allowVerticalInText,
        };
        if (
          current === undefined ||
          current.doc !== next.doc ||
          !arrayEquals(current.plugins, next.plugins) ||
          !keymapEquals(current.keymap, next.keymap) ||
          current.allowVerticalInText !== next.allowVerticalInText
        ) {
          current = next;
        }
        return current;
      },
      (options) => {
        const instance = createInputSystem(options);
        // Above what the plugins pushed while the system was built, oldest first, and
        // before any component can see the new system.
        registry.system = instance;
        for (const entry of registry.entries) openOn(registry, entry);
        system.value = instance;
        return () => {
          registry.system = null;
          for (const entry of registry.entries) entry.dispose = null;
          system.value = null;
          instance.destroy();
        };
      },
    );

    return () => slots.default?.();
  },
  {
    name: "NavProvider",
    props: {
      plugins: { type: Array as PropType<readonly InputPlugin[]> },
      keymap: { type: Object as PropType<KeymapOverrides> },
      allowVerticalInText: { type: Boolean, default: undefined },
    },
  },
);

/** `null` until the provider has mounted, on the server, and always without one. */
export function useInputSystem(): Readonly<ShallowRef<InputSystem | null>> {
  return inject(NAV_CONTEXT, null)?.system ?? shallowRef(null);
}

/**
 * A scope host stable for the life of the provider, for a state machine that opens its
 * scopes whenever it enters a state. A scope pushed before the system exists is opened
 * once it does, and follows the provider onto every system it builds, in the order it
 * was opened. `null` means "no provider above me".
 */
export function useIntentScopeHost(): IntentScopeHost | null {
  return inject(NAV_CONTEXT, null)?.host ?? null;
}

/**
 * Works with or without a provider: the modality store is ref-counted per document, so
 * a component that only wants to know whether to draw a ring pays for a tracker, not
 * for an input system. `"pointer"` until mounted.
 */
export function useInputModality(): Readonly<ShallowRef<InputModality>> {
  const modality = shallowRef<InputModality>("pointer");
  whileMounted(inject(NAV_DOCUMENT, defaultDocument), (doc) => {
    modality.value = getInputModality(doc);
    return trackInputModality(doc, (next) => {
      modality.value = next;
    });
  });
  return modality;
}

export interface UseIntentOptions {
  /** A value, a ref or a getter. A change re-opens the scope where it was opened. */
  readonly trapped?: MaybeRefOrGetter<boolean | undefined> | undefined;
  /** A value, a ref or a getter. A change re-opens the scope where it was opened. */
  readonly base?: MaybeRefOrGetter<boolean | undefined> | undefined;
  /**
   * The component's element, for a trap its surface (ADR-0025): an element, a getter, or
   * a template ref on an element. Read at every dispatch, so a change never re-opens the
   * scope and a ref filled at mount is seen.
   */
  readonly within?: MaybeRefOrGetter<Element | null | undefined> | undefined;
}

/**
 * Opens an intent scope from the component's mount to its unmount. On mount rather than
 * in setup, so that a scope a component opens sits above the ones its children opened
 * in the same mount — the order React gives, and the one the parity suite asserts — and
 * so that nothing is opened on the server. A rebuilt system keeps the scope in its place:
 * the provider re-opens every scope itself, in open order.
 */
export function useIntent(handler: IntentHandler, options?: UseIntentOptions | undefined): void {
  const context = inject(NAV_CONTEXT, null);
  const within = (): Element | null | undefined => toValue(options?.within);
  const shape = (): IntentScopeOptions => ({
    trapped: toValue(options?.trapped),
    base: toValue(options?.base),
    within,
  });
  let entry: Registration | null = null;

  onMounted(() => {
    if (context === null) {
      if (isDev() && typeof console !== "undefined") {
        console.warn("useIntent needs a <NavProvider> above it — the scope was not pushed.");
      }
      return;
    }
    entry = register(context.registry, handler, shape());
  });

  watch([() => toValue(options?.trapped), () => toValue(options?.base)], () => {
    if (context !== null && entry !== null) reopen(context.registry, entry, shape());
  });

  onBeforeUnmount(() => {
    if (context !== null && entry !== null) release(context.registry, entry);
    entry = null;
  });
}
