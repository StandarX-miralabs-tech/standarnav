/**
 * The input system in Svelte terms, the same contract as `@standarx/nav/react` and
 * `@standarx/nav/vue`: one system per provider, never a singleton, and no engine imported
 * here — the consumer builds `gamepadPlugin()` / `spatialPlugin()` and passes them in, so an
 * app that never mentions a gamepad pays zero bytes for one.
 *
 * Plain functions over Svelte's public runtime, never a component and never a rune: a
 * component cannot be written without the compiler, and the package ships no compiler
 * output, so what React and Vue express as a provider component is a function called in a
 * component's `<script>`. Never name this file `*.svelte.ts`, which the Svelte toolchain
 * compiles as a runes module.
 */

import { getAllContexts, getContext, onMount, setContext, untrack } from "svelte";
import { fromStore, toStore, writable } from "svelte/store";
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

/** A value, or a getter for one: how Svelte 5 passes reactive state into a function. */
export type MaybeGetter<T> = T | (() => T);

interface NavContext {
  readonly registry: ScopeRegistry;
  readonly system: { readonly current: InputSystem | null };
  readonly host: IntentScopeHost;
}

const NAV_CONTEXT: unique symbol = Symbol("snav");
const NAV_DOCUMENT: unique symbol = Symbol("snav-document");
const NO_PLUGINS: readonly InputPlugin[] = [];
const NO_SYSTEM: { readonly current: null } = { current: null };

// The context maps of the components that called `provideNav`, so that a document provided
// after it in the same component can be named in development rather than silently ignored.
const providers = new WeakSet<object>();

const defaultDocument = (): Document => document;

function read<T>(source: MaybeGetter<T>): T {
  return typeof source === "function" ? (source as () => T)() : source;
}

/**
 * Calls `effect` with what `source` answers, and again whenever the reactive state it reads
 * changes to something `same` does not accept. `toStore` is the public way to watch a getter
 * from plain TypeScript, and its store treats every object as new, so the dedupe is here.
 * `effect` runs untracked: what it reads must not re-run the watch.
 */
function watch<T>(
  source: () => T,
  same: (a: T, b: T) => boolean,
  effect: (value: T) => void,
): VoidFunction {
  let last: { readonly value: T } | undefined;
  return toStore(source).subscribe((value) => {
    if (last !== undefined && same(last.value, value)) return;
    last = { value };
    untrack(() => effect(value));
  });
}

/**
 * Runs `effect` from mount to destroy, and again, after the previous one's teardown, whenever
 * `source` answers something new. Mount is the point: `onMount` never runs on a server, so
 * nothing here touches a document during SSR, and a hydrating first render sees what the
 * server saw.
 */
function whileMounted<T>(
  source: () => T,
  same: (a: T, b: T) => boolean,
  effect: (value: T) => VoidFunction,
): void {
  onMount(() => {
    let cleanup: VoidFunction | undefined;
    const stop = watch(source, same, (value) => {
      cleanup?.();
      cleanup = effect(value);
    });
    return () => {
      stop();
      cleanup?.();
    };
  });
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

type BuildOptions = InputSystemOptions & { readonly plugins: readonly InputPlugin[] };

function optionsEqual(a: BuildOptions, b: BuildOptions): boolean {
  return (
    a.doc === b.doc &&
    arrayEquals(a.plugins, b.plugins) &&
    keymapEquals(a.keymap, b.keymap) &&
    a.allowVerticalInText === b.allowVerticalInText
  );
}

function documentGetter(): () => Document {
  return getContext<(() => Document) | undefined>(NAV_DOCUMENT) ?? defaultDocument;
}

export type DocumentSource = Document | (() => Document);

/**
 * Only needed when the tree does not live in the page's own document: an iframe, a popup, a
 * test fixture. Call it while a component initialises, before `provideNav` in the same
 * component or in a component above it. The getter is read on mount, and again whenever
 * reactive state it reads changes.
 */
export function provideNavDocument(doc: DocumentSource): void {
  if (isDev() && providers.has(getAllContexts()) && typeof console !== "undefined") {
    console.warn("provideNavDocument must come before provideNav in the same component.");
  }
  setContext(NAV_DOCUMENT, () => read(doc));
}

export interface NavOptions {
  /**
   * Hold the instances in a plain constant. The array may be a fresh literal each time the
   * getter runs — it is compared element by element — but a plugin *built* in the getter is a
   * new object each time and rebuilds the system.
   */
  readonly plugins?: readonly InputPlugin[] | undefined;
  /** Compared one level deep, so a literal in the getter is stable. */
  readonly keymap?: KeymapOverrides | undefined;
  /** Lets ArrowUp/Down and PageUp/Down out of a text field. Off by default. */
  readonly allowVerticalInText?: boolean | undefined;
}

/**
 * What `<NavProvider>` is in React and Vue, for the component that calls it and everything
 * below it. Call it while the component initialises. The system is built on mount, and
 * rebuilt, after the old one is destroyed, when the document, a plugin, the keymap or
 * `allowVerticalInText` changes; pass a getter for options that change.
 */
export function provideNav(options?: MaybeGetter<NavOptions | undefined>): void {
  const getDocument = documentGetter();
  const system = writable<InputSystem | null>(null);
  const registry: ScopeRegistry = { system: null, entries: [] };
  setContext<NavContext>(NAV_CONTEXT, {
    registry,
    system: fromStore(system),
    host: {
      pushScope(handler, scopeOptions): VoidFunction {
        const entry = register(registry, handler, scopeOptions);
        return () => release(registry, entry);
      },
    },
  });
  if (isDev()) providers.add(getAllContexts());

  whileMounted(
    (): BuildOptions => {
      const given = read(options);
      return {
        doc: getDocument(),
        plugins: given?.plugins ?? NO_PLUGINS,
        keymap: given?.keymap,
        allowVerticalInText: given?.allowVerticalInText,
      };
    },
    optionsEqual,
    (built) => {
      const instance = createInputSystem(built);
      // Above what the plugins pushed while the system was built, oldest first, and before
      // any component can see the new system.
      registry.system = instance;
      for (const entry of registry.entries) openOn(registry, entry);
      system.set(instance);
      return () => {
        registry.system = null;
        for (const entry of registry.entries) entry.dispose = null;
        system.set(null);
        instance.destroy();
      };
    },
  );
}

/** `null` until the provider has mounted, on the server, and always without one. */
export function useInputSystem(): { readonly current: InputSystem | null } {
  return getContext<NavContext | undefined>(NAV_CONTEXT)?.system ?? NO_SYSTEM;
}

/**
 * A scope host stable for the life of the provider, for a state machine that opens its
 * scopes whenever it enters a state. A scope pushed before the system exists is opened
 * once it does, and follows the provider onto every system it builds, in the order it
 * was opened. `null` means "no provider above me".
 */
export function useIntentScopeHost(): IntentScopeHost | null {
  return getContext<NavContext | undefined>(NAV_CONTEXT)?.host ?? null;
}

/**
 * Works with or without a provider: the modality store is ref-counted per document, so a
 * component that only wants to know whether to draw a ring pays for a tracker, not for an
 * input system. `"pointer"` until mounted.
 */
export function useInputModality(): { readonly current: InputModality } {
  const modality = writable<InputModality>("pointer");
  whileMounted(documentGetter(), Object.is, (doc) => {
    modality.set(getInputModality(doc));
    return trackInputModality(doc, modality.set);
  });
  return fromStore(modality);
}

export interface UseIntentOptions {
  /** A value or a getter. A change re-opens the scope where it was opened. */
  readonly trapped?: MaybeGetter<boolean | undefined> | undefined;
  /** A value or a getter. A change re-opens the scope where it was opened. */
  readonly base?: MaybeGetter<boolean | undefined> | undefined;
  /**
   * The component's element, for a trap its surface (ADR-0025): an element, or a getter such
   * as `() => element` over `bind:this`. Read at every dispatch, so a change never re-opens
   * the scope and an element bound at mount is seen.
   */
  readonly within?: MaybeGetter<Element | null | undefined> | undefined;
}

/**
 * Opens an intent scope from the component's mount to its destruction. On mount rather than
 * while the component initialises, so that a scope a component opens sits above the ones its
 * children opened in the same mount — the order React gives, and the one the parity suite
 * asserts — and so that nothing is opened on the server. A rebuilt system keeps the scope in
 * its place: the provider re-opens every scope itself, in open order.
 */
export function useIntent(handler: IntentHandler, options?: UseIntentOptions | undefined): void {
  const context = getContext<NavContext | undefined>(NAV_CONTEXT);
  const within = (): Element | null | undefined => read(options?.within);

  onMount(() => {
    if (context === undefined) {
      if (isDev() && typeof console !== "undefined") {
        console.warn(
          "useIntent needs provideNav() in a component above it — the scope was not pushed.",
        );
      }
      return;
    }
    let entry: Registration | null = null;
    const stop = watch(
      (): readonly [boolean | undefined, boolean | undefined] => [
        read(options?.trapped),
        read(options?.base),
      ],
      (a, b) => a[0] === b[0] && a[1] === b[1],
      ([trapped, base]) => {
        const shape: IntentScopeOptions = { trapped, base, within };
        if (entry === null) entry = register(context.registry, handler, shape);
        else reopen(context.registry, entry, shape);
      },
    );
    return () => {
      stop();
      if (entry !== null) release(context.registry, entry);
    };
  });
}
