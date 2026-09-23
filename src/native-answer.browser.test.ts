/**
 * Real key presses, not a dispatched `KeyboardEvent`: only a trusted keydown makes the
 * browser check a radio or step a range, and that native default is what is under
 * test (ADR-0026). Measured 2026-09-23 on chromium, firefox and webkit: ArrowDown and
 * ArrowRight check the next radio and take the focus with them, ArrowRight and
 * ArrowLeft step a range by one. Only chromium and firefox wrap from the last radio to
 * the first, so nothing here presses past the end of the group.
 */

import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createInputSystem, type InputSystem } from "./input-system";
import { type SpatialPlugin, spatialPlugin } from "./spatial/spatial";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

const CONTROLS = `
  <div id="group" style="position:absolute;left:10px;top:40px">
    <label style="display:block"><input type="radio" name="size" id="r1" checked> S</label>
    <label style="display:block"><input type="radio" name="size" id="r2"> M</label>
    <label style="display:block"><input type="radio" name="size" id="r3"> L</label>
  </div>
  <input type="range" id="range" min="0" max="10" value="5"
    style="position:absolute;left:10px;top:160px;width:160px">
  <button id="beside" style="position:absolute;left:300px;top:160px;width:80px;height:30px"></button>
`;

interface Scene {
  readonly input: InputSystem;
  readonly plugin: SpatialPlugin;
  /** Every target the spatial engine was about to focus, in order. */
  readonly moves: string[];
  at(id: string): HTMLElement;
  checked(): string;
  active(): string;
}

function scene(): Scene {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:560px;height:340px";
  host.innerHTML = CONTROLS;
  document.body.append(host);

  const plugin = spatialPlugin({ root: host, mode: "app" });
  const input = createInputSystem({ plugins: [plugin] });
  const moves: string[] = [];
  const stopWatching = plugin.onWillMove((event) => moves.push(event.to.id));
  cleanups.push(() => {
    stopWatching();
    input.destroy();
    host.remove();
  });

  return {
    input,
    plugin,
    moves,
    at: (id): HTMLElement => host.querySelector(`#${id}`) as HTMLElement,
    checked: (): string => host.querySelector<HTMLInputElement>(":checked")?.id ?? "",
    active: (): string => document.activeElement?.id ?? "",
  };
}

/** The recipe of docs/en/navigation.md: keyboard arrows on the control are the browser's. */
function answerNative(view: Scene, control: HTMLElement): void {
  cleanups.push(
    view.input.pushScope(
      (event) =>
        event.source === "keyboard" &&
        event.intent.startsWith("move") &&
        control.contains(document.activeElement)
          ? "native"
          : false,
      { within: control },
    ),
  );
}

describe("app mode, a native control and a scope answering native", () => {
  it("lets the arrow keys check the next radio, and a pad still leaves the group", async () => {
    const view = scene();
    answerNative(view, view.at("group"));
    view.at("r1").focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(view.checked()).toBe("r2");
    expect(view.active()).toBe("r2");

    await userEvent.keyboard("{ArrowRight}");
    expect(view.checked()).toBe("r3");
    expect(view.active()).toBe("r3");
    expect(view.moves).toEqual([]);

    // The scope answers for the keyboard only, so a d-pad is still the engine's.
    view.input.emit({ intent: "moveDown", source: "gamepad" });
    expect(view.active()).toBe("range");
    expect(view.checked()).toBe("r3");
    expect(view.moves).toEqual(["range"]);
  });

  it("lets ArrowRight and ArrowLeft step a range", async () => {
    const view = scene();
    const range = view.at("range") as HTMLInputElement;
    answerNative(view, range);
    range.focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(range.value).toBe("6");
    await userEvent.keyboard("{ArrowLeft}");
    await userEvent.keyboard("{ArrowLeft}");
    expect(range.value).toBe("4");

    expect(view.active()).toBe("range");
    expect(view.moves).toEqual([]);
  });
});

describe("app mode, a native control and no such scope", () => {
  it("moves the focus spatially, checking nothing and stepping nothing, as before", async () => {
    const view = scene();
    const range = view.at("range") as HTMLInputElement;
    view.at("r1").focus();

    await userEvent.keyboard("{ArrowDown}");
    expect(view.active()).toBe("r2");
    expect(view.checked()).toBe("r1");

    range.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(view.active()).toBe("beside");
    expect(range.value).toBe("5");

    expect(view.moves).toEqual(["r2", "beside"]);
  });
});
