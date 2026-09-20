/**
 * The keyboard writes into a real field through real events, and every claim ADR-0022
 * makes about that is checkable in a browser and nowhere else: whether `setRangeText`
 * exists on the field type, whether a cancelled `beforeinput` really stops the mutation,
 * whether the focus comes back without reopening the keyboard on its way out.
 */

import { afterEach, describe, expect, it } from "vitest";
import { createInputSystem, type InputPlugin, type InputSystem } from "../input-system";
import { EDITING_ATTRIBUTE, type KeyboardPlugin, keyboardPlugin } from "./keyboard";
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
  active(): string;
}

function scene(
  markup = `<input type="text" id="field" value="" />`,
  options: { readonly openOn?: "gamepad" | "focus" | "manual"; readonly pad?: boolean } = {},
): Scene {
  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.append(host);

  const keyboard = keyboardPlugin({
    layout: alphabetic,
    container: host,
    openOn: options.openOn ?? "focus",
  });
  const input = createInputSystem({
    plugins: options.pad === true ? [pretendGamepad(), keyboard] : [keyboard],
  });
  cleanups.push(() => {
    input.destroy();
    host.remove();
  });

  const grid = (): HTMLElement | null => host.querySelector("[data-snav-keyboard]");
  return {
    input,
    keyboard,
    field: host.querySelector("input") as HTMLInputElement,
    grid,
    labels: (): readonly string[] =>
      [...(grid()?.querySelectorAll("button") ?? [])].map((button) => button.textContent ?? ""),
    key(label): HTMLButtonElement {
      const match = [...(grid()?.querySelectorAll("button") ?? [])].find(
        (button) => button.textContent === label,
      );
      if (match === undefined) throw new Error(`no key labelled ${label}`);
      return match as HTMLButtonElement;
    },
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
    // `null`; `setRangeText` throws `InvalidStateError` on it. The keyboard appends
    // instead, because on such a field the caret is always at the end.
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

  it("puts the caret at the end on open, because nothing can move it afterwards", () => {
    const view = scene(`<input type="text" id="field" value="ab" />`);

    view.field.focus();

    // A programmatic `focus()` leaves the caret at 0, which would type in front of what
    // is already there. In v0 the directions navigate the keys, so there is no way to
    // move a caret at all and the end is the only defensible place to start.
    expect(view.field.selectionStart).toBe(2);
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
