/**
 * The input system in Angular terms, the same contract as `@standarx/nav/react`, `/vue` and
 * `/svelte`: one system per provider, never a singleton, and no engine imported here — the
 * consumer builds `gamepadPlugin()` / `spatialPlugin()` and passes them in, so an app that
 * never mentions a gamepad pays zero bytes for one.
 *
 * Plain `provide*` and `inject*` functions over Angular's public runtime, never a decorator:
 * a component or a directive has to be compiled by Angular's own compiler, and the package
 * ships none of its output, so what React and Vue express as a provider component is a list
 * of providers here, and what they express as a hook is a function called in an injection
 * context.
 */

import {
  afterNextRender,
  afterRenderEffect,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  ENVIRONMENT_INITIALIZER,
  effect,
  InjectionToken,
  inject,
  type Provider,
  type Signal,
  signal,
  untracked,
} from "@angular/core";
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

/** A value, a signal, or a getter for one: what an option read reactively accepts. */
export type MaybeSignal<T> = T | Signal<T> | (() => T);

/** A scope waiting for the render it was declared in to finish. */
interface Pending {
  readonly host: unknown;
  readonly open: VoidFunction;
}

interface NavState {
  readonly registry: ScopeRegistry;
  readonly system: Signal<InputSystem | null>;
  readonly host: IntentScopeHost;
  readonly pending: Pending[];
}

const NAV: InjectionToken<NavState> = new InjectionToken<NavState>("snav");
const NAV_DOCUMENT: InjectionToken<() => Document> = new InjectionToken<() => Document>(
  "snav-document",
);
const NO_PLUGINS: readonly InputPlugin[] = [];

function read<T>(source: MaybeSignal<T>): T {
  return typeof source === "function" ? (source as () => T)() : source;
}

function documentGetter(): () => Document {
  const given = inject(NAV_DOCUMENT, { optional: true });
  if (given !== null) return given;
  const doc = inject(DOCUMENT);
  return () => doc;
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

export type DocumentSource = Document | (() => Document);

/**
 * Only needed when the tree does not live in the page's own document: an iframe, a popup, a
 * test fixture. Goes in the same `providers` as `provideNav`, or in an injector above it. A
 * getter, or a signal, is read after the first render and again whenever what it reads changes.
 */
export function provideNavDocument(doc: DocumentSource): Provider[] {
  return [{ provide: NAV_DOCUMENT, useValue: () => read(doc) }];
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

function createNav(source: MaybeSignal<NavOptions | undefined>): NavState {
  const getDocument = documentGetter();
  const registry: ScopeRegistry = { system: null, entries: [] };
  const system = signal<InputSystem | null>(null);
  // One value for as long as nothing in it changed by content, so the effect below sees the
  // same options across reads that only rebuilt a literal around them.
  const options = computed<BuildOptions>(
    () => {
      const given = read(source);
      return {
        doc: getDocument(),
        plugins: given?.plugins ?? NO_PLUGINS,
        keymap: given?.keymap,
        allowVerticalInText: given?.allowVerticalInText,
      };
    },
    { equal: optionsEqual },
  );

  // After a render, never in this factory: after-render effects do not run on a server, so
  // nothing here touches a document during SSR, and a hydrating first render sees what the
  // server saw.
  afterRenderEffect((onCleanup) => {
    const built = options();
    untracked(() => {
      const instance = createInputSystem(built);
      // Above what the plugins pushed while the system was built, oldest first, and before
      // any component can see the new system.
      registry.system = instance;
      for (const entry of registry.entries) openOn(registry, entry);
      system.set(instance);
      onCleanup(() => {
        registry.system = null;
        for (const entry of registry.entries) entry.dispose = null;
        system.set(null);
        instance.destroy();
      });
    });
  });

  return {
    registry,
    system: system.asReadonly(),
    pending: [],
    host: {
      pushScope(handler, scopeOptions): VoidFunction {
        const entry = register(registry, handler, scopeOptions);
        return () => release(registry, entry);
      },
    },
  };
}

/**
 * What `<NavProvider>` is in React and Vue, as a list of providers: for `bootstrapApplication`,
 * a route's `providers` or a component's. The system is built after the first render, and
 * rebuilt, after the old one is destroyed, when the document, a plugin, the keymap or
 * `allowVerticalInText` changes; pass a signal or a getter for options that change.
 *
 * In an environment injector — the application's or a route's — the provider is created with
 * the injector, so a system exists even when nothing below asks for one. In a component's
 * `providers` it is created on the first request, so the providing component should call
 * `injectInputSystem()` when nothing else below it does.
 */
export function provideNav(options?: MaybeSignal<NavOptions | undefined>): Provider[] {
  return [
    { provide: NAV, useFactory: () => createNav(options) },
    // The one start-up hook a plain provider can carry: `provideEnvironmentInitializer` wraps
    // this same token in `EnvironmentProviders`, which a component's `providers` reject
    // (NG0207). A node injector never reads it, so there it does nothing.
    { provide: ENVIRONMENT_INITIALIZER, multi: true, useValue: () => inject(NAV) },
  ];
}

/** `null` until the provider's first render, on the server, and always without one. */
export function injectInputSystem(): Signal<InputSystem | null> {
  return inject(NAV, { optional: true })?.system ?? signal(null).asReadonly();
}

/**
 * A scope host stable for the life of the provider, for a state machine that opens its
 * scopes whenever it enters a state. A scope pushed before the system exists is opened
 * once it does, and follows the provider onto every system it builds, in the order it
 * was opened. `null` means "no provider above me".
 */
export function injectIntentScopeHost(): IntentScopeHost | null {
  return inject(NAV, { optional: true })?.host ?? null;
}

/**
 * Works with or without a provider: the modality store is ref-counted per document, so a
 * component that only wants to know whether to draw a ring pays for a tracker, not for an
 * input system. `"pointer"` until the first render.
 */
export function injectInputModality(): Signal<InputModality> {
  const getDocument = documentGetter();
  const modality = signal<InputModality>("pointer");
  afterRenderEffect((onCleanup) => {
    const doc = getDocument();
    untracked(() => {
      modality.set(getInputModality(doc));
      onCleanup(trackInputModality(doc, modality.set));
    });
  });
  return modality.asReadonly();
}

export interface InjectIntentOptions {
  /** A value, a signal or a getter. A change re-opens the scope where it was opened. */
  readonly trapped?: MaybeSignal<boolean | undefined> | undefined;
  /** A value, a signal or a getter. A change re-opens the scope where it was opened. */
  readonly base?: MaybeSignal<boolean | undefined> | undefined;
  /**
   * The component's element, for a trap its surface (ADR-0025): an element, an `ElementRef`
   * such as `inject(ElementRef)`, or a signal or getter answering either. Read at every
   * dispatch, so a change never re-opens the scope and an element filled after the first
   * render is seen.
   */
  readonly within?: MaybeSignal<Element | ElementRef<Element> | null | undefined> | undefined;
}

/**
 * Scopes declared in one render, opened in DOM post-order of their components: Angular runs
 * after-render hooks in construction order, parent first, and a composite must sit under the
 * trap of the dialog around it, as React's and Vue's child-first effects put it.
 */
function postOrder(a: Pending, b: Pending): number {
  const x = a.host instanceof Node ? a.host : null;
  const y = b.host instanceof Node ? b.host : null;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  const position = x.compareDocumentPosition(y);
  if (position & Node.DOCUMENT_POSITION_CONTAINED_BY) return 1;
  if (position & Node.DOCUMENT_POSITION_CONTAINS) return -1;
  return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function flush(nav: NavState): void {
  for (const each of nav.pending.splice(0).sort(postOrder)) each.open();
}

/**
 * Opens an intent scope from the end of the render that created the calling component to its
 * destruction. Call it in an injection context: a constructor or a field initialiser. After the
 * render rather than at once, so that a scope a component opens sits above the ones its children
 * opened in the same render — the order React gives, and the one the parity suite asserts — and
 * so that nothing is opened on the server. A rebuilt system keeps the scope in its place: the
 * provider re-opens every scope itself, in open order.
 */
export function injectIntent(handler: IntentHandler, options?: InjectIntentOptions): void {
  const nav = inject(NAV, { optional: true });
  if (nav === null) {
    if (isDev()) {
      afterNextRender(() => {
        console.warn(
          "injectIntent needs provideNav() in an injector above it — the scope was not pushed.",
        );
      });
    }
    return;
  }
  const within = (): Element | null | undefined => {
    const value = read(options?.within);
    return value instanceof ElementRef ? value.nativeElement : value;
  };
  const shape = (): IntentScopeOptions => ({
    trapped: read(options?.trapped),
    base: read(options?.base),
    within,
  });
  let entry: Registration | null = null;
  const pending: Pending = {
    host: inject(ElementRef, { optional: true })?.nativeElement,
    open: () => {
      entry = register(nav.registry, handler, untracked(shape));
    },
  };
  nav.pending.push(pending);
  afterNextRender(() => flush(nav));

  // Runs on a server too, where `entry` stays null: nothing below may touch a document.
  effect(() => {
    const next = shape();
    untracked(() => {
      if (entry === null) return;
      if (entry.options?.trapped === next.trapped && entry.options?.base === next.base) return;
      reopen(nav.registry, entry, next);
    });
  });

  inject(DestroyRef).onDestroy(() => {
    const index = nav.pending.indexOf(pending);
    if (index !== -1) nav.pending.splice(index, 1);
    if (entry !== null) release(nav.registry, entry);
    entry = null;
  });
}
