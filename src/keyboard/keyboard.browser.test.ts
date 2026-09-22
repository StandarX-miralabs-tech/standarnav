/**
 * The keyboard writes into a real field through real events, and every claim ADR-0022
 * makes about that is checkable in a browser and nowhere else: whether `setRangeText`
 * exists on the field type, whether a cancelled `beforeinput` really stops the mutation,
 * whether the focus comes back without reopening the keyboard on its way out.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createInputSystem, type InputPlugin, type InputSystem } from "../input-system";
import { spatialPlugin } from "../spatial/spatial";
import type { NavigationIntent } from "../types";
import {
  CARET_ATTRIBUTE,
  EDITING_ATTRIBUTE,
  type KeyboardPlugin,
  keyboardPlugin,
  PREVIEW_ATTRIBUTE,
} from "./keyboard";
import { alphabetic } from "./layouts/alphabetic";
import { qwerty } from "./layouts/qwerty";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

/** A plugin whose only job is to claim the modality a pad would claim. */
function pretendGamepad(): InputPlugin {
  return {
    name: "pretend-gamepad",
    setup(context): VoidFunction {
      context.setModality("gamepad");
      return () => {};
    },
  };
}

interface Scene {
  readonly input: InputSystem;
  readonly keyboard: KeyboardPlugin;
  readonly field: HTMLInputElement;
  key(label: string): HTMLButtonElement;
  labels(): readonly string[];
  grid(): HTMLElement | null;
  preview(): HTMLElement;
  /** What the preview row shows on either side of its caret. */
  mirror(): { readonly before: string; readonly after: string };
  /** A pad's direction, aimed at whatever has the focus. */
  pad(intent: NavigationIntent): boolean;
  active(): string;
}

function scene(
  markup = `<input type="text" id="field" value="" />`,
  options: {
    readonly openOn?: "activate" | "gamepad" | "focus" | "manual";
    readonly pad?: boolean;
    readonly spatial?: boolean;
  } = {},
): Scene {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.append(host);

  const keyboard = keyboardPlugin({
    layout: alphabetic,
    container: host,
    openOn: options.openOn ?? "focus",
  });
  const plugins: InputPlugin[] = [keyboard];
  if (options.pad === true) plugins.unshift(pretendGamepad());
  if (options.spatial === true) plugins.unshift(spatialPlugin({ root: host, mode: "app" }));
  const input = createInputSystem({ plugins });
  cleanups.push(() => {
    input.destroy();
    host.remove();
  });

  const grid = (): HTMLElement | null => host.querySelector("[data-snav-keyboard]");
  const preview = (): HTMLElement => {
    const row = grid()?.querySelector(`[${PREVIEW_ATTRIBUTE}]`);
    if (!(row instanceof HTMLElement)) throw new Error("no preview row");
    return row;
  };
  return {
    input,
    keyboard,
    field: host.querySelector("input, textarea") as HTMLInputElement,
    grid,
    preview,
    labels: (): readonly string[] =>
      [...(grid()?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? ""),
    key(label): HTMLButtonElement {
      const match = [...(grid()?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === label,
      );
      if (match === undefined) throw new Error(`no key labelled ${label}`);
      return match as HTMLButtonElement;
    },
    mirror(): { before: string; after: string } {
      let before = "";
      let after = "";
      let past = false;
      for (const node of preview().childNodes) {
        if (node instanceof HTMLElement && node.hasAttribute(CARET_ATTRIBUTE)) past = true;
        else if (past) after += node.textContent ?? "";
        else before += node.textContent ?? "";
      }
      return { before, after };
    },
    pad: (intent): boolean => input.emit({ intent, source: "gamepad" }).consumed,
    active: (): string => document.activeElement?.id ?? "",
  };
}

describe("when the keyboard opens", () => {
  it("opens on a focused text field", () => {
    const view = scene();

    view.field.focus();

    expect(view.keyboard.isOpen()).toBe(true);
    expect(view.keyboard.target()).toBe(view.field);
  });

  it("stays shut on a keyboard modality, which is why gamepad is the default", () => {
    const view = scene(`<input type="text" id="field" />`, { openOn: "gamepad" });

    view.field.focus();

    // A laptop with a real keyboard must not get an on-screen one in its way.
    expect(view.keyboard.isOpen()).toBe(false);
  });

  it("opens under the gamepad default once the modality is a pad", () => {
    const view = scene(`<input type="text" id="field" />`, { openOn: "gamepad", pad: true });

    view.field.focus();

    expect(view.keyboard.isOpen()).toBe(true);
  });

  it("declines a contenteditable, which it can type into but not reliably erase", () => {
    const view = scene(`<div id="rich" contenteditable="true"></div>`);
    const rich = document.getElementById("rich") as HTMLElement;

    rich.focus();

    // `isTextEntryTarget` calls this a text entry and the keyboard still says no —
    // ADR-0022 decision 5, and a test rather than a comment.
    expect(view.keyboard.isOpen()).toBe(false);
  });

  it("marks the field, because the field is not the thing with focus", () => {
    const view = scene();

    view.field.focus();

    expect(view.field.hasAttribute(EDITING_ATTRIBUTE)).toBe(true);
    // The keys hold the focus; the attribute is the only way an application can style
    // the field it is being typed into.
    expect(view.active()).not.toBe("field");
  });

  it("traps its own container, because a trapped scope alone would not", () => {
    const view = scene();
    view.field.focus();

    // The spatial engine is a `base` scope and is asked through a trap on purpose, so
    // the attribute is what keeps a direction inside the keys.
    expect(view.grid()?.hasAttribute("data-snav-trap")).toBe(true);
    expect(view.grid()?.dataset.snav).toBe("container");
  });

  it("expands a string row into one key per character", () => {
    const view = scene();
    view.field.focus();

    // `"abcdefg"` in the layout, seven buttons here: the expansion lives in the keyboard
    // so a layout can stay literal data.
    expect(view.labels().slice(0, 7)).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
  });
});

describe("typing", () => {
  it("inserts at the caret and fires beforeinput before input", () => {
    const view = scene(`<input type="text" id="field" value="ac" />`);
    const order: string[] = [];
    view.field.addEventListener("beforeinput", () => order.push("beforeinput"));
    view.field.addEventListener("input", () => order.push("input"));
    view.field.focus();
    view.field.setSelectionRange(1, 1);

    view.key("b").click();

    expect(view.field.value).toBe("abc");
    expect(order).toEqual(["beforeinput", "input"]);
  });

  it("obeys a cancelled beforeinput, which is how a mask refuses a key", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`);
    view.field.addEventListener("beforeinput", (event) => event.preventDefault());
    let inputs = 0;
    view.field.addEventListener("input", () => {
      inputs += 1;
    });
    view.field.focus();

    view.key("c").click();

    // The mutation never happened, so no `input` followed either — a keyboard that
    // mutated first would have told the application about a change it had refused.
    expect(view.field.value).toBe("ab");
    expect(inputs).toBe(0);
  });

  it("deletes one character before the caret, not the tail", () => {
    const view = scene(`<input type="text" id="field" value="abcd" />`);
    view.field.focus();
    view.field.setSelectionRange(2, 2);

    view.key("⌫").click();

    expect(view.field.value).toBe("acd");
  });

  it("deletes a selection rather than one character of it", () => {
    const view = scene(`<input type="text" id="field" value="abcd" />`);
    view.field.focus();
    view.field.setSelectionRange(1, 3);

    view.key("⌫").click();

    expect(view.field.value).toBe("ad");
  });

  it("does nothing on backspace at the start", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`);
    let inputs = 0;
    view.field.addEventListener("input", () => {
      inputs += 1;
    });
    view.field.focus();
    view.field.setSelectionRange(0, 0);

    view.key("⌫").click();

    expect(view.field.value).toBe("ab");
    expect(inputs).toBe(0);
  });

  it("types into a field that exposes no selection at all", () => {
    const view = scene(`<input type="email" id="field" value="a@b" />`);
    view.field.focus();

    // `email` is a text entry by `isTextEntryTarget` and exposes `selectionStart` as
    // `null`; `setRangeText` throws `InvalidStateError` on it. The keyboard rewrites
    // the whole value around a caret it owns, which starts at the end.
    expect(view.field.selectionStart).toBeNull();
    view.key("c").click();
    expect(view.field.value).toBe("a@bc");

    view.key("⌫").click();
    expect(view.field.value).toBe("a@b");
  });

  it("types one capital on shift and lets go", () => {
    const view = scene();
    view.field.focus();

    view.key("⇧").click();
    expect(view.labels().slice(0, 3)).toEqual(["A", "B", "C"]);
    view.key("A").click();

    expect(view.field.value).toBe("A");
    // Released, which is what a remote user means by shift: one capital, then lower case.
    expect(view.labels().slice(0, 3)).toEqual(["a", "b", "c"]);
  });

  it("types a space through its action key", () => {
    const view = scene(`<input type="text" id="field" value="a" />`);
    view.field.focus();

    view.key("space").click();

    expect(view.field.value).toBe("a ");
  });

  it("puts the caret at the end on open, where the preview row shows it", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`);

    view.field.focus();

    // A programmatic `focus()` leaves the caret at 0, which would type in front of what
    // is already there. The end is where typing continues, and the row says so.
    expect(view.field.selectionStart).toBe(2);
    expect(view.mirror()).toEqual({ before: "ab", after: "" });
    view.key("c").click();
    expect(view.field.value).toBe("abc");
  });
});

describe("layers", () => {
  it("switches to another layer and back", () => {
    const host = document.createElement("div");
    host.innerHTML = `<input type="text" id="field" />`;
    document.body.append(host);
    const keyboard = keyboardPlugin({ layout: qwerty, container: host, openOn: "focus" });
    const input = createInputSystem({ plugins: [keyboard] });
    cleanups.push(() => {
      input.destroy();
      host.remove();
    });
    const field = host.querySelector("input") as HTMLInputElement;
    const labels = (): readonly string[] =>
      [...host.querySelectorAll("[data-snav-keyboard] button")].map(
        (button) => button.textContent ?? "",
      );
    const press = (label: string): void => {
      const key = [...host.querySelectorAll<HTMLButtonElement>("[data-snav-keyboard] button")].find(
        (button) => button.textContent === label,
      );
      key?.click();
    };
    field.focus();

    expect(labels()).toContain("q");
    press("?#=");
    expect(labels()).toContain("@");
    expect(labels()).not.toContain("q");

    press("abc");
    expect(labels()).toContain("q");
  });
});

/**
 * Rebuilding the keys used to be `replaceChildren` on the box, which destroyed the
 * focused key: the focus fell to `body`, and the next direction walked out of the
 * keyboard — onto an unrelated button on chromium and webkit, back onto the field on
 * firefox. Found by pressing shift on a real page, on all three engines.
 */
describe("re-rendering the keys", () => {
  it("keeps the focus on the key at the same position through shift", () => {
    const view = scene();
    view.field.focus();
    view.key("b").focus();

    view.key("⇧").click();

    expect(document.activeElement?.textContent).toBe("B");
    // And the keyboard still answers A: the trapped scope clicks the focused key.
    view.pad("select");
    expect(view.field.value).toBe("B");
  });

  it("keeps the preview row through a layer switch", () => {
    const host = document.createElement("div");
    host.innerHTML = `<input type="text" id="field" value="q" />`;
    document.body.append(host);
    const keyboard = keyboardPlugin({ layout: qwerty, container: host, openOn: "focus" });
    const input = createInputSystem({ plugins: [keyboard] });
    cleanups.push(() => {
      input.destroy();
      host.remove();
    });
    (host.querySelector("input") as HTMLInputElement).focus();
    const row = host.querySelector(`[${PREVIEW_ATTRIBUTE}]`);
    const layerKey = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "?#=",
    );

    layerKey?.click();

    // The same node, not a fresh one: the row is built once and painted in place.
    expect(host.querySelector(`[${PREVIEW_ATTRIBUTE}]`)).toBe(row);
    expect(row?.textContent).toBe("q");
  });
});

describe("the preview row", () => {
  it("mirrors the field and follows every keystroke", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`);
    view.field.focus();

    view.key("c").click();

    expect(view.mirror()).toEqual({ before: "abc", after: "" });
  });

  it("shows a password as bullets", () => {
    const view = scene(`<input type="password" id="field" value="abc" />`);

    view.field.focus();

    expect(view.mirror()).toEqual({ before: "•••", after: "" });
  });

  it("follows an input event the keyboard did not produce", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`);
    view.field.focus();

    view.field.value = "zz";
    view.field.dispatchEvent(new Event("input", { bubbles: true }));

    expect(view.preview().textContent).toBe("zz");
  });

  it("stays one line: a newline is one glyph", () => {
    const view = scene(`<textarea id="field">ab\ncd</textarea>`);

    view.field.focus();

    expect(view.mirror()).toEqual({ before: "ab↵cd", after: "" });
  });

  it("does not widen the box for a long value", () => {
    const view = scene(`<input type="text" id="field" value="" />`);
    view.field.focus();
    const empty = (view.grid() as HTMLElement).getBoundingClientRect().width;
    view.keyboard.close();

    view.field.value = "m".repeat(200);
    view.keyboard.open(view.field);

    const row = view.preview();
    expect({
      width: (view.grid() as HTMLElement).getBoundingClientRect().width,
      overflows: row.scrollWidth > row.clientWidth,
    }).toEqual({ width: empty, overflows: true });
  });
});

/**
 * No mode to enter: the row spans the box, nothing is to its left or right, so the
 * two directions are free to move the caret while it has the focus. The caret is the
 * field's own selection, moved with `setSelectionRange` and read back for the paint —
 * the row never holds a position of its own (ADR-0022, the amendment on the preview).
 */
describe("moving the caret from the preview row", () => {
  it("moves the field's own selection with left and right, and the row follows", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`);
    view.field.focus();
    view.preview().focus();

    const consumed = view.pad("moveLeft");

    expect({
      consumed,
      caret: view.field.selectionStart,
      mirror: view.mirror(),
      // ADR-0005's gate wording: the element with the focus is the one the test names.
      stillOnTheRow: document.activeElement === view.preview(),
    }).toEqual({
      consumed: true,
      caret: 1,
      mirror: { before: "a", after: "b" },
      stillOnTheRow: true,
    });

    view.pad("moveLeft");
    view.pad("moveLeft");
    expect(view.field.selectionStart).toBe(0);
    view.pad("moveRight");
    expect(view.field.selectionStart).toBe(1);
  });

  it("types at the moved caret and deletes before it", () => {
    const view = scene(`<input type="text" id="field" value="ac" />`);
    view.field.focus();
    view.preview().focus();
    view.pad("moveLeft");

    view.key("b").click();
    expect({ value: view.field.value, caret: view.field.selectionStart }).toEqual({
      value: "abc",
      caret: 2,
    });

    view.key("⌫").click();
    expect(view.field.value).toBe("ac");
  });

  it("jumps to the ends of the line and of the value", () => {
    const view = scene(`<textarea id="field">ab\ncd</textarea>`);
    view.field.focus();
    view.preview().focus();
    view.field.setSelectionRange(4, 4);

    const positions: number[] = [];
    for (const intent of ["home", "end", "pageUp", "pageDown"] as const) {
      view.pad(intent);
      positions.push(view.field.selectionStart ?? -1);
    }

    expect(positions).toEqual([3, 5, 0, 5]);
  });

  it("moves a line up and down in a textarea, keeping the column where it can", () => {
    const view = scene(`<textarea id="field">abc\nd\nefg</textarea>`);
    view.field.focus();
    view.preview().focus();
    view.field.setSelectionRange(8, 8);

    const positions: number[] = [];
    for (const intent of ["moveUp", "moveUp", "moveDown", "moveDown"] as const) {
      view.pad(intent);
      positions.push(view.field.selectionStart ?? -1);
    }

    // From column 2 of "efg": onto "d" (one character, so its end), then column 1 of
    // "abc", then back down the same way.
    expect(positions).toEqual([5, 1, 5, 7]);
  });

  it("hands up on the first line to the engine, which is how the focus leaves the row", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`, { spatial: true });
    view.field.focus();
    view.preview().focus();

    view.pad("moveUp");

    const landed = document.activeElement;
    expect({
      onAKey: landed instanceof HTMLButtonElement && view.grid()?.contains(landed) === true,
      caret: view.field.selectionStart,
    }).toEqual({ onAKey: true, caret: 2 });
  });

  it("owns the caret of a field that exposes no selection", () => {
    const view = scene(`<input type="email" id="field" value="ab" />`);
    view.field.focus();
    view.preview().focus();

    view.pad("moveLeft");
    expect(view.mirror()).toEqual({ before: "a", after: "b" });

    // The field has no position to mirror, so the plugin's own index is where the
    // whole-value rewrite splices, and it moves with what it typed.
    view.key("c").click();
    expect({ value: view.field.value, mirror: view.mirror() }).toEqual({
      value: "acb",
      mirror: { before: "ac", after: "b" },
    });

    view.key("⌫").click();
    expect({ value: view.field.value, mirror: view.mirror() }).toEqual({
      value: "ab",
      mirror: { before: "a", after: "b" },
    });
  });

  it("leaves the field with the caret the row set when the focus goes back", () => {
    const view = scene(`<input type="text" id="field" value="abc" />`);
    view.field.focus();
    view.preview().focus();
    view.pad("moveLeft");

    view.pad("back");

    // A selection set on a blurred field survives its refocus, on every engine.
    expect({ active: view.active(), caret: view.field.selectionStart }).toEqual({
      active: "field",
      caret: 2,
    });
  });
});

describe("closing", () => {
  it("keeps what was typed on back, deliberately unlike engage mode", () => {
    const view = scene();
    view.field.focus();
    view.key("a").click();
    view.key("b").click();

    view.input.emit({ intent: "back", source: "gamepad" });

    // Engage mode restores the entry value on B. A text field does not: thirty seconds
    // of typing on a remote is not re-entered the way a slider is re-set (ADR-0022,
    // decision 8). The inconsistency is the decision, not an oversight.
    expect(view.field.value).toBe("ab");
    expect(view.keyboard.isOpen()).toBe(false);
  });

  it("gives the focus back to the field without reopening on the way out", () => {
    const view = scene();
    view.field.focus();
    expect(view.keyboard.isOpen()).toBe(true);

    view.input.emit({ intent: "back", source: "gamepad" });

    // Refocusing the field fires `focusin` again, which is the open trigger: without a
    // guard the keyboard would reopen forever on its own close.
    expect(view.active()).toBe("field");
    expect(view.keyboard.isOpen()).toBe(false);
  });

  it("takes the marker and the keys off the page", () => {
    const view = scene();
    view.field.focus();

    view.input.emit({ intent: "back", source: "gamepad" });

    expect(view.field.hasAttribute(EDITING_ATTRIBUTE)).toBe(false);
    expect(view.grid()).toBeNull();
  });

  it("closes on the done key too", () => {
    const view = scene();
    view.field.focus();
    view.key("a").click();

    view.key("done").click();

    expect(view.keyboard.isOpen()).toBe(false);
    expect(view.field.value).toBe("a");
  });

  it("closes when the plugin is torn down", () => {
    const view = scene();
    view.field.focus();
    expect(view.keyboard.isOpen()).toBe(true);

    view.input.destroy();

    expect(view.keyboard.isOpen()).toBe(false);
    expect(view.grid()).toBeNull();
  });
});

/**
 * The `activate` default, and the defect that produced it. The playground drives the
 * spatial engine in `app` mode, where `pointerFollowsFocus` is on, so the pointer
 * focuses whatever it crosses. With `openOn: "focus"` that turned every hover into an
 * open keyboard — and an open keyboard traps, which is the rest of the damage: a trap
 * makes `dispatch` report a `select` consumed even when this plugin declines it, so the
 * system cancels the browser's own activation and nothing else on the page answers.
 */
describe("the activate default", () => {
  function activateScene(markup?: string) {
    return scene(markup, { openOn: "activate" });
  }

  it("does not open on a focus alone, which is what a hover produces", () => {
    const view = activateScene();

    view.field.focus();

    expect({ open: view.keyboard.isOpen(), grid: view.grid() }).toEqual({
      open: false,
      grid: null,
    });
  });

  it("opens on a click, which is a decision", () => {
    const view = activateScene();

    view.field.click();

    expect(view.keyboard.isOpen()).toBe(true);
  });

  it("opens on a select on the focused field, whatever the device", () => {
    const view = activateScene();
    view.field.focus();

    const result = view.input.emit({ intent: "select", source: "gamepad" });

    expect({ open: view.keyboard.isOpen(), consumed: result.consumed }).toEqual({
      open: true,
      consumed: true,
    });
  });

  it("paints and places itself rather than inheriting the page's block layout", () => {
    const view = activateScene();
    view.field.click();
    const box = view.grid() as HTMLElement;

    const rect = box.getBoundingClientRect();

    expect({
      position: getComputedStyle(box).position,
      narrowerThanTheViewport: rect.width < window.innerWidth,
      onScreen: rect.top >= 0 && rect.left >= 0,
    }).toEqual({ position: "fixed", narrowerThanTheViewport: true, onScreen: true });
  });

  it("owns all four insets, so a stylesheet cannot stretch it over the field", () => {
    // The playground once carried exactly this rule, from before the box painted
    // itself: the plugin wrote `top` and `left`, the stylesheet kept `bottom`, and the
    // box was stretched from the one to the other — over the field it was editing.
    const plain = activateScene();
    plain.field.click();
    const unstretched = (plain.grid() as HTMLElement).getBoundingClientRect();
    for (const dispose of cleanups.splice(0, cleanups.length)) dispose();

    const view = activateScene(
      `<style>[data-snav-keyboard]{inset:auto 0 72px 0}</style><input type="text" id="field" />`,
    );
    view.field.click();
    const box = view.grid() as HTMLElement;

    const rect = box.getBoundingClientRect();

    expect({ bottom: box.style.bottom, height: rect.height, width: rect.width }).toEqual({
      bottom: "auto",
      height: unstretched.height,
      width: unstretched.width,
    });
  });
});

describe("when the focus leaves an open keyboard", () => {
  function pageScene() {
    const view = scene(
      `<input type="text" id="field" /><button type="button" id="other"></button>`,
      {
        openOn: "activate",
      },
    );
    view.field.click();
    return view;
  }

  it("closes, and leaves the focus where it was going", () => {
    const view = pageScene();
    const other = document.getElementById("other") as HTMLButtonElement;

    other.focus();

    // Closing used to hand the focus back to the field unconditionally, which dragged
    // it off whatever the user was reaching for.
    expect({ open: view.keyboard.isOpen(), active: view.active() }).toEqual({
      open: false,
      active: "other",
    });
  });

  it("gives the page its activations back", () => {
    const view = pageScene();
    const other = document.getElementById("other") as HTMLButtonElement;
    let clicked = 0;
    other.addEventListener("click", () => {
      clicked += 1;
    });
    other.focus();

    const result = view.input.emit({ intent: "select", source: "gamepad" });

    // While the keyboard was open and trapping, this was `consumed: true` and no click.
    expect({ consumed: result.consumed, clicked }).toEqual({ consumed: false, clicked: 1 });
  });
});
