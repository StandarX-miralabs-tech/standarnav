/**
 * `@standarx/nav/keyboard` — an on-screen keyboard for a surface with no keyboard.
 *
 * The keys are real focusable buttons and the spatial engine navigates them with the
 * intents that already exist. The alternative, a highlighted key while the field keeps
 * focus, is a virtual cursor, and refusing that is ADR-0005 — see ADR-0022 for the
 * whole record, including why a layout is data passed in rather than registered.
 *
 * Two things here follow from the bus rather than from any choice of this module. The
 * open keyboard's container carries `data-snav-trap`, because a trapped scope does not
 * confine the focus on its own: the engine is a `base` scope and is asked through a trap
 * on purpose. And the scope claims `select` itself, because inside a trap
 * `activateFocused` stands down, so nothing else clicks the focused key.
 */

import { addDomEvent } from "../dom/event";
import { getEventTarget, isHTMLElement } from "../dom/query";
import type { InputPlugin, InputPluginContext } from "../input-system";
import { isTextEntryTarget } from "../keymap";
import { focusElement } from "../tabbable";
import type { IntentEvent } from "../types";

/** Written on the field while the keyboard is open: it is not `:focus`, the keys are. */
export const EDITING_ATTRIBUTE = "data-snav-editing";

export interface KeyboardKey {
  /** What the key shows. The only string a user reads. */
  readonly label: string;
  /** What it types. Absent for an action key. */
  readonly value?: string | undefined;
  /** What it does instead of typing. */
  readonly action?: "backspace" | "space" | "enter" | "shift" | "layer" | "close" | undefined;
  /** Label and value while shift is on. Both uppercased when absent. */
  readonly shift?: { readonly label: string; readonly value: string } | undefined;
  /** Width in key units; 1 when absent. */
  readonly span?: number | undefined;
  /** Which layer `action: "layer"` switches to. */
  readonly layer?: string | undefined;
}

/**
 * A string is one key per character, label and value alike — which is most of every
 * letter layout. Expanding it here rather than in each layout is what lets a layout be
 * literal data with no function in it: `"qwertyuiop"` is data, and thirty objects
 * spelling the same thing out would be paid again by every language that ships.
 */
export type KeyboardRow = string | readonly KeyboardKey[];

export interface KeyboardLayout {
  /** Stable, for an application's own switcher. */
  readonly id: string;
  /** BCP 47 tags. Documentation and language matching, never behaviour. */
  readonly languages: readonly string[];
  readonly layers: Readonly<Record<string, readonly KeyboardRow[]>>;
  readonly initialLayer: string;
}

export interface KeyboardOptions {
  readonly layout: KeyboardLayout;
  /** Where the keys are appended. The field's own document body by default. */
  readonly container?: HTMLElement | null | undefined;
  /**
   * `gamepad` opens only when the modality is a pad, which is why it is the default: a
   * laptop with a real keyboard focusing a field must not get one of these in its way.
   */
  readonly openOn?: "gamepad" | "focus" | "manual" | undefined;
}

export interface KeyboardPlugin extends InputPlugin {
  open(field: HTMLElement): void;
  close(): void;
  isOpen(): boolean;
  /** The field being edited, or `null`. */
  target(): HTMLElement | null;
}

type EditableField = HTMLInputElement | HTMLTextAreaElement;

function isEditableField(node: unknown): node is EditableField {
  return node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement;
}

function renderedLabel(key: KeyboardKey, shifted: boolean): string {
  if (!shifted) return key.label;
  return key.shift?.label ?? key.label.toUpperCase();
}

function typedValue(key: KeyboardKey, shifted: boolean): string | undefined {
  if (key.value === undefined) return undefined;
  if (!shifted) return key.value;
  return key.shift?.value ?? key.value.toUpperCase();
}

/**
 * Assigns `value` through the prototype's own setter rather than through the element.
 *
 * This is not a style choice. React instruments a controlled field by installing a
 * `value` accessor on the **instance**, and it uses what that accessor last saw to decide
 * whether an `input` event represents a real change. Assigning `field.value` goes through
 * that accessor, so React's record is updated before the event arrives, React concludes
 * nothing changed, `onChange` never fires, and the next render puts the old value back —
 * the field visibly rejects the keystroke. Going through the prototype leaves the
 * instance record stale, which is what makes the change visible.
 *
 * It only matters on the no-selection path: `setRangeText` does not touch the setter at
 * all, so the ordinary case never had the problem. Both paths are pinned by tests in
 * `src/react/react.browser.test.tsx` against the declared peer floor and the current
 * version (ADR-0022, decision 5).
 */
function assignValue(field: EditableField, next: string): void {
  const prototype =
    field instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (setter === undefined) {
    field.value = next;
    return;
  }
  setter.call(field, next);
}

/**
 * `beforeinput` first and cancelable, so an application with a mask or a length limit
 * refuses a synthetic keystroke exactly as it would refuse a physical one — a keyboard
 * that mutated the value first would already have lied to it. Then the mutation, then
 * `input`, which is the order the platform uses.
 */
function edit(field: EditableField, inputType: string, data: string | null): boolean {
  const before = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType,
    data,
  });
  if (!field.dispatchEvent(before)) return false;

  const start = field.selectionStart;
  const end = field.selectionEnd;
  const deleting = inputType === "deleteContentBackward";

  if (start === null || end === null) {
    // `email`, `number`, `date` and the rest expose no selection at all, and
    // `setRangeText` throws `InvalidStateError` on them — yet `isTextEntryTarget` calls
    // them text entries, correctly, so the keyboard does open on them. There the caret
    // is always at the end, so the whole value is the range.
    if (deleting) {
      if (field.value === "") return false;
      assignValue(field, field.value.slice(0, -1));
    } else {
      assignValue(field, field.value + (data ?? ""));
    }
  } else if (deleting) {
    // A collapsed caret deletes the character before it; a selection deletes itself.
    // `setRangeText` rather than a truncation, so a caret mid-string behaves.
    const from = start === end ? Math.max(0, start - 1) : start;
    if (from === end) return false;
    field.setRangeText("", from, end, "end");
  } else {
    field.setRangeText(data ?? "", start, end, "end");
  }

  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
  return true;
}

export function keyboardPlugin(options: KeyboardOptions): KeyboardPlugin {
  const openOn = options.openOn ?? "gamepad";
  let context: InputPluginContext | null = null;
  let root: HTMLElement | null = null;
  let field: EditableField | null = null;
  let pop: VoidFunction | null = null;
  let layer = options.layout.initialLayer;
  let shifted = false;
  // `close()` gives the focus back to the field, which fires `focusin` again. Without
  // this the keyboard would reopen on its own way out, forever.
  let closing = false;

  function render(): void {
    const box = root;
    if (box === null) return;
    box.replaceChildren();
    const rows = options.layout.layers[layer] ?? [];
    for (const row of rows) {
      const line = box.ownerDocument.createElement("div");
      line.dataset.snavKeyboardRow = "";
      const keys: readonly KeyboardKey[] =
        typeof row === "string"
          ? [...row].map((character) => ({ label: character, value: character }))
          : row;
      for (const key of keys) {
        const button = box.ownerDocument.createElement("button");
        button.type = "button";
        button.textContent = renderedLabel(key, shifted);
        if (key.span !== undefined) button.style.flexGrow = String(key.span);
        button.addEventListener("click", () => activate(key));
        line.append(button);
      }
      box.append(line);
    }
  }

  function activate(key: KeyboardKey): void {
    const target = field;
    if (target === null) return;

    if (key.action === undefined) {
      const value = typedValue(key, shifted);
      if (value !== undefined) edit(target, "insertText", value);
      // A shift that types one capital and lets go, which is what a remote user means.
      if (shifted) {
        shifted = false;
        render();
      }
      return;
    }

    switch (key.action) {
      case "backspace":
        edit(target, "deleteContentBackward", null);
        return;
      case "space":
        edit(target, "insertText", " ");
        return;
      case "enter":
        // Not a newline: on a single-line field it means "done", and a textarea that
        // wants newlines can put an explicit key with `value: "\n"` in its layout.
        close();
        return;
      case "shift":
        shifted = !shifted;
        render();
        return;
      case "layer":
        if (key.layer !== undefined && options.layout.layers[key.layer] !== undefined) {
          layer = key.layer;
          shifted = false;
          render();
        }
        return;
      case "close":
        close();
        return;
    }
  }

  function open(next: HTMLElement): void {
    // `contenteditable` is a text entry and the keyboard declines it in v0: inserting
    // into a range is easy and deleting one character backward across element
    // boundaries is not, and a keyboard that types but cannot erase is worse than one
    // that says no (ADR-0022, decision 5).
    if (!isEditableField(next) || pop !== null || context === null) return;

    field = next;
    layer = options.layout.initialLayer;
    shifted = false;

    const doc = next.ownerDocument;
    const box = doc.createElement("div");
    box.dataset.snav = "container";
    box.dataset.snavTrap = "";
    box.dataset.snavKeyboard = options.layout.id;
    root = box;
    render();
    (options.container ?? doc.body).append(box);
    next.setAttribute(EDITING_ATTRIBUTE, "");

    // The caret goes to the end, and in v0 that is the only place it can be: the
    // directions navigate the keys, so there is nothing left to move a caret with. A
    // programmatic `focus()` leaves it at 0, which would type a space in front of what
    // is already in the field. Caret movement is a v1 item.
    if (next.selectionStart !== null) {
      const end = next.value.length;
      next.setSelectionRange(end, end);
    }

    pop = context.bus.pushScope(
      (event: IntentEvent): boolean => {
        if (event.intent === "back") {
          // Closes and keeps what was typed, deliberately unlike engage mode where B
          // restores: a slider is re-set with one more press and thirty seconds of
          // typing on a remote is not (ADR-0022, decision 8).
          close();
          return true;
        }
        if (event.intent !== "select") return false;
        const focused = doc.activeElement;
        if (!isHTMLElement(focused) || !box.contains(focused)) return false;
        focused.click();
        return true;
      },
      { trapped: true },
    );

    const first = box.querySelector("button");
    if (first instanceof HTMLElement) focusElement(first);
  }

  function close(): void {
    if (pop === null) return;
    const detach = pop;
    pop = null;
    detach();

    const leaving = field;
    field = null;
    root?.remove();
    root = null;

    if (leaving === null) return;
    leaving.removeAttribute(EDITING_ATTRIBUTE);
    closing = true;
    focusElement(leaving);
    closing = false;
  }

  return {
    name: "keyboard",
    setup(pluginContext): VoidFunction {
      context = pluginContext;
      const teardown = addDomEvent(pluginContext.doc, "focusin", (event: Event) => {
        if (closing || openOn === "manual") return;
        const target = getEventTarget(event);
        if (!isHTMLElement(target) || !isTextEntryTarget(target)) return;
        if (openOn === "gamepad" && pluginContext.getModality() !== "gamepad") return;
        open(target);
      });
      return () => {
        close();
        teardown();
        context = null;
      };
    },
    open,
    close,
    isOpen: (): boolean => pop !== null,
    target: (): HTMLElement | null => field,
  };
}
