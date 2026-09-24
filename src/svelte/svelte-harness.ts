/**
 * Svelte's own `mount`, `unmount`, `flushSync` and `tick` instead of a testing library, for the
 * reason the React harness gives: the adapter's job is to be a correct Svelte citizen, so the
 * tests drive Svelte directly — real mounts, real flushes.
 *
 * Every runtime warning Svelte prints fails the test that caused it, as the Vue harness does
 * with Vue's: an ownership or binding warning is a defect of the adapter or of its recipe even
 * when every assertion still holds. Svelte tags its development warnings `[svelte]` and its
 * production ones with a `svelte.dev/e/` link, and prints both through `console.warn`.
 *
 * The components under `fixtures/` are plain JavaScript with JSDoc, never `lang="ts"`: the
 * Svelte 5.0 compiler of the `svelte-floor` job cannot print a TypeScript annotation.
 *
 * Test-only. No entry point references it, so nothing here ships.
 */

import { flushSync, mount as mountComponent, tick, unmount } from "svelte";
import { fromStore, writable } from "svelte/store";
import type { InputSystem } from "./svelte";

type Component = Parameters<typeof mountComponent>[0];

export interface Mounted {
  readonly container: HTMLElement;
  unmount(): void;
}

/** One entry of what `fixtures/Tree.svelte` renders: a component, its props, its children. */
export interface TreeNode {
  readonly key: string;
  readonly component: Component;
  readonly props?: Readonly<Record<string, unknown>> | undefined;
  readonly children?: (() => readonly TreeNode[]) | undefined;
}

const mounted: Mounted[] = [];
const warnings: string[] = [];

const passThrough = console.warn;
console.warn = (...args: unknown[]): void => {
  const [first] = args;
  if (
    typeof first === "string" &&
    (first.includes("[svelte]") || first.includes("svelte.dev/e/"))
  ) {
    warnings.push(first);
    return;
  }
  passThrough.apply(console, args);
};

export function mount(
  component: Component,
  props: Record<string, unknown> = {},
  container: HTMLElement = document.createElement("div"),
): Mounted {
  if (!container.isConnected) document.body.append(container);
  const instance = mountComponent(component, { target: container, props });

  const handle: Mounted = {
    container,
    unmount(): void {
      const index = mounted.indexOf(handle);
      if (index === -1) return;
      mounted.splice(index, 1);
      void unmount(instance);
      flushSync();
      container.remove();
    },
  };
  mounted.push(handle);
  return handle;
}

export function unmountAll(): void {
  for (const handle of [...mounted].reverse()) handle.unmount();
}

/** The Svelte warnings since the last call, which empties the list. */
export function takeWarnings(): string[] {
  return warnings.splice(0, warnings.length);
}

/** Runs what is pending, then once more for what that flush scheduled. */
export async function settle(): Promise<void> {
  flushSync();
  await tick();
  flushSync();
}

/**
 * State a test can change and a component or a getter can read reactively: Svelte's own
 * `fromStore` over a `writable`, since runes do not exist outside a compiled module.
 */
export function state<T>(initial: T): { current: T } {
  return fromStore(writable(initial));
}

export function node(
  key: string,
  component: Component,
  props?: Readonly<Record<string, unknown>> | undefined,
  children?: (() => readonly TreeNode[]) | undefined,
): TreeNode {
  return { key, component, props, children };
}

/** Records every distinct system a probe was handed, in the order they came. */
export function systems(): { readonly all: InputSystem[]; seen(system: InputSystem | null): void } {
  const all: InputSystem[] = [];
  return {
    all,
    seen(system): void {
      if (system !== null && !all.includes(system)) all.push(system);
    },
  };
}
