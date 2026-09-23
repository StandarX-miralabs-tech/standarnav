/**
 * `createApp` and `nextTick` instead of a testing library, for the reason the React
 * harness gives: the adapter's job is to be a correct Vue citizen, so the tests drive Vue
 * directly — real apps, real mounts, real flushes.
 *
 * Every Vue warning is collected and fails the test that caused it: a prop Vue rejected
 * or an injection it could not resolve is a defect of the adapter even when every
 * assertion still holds.
 *
 * Test-only. No entry point references it, so nothing here ships.
 */

import { type App, createApp, defineComponent, nextTick, type VNodeChild } from "vue";

export interface Mounted {
  readonly container: HTMLElement;
  unmount(): void;
}

const mounted: Mounted[] = [];
const warnings: string[] = [];

/**
 * Mounts a root whose render function is `render`. Whatever reactive state it reads is
 * how a test re-renders the tree: change the state, then `settle()`.
 */
export function mount(
  render: () => VNodeChild,
  container: HTMLElement = document.createElement("div"),
): Mounted {
  if (!container.isConnected) document.body.append(container);
  const app: App = createApp(defineComponent(() => render));
  app.config.warnHandler = (message) => {
    warnings.push(message);
  };
  app.mount(container);

  const handle: Mounted = {
    container,
    unmount(): void {
      app.unmount();
      container.remove();
    },
  };
  mounted.push(handle);
  return handle;
}

export function unmountAll(): void {
  for (const handle of mounted.splice(0, mounted.length)) handle.unmount();
}

/** The Vue warnings since the last call, which empties the list. */
export function takeWarnings(): string[] {
  return warnings.splice(0, warnings.length);
}

/** Two ticks: a flush can queue a watcher whose own flush re-renders the tree. */
export async function settle(): Promise<void> {
  await nextTick();
  await nextTick();
}
