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

  /**
   * Backspace means "stop manipulating this", and it is bound here rather than in the
   * keymap on purpose. `back` is one of the intents allowed inside a text entry
   * (`src/keymap.ts:164-169`), so a global Backspace row would erase a character and
   * leave the field with one press, and it would close the virtual keyboard instead
   * of erasing. Bound to the held control, it exists only while something is held.
   */
  function onBackspace(event: KeyboardEvent): void {
    if (event.key !== "Backspace" || pop === null) return;
    event.preventDefault();
    releaseOutsideTheBus(false);
  }

  function engage(): void {
    if (pop !== null) return;
    entry = read();
    setEngaged(true);
    document.addEventListener("keydown", onBackspace, { capture: true });
    pop = pushEngageScope(bus, {
      onAdjust: adjust,
      onRelease: (committed) => {
        pop = null;
        document.removeEventListener("keydown", onBackspace, { capture: true });
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
    document.removeEventListener("keydown", onBackspace, { capture: true });
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
 * A native `<select>` that actually opens a list.
 *
 * [ADR-0021](../docs/adr/0021-native-select-on-television.md) is right that the platform
 * popup is unreachable: it renders outside the document, the engine cannot see it, a pad
 * cannot open it, and the keys that do open it move a selection nothing on screen
 * reflects — then Escape commits that move rather than undoing it. So this never opens
 * it. What it opens instead is a list of real elements in the document, built from the
 * `<option>`s the `<select>` already carries.
 *
 * The first version of this recipe adjusted `selectedIndex` in place with no list at
 * all, and that was reported as exactly what it was: you cannot see the options, so you
 * have to guess them one press at a time. Three options hide the problem; thirty make it
 * unusable. A control called a dropdown has to drop something down.
 *
 * The `<select>` stays in the document and stays the value: the form submits it, a
 * screen reader gets a real listbox, and a phone still gets its own native wheel if the
 * application never attaches this. What this adds is the surface a television can
 * navigate, and the `<select>` itself is the trigger — which is the difference between
 * this and `attachListbox`, where the trigger is a `<button>` and there is no native
 * control underneath at all.
 *
 * Three mechanics are inherited from that sibling and are not obvious:
 * the list must carry `data-snav-trap` or the engine walks straight out of it, since the
 * scope is pushed as `base` and a base scope is asked even through a trap; the scope has
 * to click the focused option itself, because `select` cannot escape a trap so
 * `activateFocused` never runs inside one; and closing has to restore the focus to the
 * `<select>`, or the focus sits on an element that is now hidden and the engine has
 * nowhere to move from.
 *
 * The pointer is intercepted too. Letting a mouse open the platform popup while a pad
 * opens this one would ship two different controls wearing one element, and "it depends
 * how you opened it" is the kind of surprise this page exists to remove.
 */
export function attachNativeSelect(bus: IntentScopeHost, host: HTMLSelectElement): Listbox {
  const list = document.createElement("div");
  list.className = "native-select-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", host.getAttribute("aria-label") ?? "Options");
  list.setAttribute("data-snav", "container");
  // Half the recipe, and the half that is easy to leave out: without the trap a
  // direction walks out of the open list, because the scope below is a `base` one.
  list.setAttribute("data-snav-trap", "");
  list.hidden = true;
  host.insertAdjacentElement("afterend", list);

  let pop: VoidFunction | null = null;

  function options(): readonly HTMLButtonElement[] {
    return [...list.querySelectorAll<HTMLButtonElement>("button")];
  }

  function pick(index: number): void {
    host.selectedIndex = index;
    host.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  }

  /**
   * Rebuilt on every open rather than once on attach: a `<select>` is ordinary markup an
   * application may refill between two openings, and a list built once would go on
   * offering options that no longer exist.
   */
  function build(): void {
    list.replaceChildren();
    for (const [index, option] of [...host.options].entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === host.selectedIndex));
      button.textContent = option.textContent;
      button.disabled = option.disabled;
      button.addEventListener("click", () => pick(index));
      list.append(button);
    }
  }

  function close(): void {
    if (pop === null) return;
    const detach = pop;
    pop = null;
    detach();
    list.hidden = true;
    host.setAttribute("aria-expanded", "false");
    host.focus();
  }

  function open(): void {
    if (pop !== null) return;
    build();
    list.hidden = false;
    host.setAttribute("aria-expanded", "true");
    pop = bus.pushScope(
      (event: IntentEvent): boolean => {
        if (event.intent === "back") {
          close();
          return true;
        }
        if (event.intent === "select") {
          const focused = document.activeElement;
          if (!(focused instanceof HTMLElement) || !list.contains(focused)) return false;
          // Claiming it also suppresses the native Enter-to-click on a real keyboard,
          // so the option is picked once rather than twice.
          focused.click();
          return true;
        }
        return false;
      },
      { trapped: true },
    );
    (options()[host.selectedIndex] ?? options()[0])?.focus();
  }

  // A `<select>` is not a `<button>`, so nothing clicks it for us and nothing opens this
  // list on its own: `activateFocused` would call `.click()` on the element, which is
  // precisely the call that opens the platform popup. This scope claims A first, so that
  // call never happens (`src/input-system.ts:118-132`), and the system then calls
  // `preventDefault` on the key that carried the consumed intent (`:181`, in capture),
  // which is what stops a keyboard Enter or Space opening the popup itself.
  const popIdle = bus.pushScope((event: IntentEvent): boolean => {
    if (event.intent !== "select" || document.activeElement !== host) return false;
    open();
    return true;
  });

  const onPointer = (event: MouseEvent): void => {
    event.preventDefault();
    host.focus();
    open();
  };
  // `mousedown` rather than `click`: the platform popup opens on the press, so a
  // `click` listener would run after the thing it is meant to prevent.
  host.addEventListener("mousedown", onPointer);

  // A keyboard can still open the popup without producing an intent at all — Alt+Down is
  // the documented shortcut and the keymap drops anything carrying a modifier
  // (`src/keymap.ts:111-113`), so it never reaches a scope to be claimed.
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.altKey && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      open();
    }
  };
  host.addEventListener("keydown", onKeydown);

  host.setAttribute("aria-expanded", "false");

  return {
    open,
    close,
    isOpen: (): boolean => pop !== null,
    dispose(): void {
      host.removeEventListener("mousedown", onPointer);
      host.removeEventListener("keydown", onKeydown);
      close();
      popIdle();
      host.removeAttribute("aria-expanded");
      list.remove();
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

export interface Listbox {
  open(): void;
  close(): void;
  isOpen(): boolean;
  dispose(): void;
}

/**
 * What the package offers in place of a native `<select>` on a television: a trigger
 * and a list of real focusable elements in the document, which the engine navigates
 * like any other markup ([ADR-0021](../docs/adr/0021-native-select-on-television.md)).
 *
 * This one is not built on engage, and the contrast is the point. Engage is for a
 * control whose value the directions *change*; a list is a surface the directions
 * *move through*, so the mechanism is a trap, not an adjustment. While the list is
 * open the scope is `trapped`, which silences every component between it and the
 * bottom of the stack — and the spatial engine still moves the focus inside the list,
 * because it is pushed as a `base` scope and a base scope is asked even through a
 * trap. That is the case `base` was added for.
 *
 * Which means the scope alone does not confine the focus: a `base` scope is asked, so
 * the engine would happily move out of the list. `list` must carry `data-snav-trap`
 * for the confinement, and that is markup this function cannot supply — it is half
 * the recipe and the half that is easy to leave out.
 *
 * Opening goes through a click, where the slider needed its own scope: the trigger is
 * a `<button>` outside any trap, so the browser clicks it for a keyboard Enter and
 * `activateFocused` clicks it for a gamepad A, and neither needs a scope.
 *
 * Choosing cannot. A `trapped` scope swallows whatever it does not handle — `select`
 * is not one of the three intents allowed to escape a trap — so `dispatch` reports the
 * A as consumed and `activateFocused` never runs. Inside a trap, nothing clicks the
 * focused element for you, and the scope has to do it itself.
 */
export function attachListbox(
  bus: IntentScopeHost,
  trigger: HTMLButtonElement,
  list: HTMLElement,
  output: HTMLElement,
): Listbox {
  let pop: VoidFunction | null = null;
  const options = (): readonly HTMLButtonElement[] => [
    ...list.querySelectorAll<HTMLButtonElement>("button"),
  ];

  function close(): void {
    if (pop === null) return;
    const detach = pop;
    pop = null;
    detach();
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    // The focus was inside a list that is now hidden, and `isHidden` makes hidden
    // elements no candidates: without this the focus would be nowhere the engine
    // can move from.
    trigger.focus();
  }

  function open(): void {
    if (pop !== null) return;
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    pop = bus.pushScope(
      (event: IntentEvent): boolean => {
        if (event.intent === "back") {
          close();
          return true;
        }
        if (event.intent === "select") {
          const focused = document.activeElement;
          if (!(focused instanceof HTMLElement) || !list.contains(focused)) return false;
          // Claiming it also suppresses the native Enter-to-click on a real keyboard,
          // so the option is picked once rather than twice.
          focused.click();
          return true;
        }
        return false;
      },
      { trapped: true },
    );
    const current = options().find((option) => option.dataset.value === output.textContent);
    (current ?? options()[0])?.focus();
  }

  const onTrigger = (): void => open();
  const onPick = (event: Event): void => {
    const picked = event.currentTarget;
    if (picked instanceof HTMLElement) output.textContent = picked.dataset.value ?? "";
    close();
  };

  trigger.addEventListener("click", onTrigger);
  for (const option of options()) option.addEventListener("click", onPick);
  list.hidden = true;
  trigger.setAttribute("aria-expanded", "false");

  return {
    open,
    close,
    isOpen: (): boolean => pop !== null,
    dispose(): void {
      trigger.removeEventListener("click", onTrigger);
      for (const option of options()) option.removeEventListener("click", onPick);
      close();
    },
  };
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
