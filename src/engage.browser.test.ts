/**
 * `engage.test.ts` proves the scope grammar against a bare bus. What it cannot reach
 * is the claim the grammar exists for: that while a control is held, a direction
 * adjusts it *instead of* moving the focus. That needs the whole chain — a real key,
 * the keymap, the text-entry gate, the scope stack and the spatial engine underneath
 * it — and a real focused element to not move.
 *
 * So this drives the recipes in `playground/widgets.ts` with real keydown events.
 * They are the one place the engine is used the way an application uses it.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  attachSlider,
  attachSplitter,
  attachStepper,
  attachWheelPicker,
  ENGAGED_ATTRIBUTE,
} from "../playground/widgets";
import { createInputSystem, type InputSystem } from "./input-system";
import { type SpatialPlugin, spatialPlugin } from "./spatial/spatial";
import type { IntentEvent } from "./types";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

interface Scene {
  readonly host: HTMLElement;
  readonly input: InputSystem;
  readonly spatial: SpatialPlugin;
  at<T extends HTMLElement>(id: string): T;
  active(): string;
}

function scene(html: string, options: { readonly allowVerticalInText?: boolean } = {}): Scene {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:600px;height:300px";
  host.innerHTML = html;
  document.body.append(host);

  const spatial = spatialPlugin({ root: host, mode: "app" });
  const input = createInputSystem(
    options.allowVerticalInText === true
      ? { plugins: [spatial], allowVerticalInText: true }
      : { plugins: [spatial] },
  );
  cleanups.push(() => {
    input.destroy();
    host.remove();
  });

  return {
    host,
    input,
    spatial,
    at: <T extends HTMLElement>(id: string): T => host.querySelector(`#${id}`) as T,
    active: (): string => document.activeElement?.id ?? "",
  };
}

/** On the element, not on the document: the text-entry gate reads `composedPath()[0]`. */
function press(node: EventTarget, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
  node.dispatchEvent(event);
  return event;
}

function box(id: string, x = 0, extra = ""): string {
  return `<button type="button" id="${id}" ${extra} style="position:absolute;left:${x}px;top:100px;width:120px;height:40px"></button>`;
}

describe("a slider held with engage mode", () => {
  function sliderScene() {
    const view = scene(
      `<input type="range" id="volume" min="0" max="100" step="5" value="50"
              style="position:absolute;left:0px;top:100px;width:200px" />
       ${box("after", 260)}`,
    );
    const slider = view.at<HTMLInputElement>("volume");
    const widget = attachSlider(view.input, slider);
    cleanups.push(() => widget.dispose());
    slider.focus();
    return { view, slider, widget };
  }

  it("takes hold on A and says so on the element", () => {
    const { slider, widget } = sliderScene();

    press(slider, "Enter");

    expect(widget.engaged()).toBe(true);
    expect(slider.hasAttribute(ENGAGED_ATTRIBUTE)).toBe(true);
  });

  it("adjusts instead of navigating, which is the whole point", () => {
    const { view, slider } = sliderScene();
    press(slider, "Enter");

    press(slider, "ArrowRight");
    press(slider, "ArrowRight");

    expect(slider.value).toBe("60");
    // The claim no unit test can make: the neighbour to the right never got the focus.
    expect(view.active()).toBe("volume");
  });

  it("navigates rather than adjusting when nothing is holding it", () => {
    const { view, slider } = sliderScene();

    press(slider, "ArrowRight");

    expect(view.active()).toBe("after");
    expect(slider.value).toBe("50");
  });

  it("suppresses the native range adjustment it replaces", () => {
    const { slider } = sliderScene();
    press(slider, "Enter");

    const event = press(slider, "ArrowRight");

    // Consumed by the engage scope, so the system calls preventDefault and the
    // browser's own arrow handling on a range input never runs. Without this the
    // value would move twice, once for us and once for the browser.
    expect(event.defaultPrevented).toBe(true);
  });

  it("puts the value back on B", () => {
    const { slider, widget } = sliderScene();
    press(slider, "Enter");
    press(slider, "ArrowRight");
    expect(slider.value).toBe("55");

    press(slider, "Escape");

    expect(slider.value).toBe("50");
    expect(widget.engaged()).toBe(false);
    expect(slider.hasAttribute(ENGAGED_ATTRIBUTE)).toBe(false);
  });

  it("keeps the value on a second A", () => {
    const { slider, widget } = sliderScene();
    press(slider, "Enter");
    press(slider, "ArrowRight");

    press(slider, "Enter");

    expect(slider.value).toBe("55");
    expect(widget.engaged()).toBe(false);
  });

  it("never lets B reach the layer underneath while held", () => {
    const { view, slider } = sliderScene();
    const seen: string[] = [];
    // Pushed after the widget, so this sits above the scope that watches for A and
    // below the engage scope A opens — the position a popover's own scope is in.
    cleanups.push(
      view.input.pushScope((event: IntentEvent) => {
        seen.push(event.intent);
      }),
    );

    press(slider, "Enter");
    press(slider, "Escape");

    // The A that engaged passed through on its way down, which is how a popover
    // stays able to see activations. The B did not: it released the control and
    // stopped there, so a popover around a slider does not close on the way out.
    expect(seen).toEqual(["select"]);
  });

  it("lets go when the focus leaves, because Tab still escapes a held control", () => {
    const { view, slider, widget } = sliderScene();
    press(slider, "Enter");
    press(slider, "ArrowRight");

    view.at("after").focus();

    expect(widget.engaged()).toBe(false);
    // Left as committed: the user moved on, they did not back out.
    expect(slider.value).toBe("55");
  });
});

describe("the number field, and why it is not a number input", () => {
  it("never delivers A to a focused number input", () => {
    const view = scene(`<input type="number" id="qty" value="3" />`);
    const seen: string[] = [];
    cleanups.push(
      view.input.pushScope((event: IntentEvent) => {
        seen.push(event.intent);
      }),
    );
    const field = view.at<HTMLInputElement>("qty");
    field.focus();

    press(field, "Enter");
    press(field, "ArrowUp");

    // `number` is not in NON_TEXT_INPUT_TYPES, so the field is a text-entry target
    // and `select` is not on the list of intents allowed to cross one. The intent is
    // dropped before the bus: this is why the recipe is a button that owns a value.
    expect(seen).toEqual([]);
  });

  it("delivers the vertical pair once the application asks for it", () => {
    const view = scene(`<input type="number" id="qty" value="3" />`, {
      allowVerticalInText: true,
    });
    const seen: string[] = [];
    cleanups.push(
      view.input.pushScope((event: IntentEvent) => {
        seen.push(event.intent);
      }),
    );
    const field = view.at<HTMLInputElement>("qty");
    field.focus();

    press(field, "ArrowUp");
    press(field, "Enter");

    // The escape hatch reaches the arrows and still not A, which is the option's
    // documented scope: vertical movement, not activation.
    expect(seen).toEqual(["moveUp"]);
  });

  it("steps a button that owns the value", () => {
    const view = scene(`${box("qty")}<span id="out">3</span>`);
    const widget = attachStepper(view.input, view.at<HTMLButtonElement>("qty"), view.at("out"), {
      min: 0,
      max: 10,
      step: 1,
    });
    cleanups.push(() => widget.dispose());
    const button = view.at<HTMLButtonElement>("qty");
    button.focus();

    press(button, "Enter");
    press(button, "ArrowUp");
    press(button, "ArrowUp");

    expect(view.at("out").textContent).toBe("5");
    expect(widget.engaged()).toBe(true);
  });

  it("stops at its ends and answers home and end", () => {
    const view = scene(`${box("qty")}<span id="out">3</span>`);
    const widget = attachStepper(view.input, view.at<HTMLButtonElement>("qty"), view.at("out"), {
      min: 0,
      max: 10,
      step: 1,
    });
    cleanups.push(() => widget.dispose());
    const button = view.at<HTMLButtonElement>("qty");
    button.focus();
    press(button, "Enter");

    press(button, "End");
    expect(view.at("out").textContent).toBe("10");
    press(button, "ArrowUp");
    expect(view.at("out").textContent).toBe("10");

    press(button, "Home");
    expect(view.at("out").textContent).toBe("0");
    press(button, "ArrowDown");
    expect(view.at("out").textContent).toBe("0");
  });
});

describe("a wheel picker", () => {
  function pickerScene() {
    const view = scene(`${box("month")}<span id="out"></span>`);
    const widget = attachWheelPicker(
      view.input,
      view.at("month"),
      ["January", "February", "March"],
      view.at("out"),
    );
    cleanups.push(() => widget.dispose());
    const host = view.at<HTMLButtonElement>("month");
    host.focus();
    press(host, "Enter");
    return { view, host, widget };
  }

  it("comes round, which is what makes it a picker and not a slider", () => {
    const { view, host } = pickerScene();
    expect(view.at("out").textContent).toBe("January");

    press(host, "ArrowUp");

    expect(view.at("out").textContent).toBe("March");
  });

  it("still reaches the real ends through home and end", () => {
    const { view, host } = pickerScene();

    press(host, "End");
    expect(view.at("out").textContent).toBe("March");

    press(host, "Home");
    expect(view.at("out").textContent).toBe("January");
  });

  it("restores the entry value on B, wrapping and all", () => {
    const { view, host } = pickerScene();
    press(host, "ArrowDown");
    expect(view.at("out").textContent).toBe("February");

    press(host, "Escape");

    expect(view.at("out").textContent).toBe("January");
  });
});

describe("a splitter", () => {
  it("moves the pane and not the focus", () => {
    const view = scene(
      // A focusable separator, the markup the playground uses: the window-splitter
      // pattern is a `role="separator"` that takes focus, which no semantic element
      // offers — an `<hr>` cannot be focused.
      `<div style="display:flex;width:400px">
         <div id="pane" style="flex-basis:50%;height:40px"></div>
         <div id="grip" role="separator" tabindex="0" aria-orientation="vertical"
              style="width:12px;height:40px"></div>
       </div>
       ${box("beyond", 460)}`,
    );
    const widget = attachSplitter(view.input, view.at("grip"), view.at("pane"));
    cleanups.push(() => widget.dispose());
    const grip = view.at("grip");
    grip.focus();

    press(grip, "Enter");
    press(grip, "ArrowRight");
    press(grip, "ArrowRight");

    expect(view.at("pane").style.flexBasis).toBe("54%");
    expect(view.at("grip").getAttribute("aria-valuenow")).toBe("54");
    expect(view.active()).toBe("grip");
  });
});
