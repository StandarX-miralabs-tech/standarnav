import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputSystem, type InputPlugin, type InputPluginContext } from "./input-system";
import { isTextEntryTarget } from "./keymap";
import { MODALITY_ATTRIBUTE } from "./modality";
import type { IntentEvent } from "./types";

const cleanups: VoidFunction[] = [];

function system(options: Parameters<typeof createInputSystem>[0] = {}) {
  const input = createInputSystem(options);
  cleanups.push(() => input.destroy());
  return input;
}

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

function pressOn(node: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return pressOn(document, key, init);
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("createInputSystem — activation", () => {
  function focusedButton() {
    const host = mount(`<button type="button">go</button>`);
    const button = host.firstElementChild as HTMLButtonElement;
    const clicks = vi.fn();
    button.addEventListener("click", clicks);
    button.focus();
    return { button, clicks };
  }

  it("activates the focused element when nothing claimed the intent", () => {
    const input = system();
    const { clicks } = focusedButton();

    // The pad's A. The browser turns Enter into a click for a keyboard and does
    // nothing at all for a gamepad, so this is the whole reason A works on a
    // button, a checkbox or a radio without any component knowing a pad exists.
    input.emit({ intent: "select", source: "gamepad" });

    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it("leaves a keyboard select alone — the browser is already clicking", () => {
    const input = system();
    const { clicks } = focusedButton();

    input.emit({ intent: "select", source: "keyboard" });

    expect(clicks).not.toHaveBeenCalled();
  });

  it("stands aside when a scope claimed the activation", () => {
    const input = system();
    const { clicks } = focusedButton();
    cleanups.push(input.pushScope(() => true));

    input.emit({ intent: "select", source: "gamepad" });

    expect(clicks).not.toHaveBeenCalled();
  });

  it("stands aside when a scope only prevented the default", () => {
    const input = system();
    const { clicks } = focusedButton();
    cleanups.push(
      input.pushScope((event) => {
        event.preventDefault();
      }),
    );

    input.emit({ intent: "select", source: "gamepad" });

    expect(clicks).not.toHaveBeenCalled();
  });

  it("never repeats an activation", () => {
    const input = system();
    const { clicks } = focusedButton();

    input.emit({ intent: "select", source: "gamepad", repeat: true });

    expect(clicks).not.toHaveBeenCalled();
  });

  it("keeps out of a text field, where A belongs to the keyboard", () => {
    const input = system();
    const host = mount(`<input type="text" />`);
    const field = host.firstElementChild as HTMLInputElement;
    const clicks = vi.fn();
    field.addEventListener("click", clicks);
    field.focus();

    input.emit({ intent: "select", source: "gamepad" });

    expect(clicks).not.toHaveBeenCalled();
  });

  it("does nothing while paused", () => {
    const input = system();
    const { clicks } = focusedButton();
    input.pause();

    input.emit({ intent: "select", source: "gamepad" });

    expect(clicks).not.toHaveBeenCalled();
  });
});

describe("createInputSystem", () => {
  it("turns a keydown into an intent for whoever is listening", () => {
    const input = system();
    const seen: IntentEvent[] = [];
    cleanups.push(input.onIntent((event) => seen.push(event)));

    press("ArrowDown");

    expect(seen).toHaveLength(1);
    expect(seen[0]?.intent).toBe("moveDown");
    expect(seen[0]?.source).toBe("keyboard");
  });

  it("leaves the native default alone until a scope claims the intent", () => {
    const input = system();

    const ignored = press("ArrowDown");
    expect(ignored.defaultPrevented).toBe(false);

    cleanups.push(input.pushScope(() => true));
    const claimed = press("ArrowDown");
    expect(claimed.defaultPrevented).toBe(true);
  });

  it("starts the modality tracker it depends on", () => {
    system();

    press("ArrowDown");

    expect(document.documentElement.getAttribute(MODALITY_ATTRIBUTE)).toBe("keyboard");
  });

  it("never repeats an activation", () => {
    const input = system();
    const handler = vi.fn();
    cleanups.push(input.pushScope(handler));

    press("Enter");
    press("Enter", { repeat: true });
    press("ArrowDown", { repeat: true });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler.mock.calls[1]?.[0].intent).toBe("moveDown");
    expect(handler.mock.calls[1]?.[0].repeat).toBe(true);
  });

  it("keeps the caret gestures inside a text field", () => {
    const input = system();
    const host = mount(`<input id="field" /><textarea id="area"></textarea>`);
    const field = host.querySelector("input") as HTMLInputElement;
    const handler = vi.fn();
    cleanups.push(input.pushScope(handler));

    pressOn(field, "ArrowLeft");
    pressOn(field, " ");
    pressOn(field, "ArrowDown");
    expect(handler).not.toHaveBeenCalled();

    pressOn(field, "Escape");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0].intent).toBe("back");
  });

  it("releases the vertical pair when the application asks", () => {
    const input = system({ allowVerticalInText: true });
    const host = mount(`<input id="field" />`);
    const field = host.querySelector("input") as HTMLInputElement;
    const handler = vi.fn();
    cleanups.push(input.pushScope(handler));

    pressOn(field, "ArrowDown");
    pressOn(field, "ArrowLeft");

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0].intent).toBe("moveDown");
  });

  it("stays out of an IME composition", () => {
    const input = system();
    const handler = vi.fn();
    cleanups.push(input.pushScope(handler));

    press("Enter", { isComposing: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it("honours a keymap override", () => {
    const input = system({ keymap: { keys: { Backspace: "back", " ": null } } });
    const seen: string[] = [];
    cleanups.push(input.pushScope((event) => void seen.push(event.intent)));

    press("Backspace");
    press(" ");

    expect(seen).toEqual(["back"]);
  });

  it("goes quiet while paused and wakes its plugins on resume", () => {
    const paused = vi.fn();
    const resumed = vi.fn();
    const plugin: InputPlugin = {
      name: "test",
      setup: (): VoidFunction => () => {},
      pause: paused,
      resume: resumed,
    };
    const input = system({ plugins: [plugin] });
    const handler = vi.fn();
    cleanups.push(input.pushScope(handler));

    input.pause();
    press("ArrowDown");
    expect(handler).not.toHaveBeenCalled();
    expect(paused).toHaveBeenCalledOnce();

    input.resume();
    press("ArrowDown");
    expect(handler).toHaveBeenCalledOnce();
    expect(resumed).toHaveBeenCalledOnce();
  });

  it("hands a plugin the context it needs and tears it down once", () => {
    const teardown = vi.fn();
    const captured: InputPluginContext[] = [];
    const plugin: InputPlugin = {
      name: "test",
      setup(context): VoidFunction {
        captured.push(context);
        return teardown;
      },
    };
    const input = createInputSystem({ plugins: [plugin] });
    const seen: string[] = [];
    const popScope = input.pushScope((event) => void seen.push(event.source));

    const context = captured[0];
    expect(context?.doc).toBe(document);
    context?.setModality("gamepad");
    expect(input.modality).toBe("gamepad");
    context?.emit({ intent: "moveUp", source: "gamepad" });
    expect(seen).toEqual(["gamepad"]);

    popScope();
    input.destroy();
    input.destroy();
    expect(teardown).toHaveBeenCalledOnce();
  });

  it("stops listening once destroyed", () => {
    const input = createInputSystem();
    const handler = vi.fn();
    input.pushScope(handler);

    input.destroy();
    press("ArrowDown");

    expect(handler).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute(MODALITY_ATTRIBUTE)).toBe(false);
  });
});

// Lives here rather than with the keymap unit tests: it needs isContentEditable
// and input.type resolution, which the node project cannot provide.
describe("isTextEntryTarget", () => {
  it("recognises the elements a caret lives in", () => {
    const host = mount(`
      <input id="text" />
      <input id="search" type="search" />
      <input id="check" type="checkbox" />
      <input id="range" type="range" />
      <textarea id="area"></textarea>
      <div id="editable" contenteditable="true"></div>
      <div id="role" role="textbox"></div>
      <button id="button"></button>
    `);
    const at = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;

    for (const id of ["text", "search", "area", "editable", "role"]) {
      expect(isTextEntryTarget(at(id)), id).toBe(true);
    }
    for (const id of ["check", "range", "button"]) {
      expect(isTextEntryTarget(at(id)), id).toBe(false);
    }
    expect(isTextEntryTarget(null)).toBe(false);
  });
});
