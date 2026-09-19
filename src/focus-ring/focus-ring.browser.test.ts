import { afterEach, describe, expect, it } from "vitest";
import { createInputSystem, type InputSystem } from "../input-system";
import { setInputModality } from "../modality";
import { focusRingPlugin, RING_ATTRIBUTE } from "./focus-ring";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

interface Scene {
  readonly input: InputSystem;
  readonly ring: HTMLElement;
  button(id: string): HTMLElement;
}

function scene(): Scene {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0";
  host.innerHTML = `
    <button id="one" style="position:absolute;left:20px;top:20px;width:120px;height:40px;border-radius:8px"></button>
    <button id="two" style="position:absolute;left:300px;top:200px;width:60px;height:60px;border-radius:30px"></button>
  `;
  document.body.append(host);

  const input = createInputSystem({ plugins: [focusRingPlugin()] });
  cleanups.push(() => {
    input.destroy();
    host.remove();
  });

  const ring = document.querySelector<HTMLElement>(`[${RING_ATTRIBUTE}]`);
  if (ring === null) throw new Error("the plugin did not inject its overlay");

  return {
    input,
    ring,
    button: (id): HTMLElement => host.querySelector(`#${id}`) as HTMLElement,
  };
}

describe("focusRingPlugin", () => {
  it("injects one inert overlay and takes it away again", () => {
    const view = scene();

    expect(view.ring.getAttribute("aria-hidden")).toBe("true");
    expect(view.ring.style.pointerEvents).toBe("none");
    expect(view.ring.style.position).toBe("fixed");

    view.input.destroy();
    expect(document.querySelector(`[${RING_ATTRIBUTE}]`)).toBeNull();
  });

  it("stays hidden while the user is pointing at things", () => {
    const view = scene();
    setInputModality(document, "pointer");

    view.button("one").focus();

    expect(view.ring.style.opacity).toBe("0");
  });

  it("wears the shape of whatever it surrounds", () => {
    const view = scene();
    setInputModality(document, "keyboard");

    view.button("one").focus();
    expect(view.ring.style.borderRadius).toBe("8px");
    expect(view.ring.style.opacity).toBe("1");
    const first = view.ring.style.transform;

    view.button("two").focus();
    expect(view.ring.style.borderRadius).toBe("30px");
    expect(view.ring.style.transform).not.toBe(first);
  });

  it("sits outside its target by the ring offset", () => {
    const view = scene();
    setInputModality(document, "gamepad");

    view.button("one").focus();

    // The target is 120 × 40 at (20, 20); the ring is inset by the token, whose
    // fallback is 2 px when no stylesheet is loaded.
    expect(view.ring.style.width).toBe("124px");
    expect(view.ring.style.height).toBe("44px");
    expect(view.ring.style.transform).toBe("translate(18px, 18px)");
  });

  it("puts itself away when the focus leaves for nothing", () => {
    const view = scene();
    setInputModality(document, "keyboard");
    view.button("one").focus();
    expect(view.ring.style.opacity).toBe("1");

    view.button("one").blur();

    expect(view.ring.style.opacity).toBe("0");
  });

  it("follows the modality without waiting for a new focus", () => {
    const view = scene();
    setInputModality(document, "keyboard");
    view.button("one").focus();
    expect(view.ring.style.opacity).toBe("1");

    setInputModality(document, "pointer");
    expect(view.ring.style.opacity).toBe("0");

    setInputModality(document, "gamepad");
    expect(view.ring.style.opacity).toBe("1");
  });

  it("hides while the system is paused and comes back on resume", () => {
    const view = scene();
    setInputModality(document, "gamepad");
    view.button("one").focus();

    view.input.pause();
    expect(view.ring.style.opacity).toBe("0");

    view.input.resume();
    expect(view.ring.style.opacity).toBe("1");
  });

  it("animates between targets rather than jumping", () => {
    const view = scene();
    setInputModality(document, "gamepad");

    view.button("one").focus();
    // The first placement has nowhere to travel from, so it is placed, not animated.
    expect(view.ring.getAnimations()).toHaveLength(0);

    view.button("two").focus();
    expect(view.ring.getAnimations().length).toBeGreaterThan(0);
  });
});
