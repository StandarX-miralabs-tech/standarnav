/**
 * Thirty lines of `react-dom/client` instead of a testing library: the adapter's
 * job is to be a correct React citizen, so the tests drive React directly —
 * `act`, real roots, real commits — rather than through something that smooths
 * over exactly the timing this file exists to get right.
 *
 * Test-only. No entry point references it, so nothing here ships.
 */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

declare global {
  // `var` is not a style choice here: it is the only declaration form that lands
  // on `globalThis`, which is where React looks for this flag.
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  readonly container: HTMLElement;
  render(node: ReactNode): void;
  unmount(): void;
}

const mounted: Mounted[] = [];

export function mount(node: ReactNode): Mounted {
  const container = document.createElement("div");
  document.body.append(container);
  let root: Root | null = null;

  act(() => {
    root = createRoot(container);
    root.render(node);
  });

  const handle: Mounted = {
    container,
    render(next: ReactNode): void {
      act(() => root?.render(next));
    },
    unmount(): void {
      act(() => root?.unmount());
      container.remove();
    },
  };
  mounted.push(handle);
  return handle;
}

export function fire(action: VoidFunction): void {
  act(action);
}

export function unmountAll(): void {
  for (const handle of mounted.splice(0, mounted.length)) handle.unmount();
}

export async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * Polls an assertion while React is allowed to commit on its own.
 *
 * Anything React learns about from outside its scheduler — an animation
 * finishing, a rAF landing — schedules its update outside `act`, and there is no
 * wrapping that fixes it: the update is scheduled by the browser, not by the
 * test. Polling *inside* `act` would be worse than the warning, because `act`
 * holds the update back until it exits and the assertion could never come true.
 * So the act environment is switched off for the wait, exactly as React's own
 * guidance for external updates says.
 */
export async function waitFor(assertion: () => void): Promise<void> {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await vi.waitFor(assertion);
  } finally {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  }
  await settle();
}
