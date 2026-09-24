/**
 * Angular's own `createApplication`, `createComponent` and `bootstrapApplication` instead of
 * `TestBed`, for the reason the React harness gives: the adapter's job is to be a correct
 * Angular citizen, so the tests drive Angular directly — real applications, real change
 * detection, real after-render hooks.
 *
 * The components are compiled just in time and declared as `Component({...})(class {...})`:
 * no decorator syntax, no Angular CLI and no compiler plugin. `@angular/compiler` has to be
 * evaluated before `@angular/common` and `@angular/platform-browser`, whose partially compiled
 * declarations ask for it as they load, so it is this module's first import and the first
 * import of every Angular test file.
 *
 * Every warning and error Angular prints fails the test that caused it, as the Vue harness does
 * with Vue's: an injection Angular could not resolve or an error its handler swallowed is a
 * defect of the adapter even when every assertion still holds. The development-mode banner goes
 * through `console.log` and is not collected.
 *
 * Test-only. No entry point references it, so nothing here ships.
 */

import "@angular/compiler";
import {
  type ApplicationRef,
  Component,
  type ComponentRef,
  createComponent,
  type EnvironmentInjector,
  type EnvironmentProviders,
  type Provider,
  provideZonelessChangeDetection,
  type Type,
} from "@angular/core";
import { bootstrapApplication, createApplication } from "@angular/platform-browser";
import type { InputSystem } from "./angular";

type Providers = (Provider | EnvironmentProviders)[];

export interface Mounted<T = unknown> {
  readonly host: HTMLElement;
  /** Resolves once the component is created and attached; its first render follows. */
  readonly ready: Promise<ComponentRef<T>>;
  destroy(): void;
}

const apps: ApplicationRef[] = [];
const live: Mounted[] = [];
const warnings: string[] = [];

for (const level of ["warn", "error"] as const) {
  const passThrough = console[level];
  console[level] = (...args: unknown[]): void => {
    warnings.push(args.map(String).join(" "));
    passThrough.apply(console, args);
  };
}

function track<T>(
  host: HTMLElement,
  ready: Promise<ComponentRef<T>>,
  stop: VoidFunction,
): Mounted<T> {
  const handle: Mounted<T> = {
    host,
    ready,
    destroy(): void {
      const index = live.indexOf(handle);
      if (index === -1) return;
      live.splice(index, 1);
      stop();
      host.remove();
    },
  };
  live.push(handle);
  return handle;
}

function forget(app: ApplicationRef): void {
  const index = apps.indexOf(app);
  if (index !== -1) apps.splice(index, 1);
}

export interface MountOptions {
  /** Given to the application, the way `bootstrapApplication` takes them. */
  readonly providers?: Providers | undefined;
  /** The element the component renders into. A new `<div>` on the page by default. */
  readonly host?: HTMLElement | undefined;
  /**
   * The injector the component is created in, derived from the application's: how a route's
   * `providers` reach the components under it.
   */
  readonly environment?: ((app: ApplicationRef) => EnvironmentInjector) | undefined;
}

/**
 * One application with one component in it, created by `createApplication` and attached to it
 * by hand, so the test chooses the host element. Change detection is zoneless, which Angular 21
 * and later default to and which Angular 20 has to be asked for.
 */
export function mount<T>(component: Type<T>, options: MountOptions = {}): Mounted<T> {
  const host = options.host ?? document.createElement("div");
  if (!host.isConnected) document.body.append(host);
  let app: ApplicationRef | null = null;
  let derived: EnvironmentInjector | null = null;
  let stopped = false;
  const ready = createApplication({
    providers: [provideZonelessChangeDetection(), ...(options.providers ?? [])],
  }).then((created) => {
    if (stopped) {
      created.destroy();
      throw new Error("destroyed before it was created");
    }
    app = created;
    apps.push(created);
    derived = options.environment?.(created) ?? null;
    const environmentInjector = derived ?? created.injector;
    const ref = createComponent(component, { environmentInjector, hostElement: host });
    created.attachView(ref.hostView);
    return ref;
  });
  return track(host, ready, () => {
    stopped = true;
    if (app === null) return;
    forget(app);
    app.destroy();
    // A derived injector is not the application's to destroy: its creator owns it.
    derived?.destroy();
  });
}

/**
 * The real `bootstrapApplication`, which finds its host by the component's selector: the path an
 * application's `main.ts` takes, kept for what only that path does.
 */
export function bootstrap<T>(
  component: Type<T>,
  selector: string,
  providers: Providers = [],
): Mounted<T> {
  const host = document.createElement(selector);
  document.body.append(host);
  let app: ApplicationRef | null = null;
  let stopped = false;
  const ready = bootstrapApplication(component, {
    providers: [provideZonelessChangeDetection(), ...providers],
  }).then((created) => {
    if (stopped) {
      created.destroy();
      throw new Error("destroyed before it was created");
    }
    app = created;
    apps.push(created);
    const ref = created.components[0];
    if (ref === undefined) throw new Error("nothing was bootstrapped");
    return ref as ComponentRef<T>;
  });
  return track(host, ready, () => {
    stopped = true;
    if (app === null) return;
    forget(app);
    app.destroy();
  });
}

export async function destroyAll(): Promise<void> {
  for (const handle of [...live].reverse()) {
    await handle.ready.catch(() => undefined);
    handle.destroy();
  }
}

/** The warnings and errors printed since the last call, which empties the list. */
export function takeWarnings(): string[] {
  return warnings.splice(0, warnings.length);
}

/**
 * Waits for every application to be created and stable, then once more after a macrotask, for
 * what an after-render hook scheduled.
 */
export async function settle(): Promise<void> {
  await Promise.all(live.map((handle) => handle.ready.catch(() => undefined)));
  for (const app of [...apps]) await app.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  for (const app of [...apps]) await app.whenStable();
}

let defined = 0;

/**
 * `Component(meta)(type)` with a host attribute of its own. Angular derives a component's id from
 * its definition and warns (NG0912) when two definitions collide, which the same factory called
 * twice with one selector does.
 */
export function define<T>(meta: Component, type: Type<T>): Type<T> {
  defined += 1;
  return Component({ ...meta, host: { ...meta.host, "data-defined": String(defined) } })(type);
}

/** Records every distinct system it was handed, in the order they came. */
export function systems(): {
  readonly all: InputSystem[];
  seen(system: InputSystem | null): void;
} {
  const all: InputSystem[] = [];
  return {
    all,
    seen(system): void {
      if (system !== null && !all.includes(system)) all.push(system);
    },
  };
}
