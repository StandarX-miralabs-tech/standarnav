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
 *
 * The last row of the box is not keys: it is a preview of the field, with a caret drawn
 * where `selectionStart` says the next character goes. The keys hold the focus, so the
 * field draws no caret of its own and on a small screen the box may cover it — the
 * preview is what the user reads instead. It is repainted from the field on every
 * change and holds no position of its own (ADR-0022, the amendment on the preview).
 */

import { addDomEvent } from "../dom/event";
import { getEventTarget, isHTMLElement } from "../dom/query";
import type { InputPlugin, InputPluginContext } from "../input-system";
import { isTextEntryTarget } from "../keymap";
import { focusElement } from "../tabbable";
import type { IntentEvent } from "../types";

/** Written on the field while the keyboard is open: it is not `:focus`, the keys are. */
export const EDITING_ATTRIBUTE = "data-snav-editing";
/** On the box, carrying the layout's id. */
export const KEYBOARD_ATTRIBUTE = "data-snav-keyboard";
/** On each row of keys: `[data-snav-keyboard-row] button` is a key, and nothing else is. */
export const ROW_ATTRIBUTE = "data-snav-keyboard-row";
/** On the preview row, the focusable mirror of the field at the bottom of the box. */
export const PREVIEW_ATTRIBUTE = "data-snav-keyboard-preview";
/** On the caret drawn inside the preview. */
export const CARET_ATTRIBUTE = "data-snav-keyboard-caret";

/**
 * The paint, inline, for the same reason the focus ring carries its own: a plugin that
 * needs a stylesheet imported is a plugin that ships broken to whoever forgets. Before
 * this the box had no style at all, so it inherited the page's block layout and drew
 * itself full-bleed — 1280 by 304 on a 1280 by 800 viewport, 38% of the screen, over
 * whatever it landed on.
 *
 * `1600` is a rung below the focus ring's `1700`, so the ring still draws over the key
 * it is ringing, and above an ordinary dialog. Sizes are in `em` so a surface sets the
 * whole keyboard's scale with `--snav-keyboard-font-size` and nothing else. The text
 * colour is declared because the background is: without it a light page paints its own
 * near-black text onto the near-black box.
 */
const KEYBOARD_PAINT =
  "position:fixed;z-index:var(--snav-keyboard-z-index, 1600);" +
  "display:flex;flex-direction:column;gap:0.25em;width:max-content;max-width:100vw;" +
  "padding:0.5em;border-radius:0.5em;font-size:var(--snav-keyboard-font-size, 1rem);" +
  "color:var(--snav-keyboard-color, #f4f4f5);" +
  "background:var(--snav-keyboard-background, #16161c);" +
  "box-shadow:var(--snav-keyboard-shadow, 0 0.5em 2em rgb(0 0 0 / 45%))";

const ROW_PAINT = "display:flex;gap:0.25em";

/**
 * `width:0` keeps the preview out of the box's `max-content` width, so a long value
 * scrolls inside the row instead of widening the keyboard back to the full-bleed defect
 * the box paint was added to fix; `min-width:100%` then stretches it to the rows.
 */
const PREVIEW_PAINT =
  "width:0;min-width:100%;box-sizing:border-box;overflow:hidden;white-space:pre;" +
  "padding:0.25em 0.5em;border:1px solid;border-radius:0.25em";

const CARET_PAINT =
  "display:inline-block;width:0.1em;height:1.1em;margin-right:-0.1em;" +
  "vertical-align:text-bottom;background:currentColor";

/** Below the field like a `<select>` menu, flipped above when the room is not there. */
const GAP = 4;

function place(box: HTMLElement, field: HTMLElement): void {
  const view = box.ownerDocument.defaultView;
  if (view === null) return;
  const anchor = field.getBoundingClientRect();
  const self = box.getBoundingClientRect();

  const below = view.innerHeight - anchor.bottom - GAP;
  const top =
    below >= self.height || below >= anchor.top - GAP
      ? Math.min(anchor.bottom + GAP, view.innerHeight - self.height)
      : anchor.top - GAP - self.height;
  const left = Math.max(GAP, Math.min(anchor.left, view.innerWidth - self.width - GAP));

  // All four insets, so a stylesheet that sets `bottom` or `right` on the box cannot
  // stretch it from the top written here down to wherever it says.
  box.style.inset = `${Math.max(GAP, top)}px auto auto ${left}px`;
}

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
   * `activate` is the default, and it means what it says: a click on the field, or a
   * `select` on it from any device. A focus alone never opens the keyboard, because a
   * focus is not a decision — under `pointerFollowsFocus` a mouse crossing the page
   * focuses whatever it passes over, and `focus` turned every hover into a keyboard.
   *
   * `focus` keeps the old behaviour for a surface that wants it, `gamepad` restricts
   * that to a pad modality, and `manual` leaves it all to `open()`.
   */
  readonly openOn?: "activate" | "focus" | "gamepad" | "manual" | undefined;
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

function lineStart(value: string, at: number): number {
  return value.slice(0, at).lastIndexOf("\n") + 1;
}

function lineEnd(value: string, at: number): number {
  const next = value.indexOf("\n", at);
  return next === -1 ? value.length : next;
}

export function keyboardPlugin(options: KeyboardOptions): KeyboardPlugin {
  const openOn = options.openOn ?? "activate";
  let context: InputPluginContext | null = null;
  let root: HTMLElement | null = null;
  let keys: HTMLElement | null = null;
  let preview: HTMLElement | null = null;
  let field: EditableField | null = null;
  let pop: VoidFunction | null = null;
  let layer = options.layout.initialLayer;
  let shifted = false;
  // The caret of a field that exposes no selection — `email`, `number` and the rest,
  // where `selectionStart` is null and `setRangeText` throws. The field has no position
  // to mirror, so the plugin owns one for as long as it is open, clamped to the value
  // on every read because an application may rewrite the value underneath it.
  let ownCaret = 0;
  // `close()` gives the focus back to the field, which fires `focusin` again. Without
  // this the keyboard would reopen on its own way out, forever.
  let closing = false;

  function caretOf(target: EditableField): number {
    return target.selectionStart ?? Math.min(ownCaret, target.value.length);
  }

  function setCaret(at: number): void {
    const target = field;
    if (target === null) return;
    const clamped = Math.max(0, Math.min(target.value.length, at));
    if (target.selectionStart === null) ownCaret = clamped;
    else target.setSelectionRange(clamped, clamped);
    paint();
  }

  /**
   * Reads the field and draws it: the text with a bar at the caret, one line whatever
   * the value. A newline is shown as one glyph so the row never grows taller and every
   * index of the value is one character of the row; a password is shown as bullets.
   */
  function paint(): void {
    const target = field;
    const row = preview;
    if (target === null || row === null) return;
    const at = caretOf(target);
    const shown =
      target.type === "password"
        ? "•".repeat(target.value.length)
        : target.value.replace(/\n/g, "↵");
    const caret = row.ownerDocument.createElement("span");
    caret.setAttribute(CARET_ATTRIBUTE, "");
    caret.style.cssText = CARET_PAINT;
    row.replaceChildren(shown.slice(0, at), caret, shown.slice(at));
    caret.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  /**
   * `beforeinput` first and cancelable, so an application with a mask or a length limit
   * refuses a synthetic keystroke exactly as it would refuse a physical one — a keyboard
   * that mutated the value first would already have lied to it. Then the mutation, then
   * `input`, which is the order the platform uses.
   */
  function edit(target: EditableField, inputType: string, data: string | null): boolean {
    const before = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType,
      data,
    });
    if (!target.dispatchEvent(before)) return false;

    const start = target.selectionStart;
    const end = target.selectionEnd;
    const deleting = inputType === "deleteContentBackward";

    if (start === null || end === null) {
      // No selection to edit through — the plugin's own caret says where, and the whole
      // value is rewritten around it. Named types are examples, not a rule: WebKit gives
      // `type="date"` a selection that Chromium and Firefox do not.
      const value = target.value;
      const at = caretOf(target);
      if (deleting) {
        if (at === 0) return false;
        assignValue(target, value.slice(0, at - 1) + value.slice(at));
        ownCaret = at - 1;
      } else {
        const text = data ?? "";
        assignValue(target, value.slice(0, at) + text + value.slice(at));
        ownCaret = at + text.length;
      }
    } else if (deleting) {
      // A collapsed caret deletes the character before it; a selection deletes itself.
      // `setRangeText` rather than a truncation, so a caret mid-string behaves.
      const from = start === end ? Math.max(0, start - 1) : start;
      if (from === end) return false;
      target.setRangeText("", from, end, "end");
    } else {
      target.setRangeText(data ?? "", start, end, "end");
    }

    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data }));
    return true;
  }

  /**
   * Rebuilds the keys and puts the focus back on the one at the same row and column.
   * `replaceChildren` destroys the focused key, and a focus that falls to `body` walks
   * out of the keyboard on the next direction — found on a real page, on every engine.
   */
  function render(): void {
    const host = keys;
    if (host === null) return;
    const doc = host.ownerDocument;
    const focused = doc.activeElement;
    const line = focused?.parentElement ?? null;
    const row =
      line !== null && line.parentElement === host ? [...host.children].indexOf(line) : -1;
    const column = focused !== null && line !== null ? [...line.children].indexOf(focused) : -1;

    const rows = options.layout.layers[layer] ?? [];
    const lines: HTMLElement[] = [];
    for (const source of rows) {
      const next = doc.createElement("div");
      next.setAttribute(ROW_ATTRIBUTE, "");
      next.style.cssText = ROW_PAINT;
      const entries: readonly KeyboardKey[] =
        typeof source === "string"
          ? [...source].map((character) => ({ label: character, value: character }))
          : source;
      for (const key of entries) {
        const button = doc.createElement("button");
        button.type = "button";
        button.textContent = renderedLabel(key, shifted);
        if (key.span !== undefined) button.style.flexGrow = String(key.span);
        button.addEventListener("click", () => activate(key));
        next.append(button);
      }
      lines.push(next);
    }
    host.replaceChildren(...lines);

    if (row === -1) return;
    const landing = lines[Math.min(row, lines.length - 1)];
    if (landing === undefined) return;
    const key = landing.children[Math.min(column, landing.children.length - 1)];
    if (key instanceof HTMLElement) focusElement(key);
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

  /**
   * The directions while the preview row has the focus. The row spans the whole box,
   * so nothing is to its left or right and those two are free to move the caret; up
   * and down move a line in a textarea and hand over to the engine on the first and
   * last line, which is how the focus leaves the row. No mode to enter, nothing for
   * `back` to mean but "close".
   */
  function moveCaret(intent: string): boolean {
    const target = field;
    if (target === null) return false;
    const value = target.value;
    const at = caretOf(target);
    const start = lineStart(value, at);
    switch (intent) {
      case "moveLeft":
        setCaret(at - 1);
        return true;
      case "moveRight":
        setCaret(at + 1);
        return true;
      case "home":
        setCaret(start);
        return true;
      case "end":
        setCaret(lineEnd(value, at));
        return true;
      case "pageUp":
        setCaret(0);
        return true;
      case "pageDown":
        setCaret(value.length);
        return true;
      case "moveUp": {
        if (start === 0) return false;
        setCaret(Math.min(lineStart(value, start - 1) + at - start, start - 1));
        return true;
      }
      case "moveDown": {
        const end = lineEnd(value, at);
        if (end === value.length) return false;
        setCaret(Math.min(end + 1 + at - start, lineEnd(value, end + 1)));
        return true;
      }
    }
    return false;
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
    box.setAttribute(KEYBOARD_ATTRIBUTE, options.layout.id);
    box.style.cssText = KEYBOARD_PAINT;
    const host = doc.createElement("div");
    host.style.display = "contents";
    const row = doc.createElement("div");
    row.tabIndex = 0;
    row.setAttribute(PREVIEW_ATTRIBUTE, "");
    row.style.cssText = PREVIEW_PAINT;
    box.append(host, row);
    root = box;
    keys = host;
    preview = row;
    render();

    (options.container ?? doc.body).append(box);
    // The caret starts at the end. A programmatic `focus()` leaves it at 0, which would
    // type in front of what is already there; from here the preview row moves it. Set
    // once the box is in the document, so the paint can scroll the caret into view.
    setCaret(next.value.length);
    // The box has to be laid out before it can be measured against the field, and
    // `width: max-content` means its width is not knowable until then.
    place(box, next);
    next.setAttribute(EDITING_ATTRIBUTE, "");

    pop = context.bus.pushScope(
      (event: IntentEvent): boolean => {
        if (event.intent === "back") {
          // Closes and keeps what was typed, deliberately unlike engage mode where B
          // restores: a slider is re-set with one more press and thirty seconds of
          // typing on a remote is not (ADR-0022, decision 8).
          close();
          return true;
        }
        const focused = doc.activeElement;
        if (focused === row) return moveCaret(event.intent);
        if (event.intent !== "select") return false;
        if (!isHTMLElement(focused) || !box.contains(focused)) return false;
        focused.click();
        return true;
      },
      { trapped: true },
    );

    const first = host.querySelector("button");
    if (first instanceof HTMLElement) focusElement(first);
  }

  /**
   * `restoreFocus` is false for exactly one caller: the keyboard closing *because* the
   * focus left it. Handing the focus back there would drag it off whatever the user
   * was reaching for and onto the field again — pressing a button elsewhere on the page
   * put the focus back in the field and the button never answered.
   */
  function close(restoreFocus = true): void {
    if (pop === null) return;
    const detach = pop;
    pop = null;
    detach();

    const leaving = field;
    field = null;
    root?.remove();
    root = null;
    keys = null;
    preview = null;

    if (leaving === null) return;
    leaving.removeAttribute(EDITING_ATTRIBUTE);
    if (!restoreFocus) return;
    closing = true;
    focusElement(leaving);
    closing = false;
  }

  return {
    name: "keyboard",
    setup(pluginContext): VoidFunction {
      context = pluginContext;
      const doc = pluginContext.doc;
      const opensOnFocus = openOn === "focus" || openOn === "gamepad";

      const teardowns: VoidFunction[] = [
        addDomEvent(doc, "focusin", (event: Event) => {
          const target = getEventTarget(event);
          if (!isHTMLElement(target)) return;

          // Leaving is closing. While the keyboard is open its scope traps, and a trap
          // makes `dispatch` report the intent consumed even when this handler declines
          // it — so the system cancels the browser's own activation and every button on
          // the page stops answering Enter. A focus that walks out of the keyboard has
          // to take the keyboard with it.
          if (pop !== null && !closing) {
            if (target !== field && root?.contains(target) !== true) close(false);
            return;
          }

          if (closing || !opensOnFocus || !isTextEntryTarget(target)) return;
          if (openOn === "gamepad" && pluginContext.getModality() !== "gamepad") return;
          open(target);
        }),
        // On the document, so it runs after a framework's own listener has re-rendered
        // the field: a controlled input that transforms what was typed is mirrored as
        // it ends up, not as it was typed. It also follows an `input` the keyboard did
        // not produce.
        addDomEvent(doc, "input", (event: Event) => {
          if (getEventTarget(event) === field) paint();
        }),
      ];

      if (openOn === "activate") {
        teardowns.push(
          addDomEvent(doc, "click", (event: Event) => {
            const target = getEventTarget(event);
            if (pop === null && isHTMLElement(target) && isTextEntryTarget(target)) open(target);
          }),
          // `select` on a focused field, whatever produced it. `activateFocused` already
          // refuses to click a text entry and says why in its own comment: A on a field
          // belongs to the virtual keyboard. This is the half that was never written.
          pluginContext.bus.pushScope((event: IntentEvent): boolean => {
            if (event.intent !== "select" || pop !== null) return false;
            const active = doc.activeElement;
            if (!isHTMLElement(active) || !isTextEntryTarget(active)) return false;
            open(active);
            return pop !== null;
          }),
        );
      }

      return () => {
        close();
        for (const teardown of teardowns.reverse()) teardown();
        context = null;
      };
    },
    open,
    close,
    isOpen: (): boolean => pop !== null,
    target: (): HTMLElement | null => field,
  };
}
