/**
 * The four controls that hold a value, built on `pushEngageScope`. The engine ships
 * the grammar — A takes hold, the directions adjust, B puts the value back — and
 * nothing that uses it, which is why these live here and are exercised by
 * `src/engage.browser.test.ts` rather than described in prose.
 *
 * Two constraints shape every one of them, and neither is obvious from the engine's
 * surface.
 *
 * A control must not be a text-entry target. `isTextEntryTarget` calls every `<input>`
 * one unless its type is in `NON_TEXT_INPUT_TYPES`, and an intent aimed at a text
 * entry is dropped before it reaches the bus unless it is `back`, `tabNext`, `tabPrev`
 * or `contextMenu`. So `<input type="number">` can never be engaged: `select` is not on
 * that list, so A never arrives. `range` *is* on the list, which is why the slider
 * below is a native one and the number field is a button that owns a value.
 *
 * Entering engage has to go through a scope, not through a click. `activateFocused`
 * clicks the focused element for a gamepad `select`, but deliberately not for a
 * keyboard one — the browser is already clicking there — and a native range input has
 * no click behaviour to borrow either way. A scope that claims `select` while the
 * control is focused is the only route that behaves identically for a pad, a remote
 * and a keyboard.
 */

import { type EngageIntent, pushEngageScope } from "../src/engage";
import type { IntentScopeHost } from "../src/intent-bus";
import type { IntentEvent } from "../src/types";

/** Written on the control while it is held, so CSS and a test can both see it. */
export const ENGAGED_ATTRIBUTE = "data-engaged";

export interface EngageableOptions {
  readonly host: HTMLElement;
  readonly read: () => number;
  readonly write: (value: number) => void;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  /**
   * Multiples of `step`, per intent. Written out rather than derived from an axis,
   * because the polarity is not shared: on a quantity Up means more, and on a picker
   * Down means the next item. A single convention here would ship one of the two
   * backwards. Intents left out are not adjustments and fall through to the engine.
   */
  readonly steps: Readonly<Partial<Record<EngageIntent, number>>>;
  /**
   * The cycle length in value units, for a control that comes round; absent means it
   * stops at its ends. Not derived from `max - min`: three months span two, so a
   * modulo of the span would make January step up to February instead of March.
   */
  readonly wrap?: number | undefined;
  readonly onEngagedChange?: ((engaged: boolean) => void) | undefined;
}

export interface Engageable {
  engaged(): boolean;
  dispose(): void;
}

const PAGE_FACTOR = 10;

export function attachEngageable(bus: IntentScopeHost, options: EngageableOptions): Engageable {
  const { host, read, write, min, max, step } = options;
  let pop: VoidFunction | null = null;
  let entry = 0;

  function clamp(value: number): number {
    const cycle = options.wrap;
    if (cycle !== undefined && cycle > 0) {
      // Modulo twice: the first one is still negative for a value below `min`, which
      // is what stepping back off the first item produces.
      return min + ((((value - min) % cycle) + cycle) % cycle);
    }
    return Math.min(max, Math.max(min, value));
  }

  function by(delta: number): void {
    write(clamp(read() + delta));
  }

  function adjust(intent: EngageIntent): void {
    if (intent === "home") {
      write(min);
      return;
    }
    if (intent === "end") {
      write(max);
      return;
    }
    const multiple = options.steps[intent];
    if (multiple !== undefined) by(step * multiple);
  }

  function setEngaged(on: boolean): void {
    if (on) host.setAttribute(ENGAGED_ATTRIBUTE, "");
    else host.removeAttribute(ENGAGED_ATTRIBUTE);
    options.onEngagedChange?.(on);
  }

  function engage(): void {
    if (pop !== null) return;
    entry = read();
    setEngaged(true);
    pop = pushEngageScope(bus, {
      onAdjust: adjust,
      onRelease: (committed) => {
        pop = null;
        if (!committed) write(entry);
        setEngaged(false);
      },
    });
  }

  /**
   * `pushEngageScope` only releases on an actual A or B; its dispose detaches in
   * silence. So an exit the user did not ask for — tabbing away, or the control
   * being removed — has to redo the bookkeeping here. Tab is the real case: engage
   * consumes the directions but returns `tabNext` to the layer underneath, so focus
   * can leave a control that is still holding the arrows.
   */
  function releaseOutsideTheBus(committed: boolean): void {
    if (pop === null) return;
    const detach = pop;
    pop = null;
    detach();
    if (!committed) write(entry);
    setEngaged(false);
  }

  // Claims A only for the focused control, so every attached widget can hold this
  // scope for its whole life. It sits above the spatial engine's `base` scope, and
  // an engage scope opened by `engage()` sits above this one — which is why a held
  // control answers A itself instead of engaging a second time.
  const popIdle = bus.pushScope((event: IntentEvent): boolean => {
    if (event.intent !== "select" || document.activeElement !== host) return false;
    engage();
    return true;
  });

  const onFocusOut = (): void => releaseOutsideTheBus(true);
  host.addEventListener("focusout", onFocusOut);

  return {
    engaged: (): boolean => pop !== null,
    dispose(): void {
      host.removeEventListener("focusout", onFocusOut);
      releaseOutsideTheBus(true);
      popIdle();
    },
  };
}

/**
 * A native `<input type="range">`, which works because `range` is one of the types
 * `isTextEntryTarget` refuses to call text entry. The native arrow handling is not a
 * conflict: engage claims the direction, the system calls `preventDefault` on the key
 * that carried it, and the value moves once — ours.
 */
export function attachSlider(bus: IntentScopeHost, host: HTMLInputElement): Engageable {
  return attachEngageable(bus, {
    host,
    steps: { moveRight: 1, moveLeft: -1, pageUp: PAGE_FACTOR, pageDown: -PAGE_FACTOR },
    min: Number(host.min || 0),
    max: Number(host.max || 100),
    step: Number(host.step || 1),
    read: () => Number(host.value),
    write: (value) => {
      host.value = String(value);
      host.dispatchEvent(new Event("input", { bubbles: true }));
    },
  });
}

/**
 * The number field, and the reason this recipe exists at all: the control is a
 * `<button>` that owns the value, never a focused `<input type="number">`. A number
 * input is a text-entry target, so `select` is dropped before the bus and A cannot
 * reach it. `output` is where the value is read out; the button keeps the label.
 */
export function attachStepper(
  bus: IntentScopeHost,
  host: HTMLButtonElement,
  output: HTMLElement,
  range: { readonly min: number; readonly max: number; readonly step: number },
): Engageable {
  let value = Number(output.textContent ?? range.min);
  return attachEngageable(bus, {
    host,
    // A quantity: Up is more. The picker below declares the opposite on purpose.
    steps: { moveUp: 1, moveDown: -1, pageUp: PAGE_FACTOR, pageDown: -PAGE_FACTOR },
    min: range.min,
    max: range.max,
    step: range.step,
    read: () => value,
    write: (next) => {
      value = next;
      output.textContent = String(next);
    },
  });
}

/**
 * Up and down move by one and come round, which is the whole difference between a
 * picker and a slider: `home` and `end` still jump to the real ends, so wrapping
 * never makes a value unreachable.
 */
export function attachWheelPicker(
  bus: IntentScopeHost,
  host: HTMLElement,
  values: readonly string[],
  output: HTMLElement,
): Engageable {
  let index = 0;
  const write = (next: number): void => {
    index = next;
    output.textContent = values[next] ?? "";
  };
  write(0);
  return attachEngageable(bus, {
    host,
    // Down is the next item, which is the reverse of the stepper's polarity.
    steps: { moveDown: 1, moveUp: -1, pageDown: PAGE_FACTOR, pageUp: -PAGE_FACTOR },
    min: 0,
    max: values.length - 1,
    step: 1,
    wrap: values.length,
    read: () => index,
    write,
  });
}

/**
 * Resizes the pane before it by moving a grid fraction. A splitter is the one control
 * here whose value is not its own display: the number lives in the parent's
 * `grid-template-columns`, so the readout has to be asked of the layout.
 */
export function attachSplitter(
  bus: IntentScopeHost,
  host: HTMLElement,
  pane: HTMLElement,
): Engageable {
  let percent = 50;
  return attachEngageable(bus, {
    host,
    steps: { moveRight: 1, moveLeft: -1, pageUp: PAGE_FACTOR, pageDown: -PAGE_FACTOR },
    min: 10,
    max: 90,
    step: 2,
    read: () => percent,
    write: (next) => {
      percent = next;
      pane.style.flexBasis = `${next}%`;
      host.setAttribute("aria-valuenow", String(next));
    },
  });
}
