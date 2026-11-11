import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { createInputSystem } from "../input-system";
import { spatialPlugin } from "./spatial";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 150));

function button(id: string, top: number): string {
  return `<button id="${id}" style="position:absolute;left:0;top:${top}px;width:200px;height:40px"></button>`;
}

interface View {
  readonly host: HTMLElement;
  at(id: string): HTMLElement;
  focus(selector: string): void;
  active(): string;
}

function scene(html: string, scrolls = false): View {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:0;top:0;width:200px;height:160px;overflow:${scrolls ? "auto" : "visible"}`;
  host.innerHTML = html;
  document.body.append(host);
  const plugin = spatialPlugin({ root: host, mode: "app" });
  const input = createInputSystem({ plugins: [plugin] });
  cleanups.push(() => {
    input.destroy();
    host.remove();
  });
  return {
    host,
    at: (id) => host.querySelector(`#${id}`) as HTMLElement,
    focus: (selector) => plugin.focus(selector),
    active: () => document.activeElement?.id ?? "",
  };
}

function rows(): View {
  let html = "";
  for (let index = 0; index < 12; index++) html += button(`r${index}`, index * 40);
  return scene(`<div style="position:relative;height:480px">${html}</div>`, true);
}

/** Moves the real mouse to the spot at `top`, through an element outside every root. */
async function park(top: number): Promise<void> {
  const spot = document.createElement("div");
  spot.style.cssText = `position:fixed;left:0;top:${top}px;width:200px;height:40px`;
  document.body.append(spot);
  await userEvent.hover(spot);
  spot.remove();
}

describe("spatialPlugin — pointerFollowsFocus follows the mouse, not the layout (ADR-0036)", () => {
  it("keeps the focus when a scroll brings another node under a resting mouse", async () => {
    const view = rows();
    await userEvent.hover(view.at("r2"));
    await userEvent.hover(view.at("r1"));
    expect(view.active()).toBe("r1");
    view.focus("#r0");

    view.host.scrollBy(0, 120);
    await settle();

    expect(view.active()).toBe("r0");
  });

  it("still follows a mouse that moves after the scroll", async () => {
    const view = rows();
    await userEvent.hover(view.at("r2"));
    await userEvent.hover(view.at("r1"));
    view.focus("#r0");
    view.host.scrollBy(0, 120);
    await settle();

    await userEvent.hover(view.at("r5"));

    expect(view.active()).toBe("r5");
  });

  it("keeps the focus when a node mounts under a mouse parked after the set-up", async () => {
    const view = scene(button("a", 0));
    view.focus("#a");
    await park(100);

    view.host.insertAdjacentHTML("beforeend", button("b", 100));
    await settle();

    expect(view.active()).toBe("a");
  });

  it("keeps the focus when the scene mounts under a mouse parked before it", async () => {
    await park(100);
    const view = scene(button("a", 0) + button("b", 100));
    view.focus("#a");
    await settle();

    expect(view.active()).toBe("a");
  });
});
