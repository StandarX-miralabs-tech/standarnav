/**
 * Engage mode: the grammar shared by every control that holds a value.
 *
 * A gamepad has no way to drag. So A takes hold of a slider, the directional intents
 * become adjustments instead of navigation, and A or B lets go — B being the one that
 * puts the value back where it was. Slider, number-input, splitter and wheel-picker
 * all consume this same scope, which is why the mechanic lives here and not in the
 * first component that needed it.
 *
 * `back` is consumed on purpose. Without that, B would both release the control and
 * pop the layer underneath it, and engaging a slider inside a popover would close the
 * popover on the way out.
 */

import type { IntentScopeHost } from "./intent-bus";
import type { IntentEvent } from "./types";

export type EngageIntent =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "pageUp"
  | "pageDown"
  | "home"
  | "end";

const ENGAGE_INTENTS: ReadonlySet<string> = new Set<EngageIntent>([
  "moveUp",
  "moveDown",
  "moveLeft",
  "moveRight",
  "pageUp",
  "pageDown",
  "home",
  "end",
]);

export interface EngageOptions {
  readonly onAdjust: (intent: EngageIntent, event: IntentEvent) => void;
  /** `committed` is false when the user backed out — restore the entry value. */
  readonly onRelease?: ((committed: boolean) => void) | undefined;
}

/**
 * Returns a dispose that detaches silently: unmounting a control is not the user
 * releasing it, so `onRelease` fires only for an actual A or B.
 */
export function pushEngageScope(host: IntentScopeHost, options: EngageOptions): VoidFunction {
  let released = false;
  let pop: VoidFunction = () => {};

  const release = (committed: boolean): void => {
    if (released) return;
    released = true;
    pop();
    options.onRelease?.(committed);
  };

  pop = host.pushScope((event: IntentEvent): boolean => {
    if (ENGAGE_INTENTS.has(event.intent)) {
      options.onAdjust(event.intent as EngageIntent, event);
      return true;
    }
    if (event.intent === "select") {
      release(true);
      return true;
    }
    if (event.intent === "back") {
      release(false);
      return true;
    }
    return false;
  });

  return () => {
    released = true;
    pop();
  };
}
