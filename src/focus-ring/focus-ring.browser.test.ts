import { afterEach, describe, expect, it } from "vitest";
import { createInputSystem, type InputSystem } from "../input-system";
import { setInputModality } from "../modality";
import { type FocusRingOptions, focusRingPlugin, RING_ATTRIBUTE } from "./focus-ring";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

interface Scene {
  readonly input: InputSystem;
  readonly ring: HTMLElement;
  button(id: string): HTMLElement;
}

function scene(options?: FocusRingOptions): Scene {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0";
  host.innerHTML = `
    <button id="one" style="position:absolute;left:20px;top:20px;width:120px;height:40px;border-radius:8px"></button>
    <button id="two" style="position:absolute;left:300px;top:200px;width:60px;height:60px;border-radius:30px"></button>
  `;
  document.body.append(host);

  const input = createInputSystem({ plugins: [focusRingPlugin(options)] });
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

  it("paints itself, because no stylesheet ships with the package", () => {
    const view = scene();
    const painted = getComputedStyle(view.ring);

    // The literal in RING_PAINT, resolved: 4.51:1 on white.
    expect(painted.boxShadow).toContain("rgb(26, 115, 232)");
    expect(painted.boxShadow).not.toBe("none");
    // The rung the source stylesheet gave it, above its own modal and tooltip.
    expect(Number(painted.zIndex)).toBe(1700);
  });

  it("lets the application repaint it through the custom properties", () => {
    const view = scene();
    const root = document.documentElement;
    cleanups.push(() => {
      root.style.removeProperty("--snav-focus-ring-color");
      root.style.removeProperty("--snav-focus-ring-width");
      root.style.removeProperty("--snav-focus-ring-z-index");
    });

    root.style.setProperty("--snav-focus-ring-color", "rgb(255, 0, 0)");
    root.style.setProperty("--snav-focus-ring-width", "5px");
    root.style.setProperty("--snav-focus-ring-z-index", "42");

    const painted = getComputedStyle(view.ring);
    expect(painted.boxShadow).toContain("rgb(255, 0, 0)");
    expect(painted.boxShadow).toContain("5px");
    expect(Number(painted.zIndex)).toBe(42);
  });

  it("stacks above ordinary application chrome", () => {
    const view = scene();
    const dialog = document.createElement("div");
    dialog.style.cssText = "position:fixed;inset:0;z-index:1300";
    document.body.append(dialog);
    cleanups.push(() => dialog.remove());

    setInputModality(document, "gamepad");
    view.button("one").focus();

    expect(Number(getComputedStyle(view.ring).zIndex)).toBeGreaterThan(
      Number(getComputedStyle(dialog).zIndex),
    );
  });

  it("fades away rather than cutting out", () => {
    const view = scene();
    setInputModality(document, "gamepad");
    view.button("one").focus();
    for (const animation of view.ring.getAnimations()) animation.cancel();

    view.input.pause();

    expect(view.ring.style.opacity).toBe("0");
    expect(view.ring.getAnimations().length).toBeGreaterThan(0);
  });

  it("fades back in when it returns from hidden", () => {
    const view = scene();
    setInputModality(document, "gamepad");
    view.button("one").focus();
    view.input.pause();
    for (const animation of view.ring.getAnimations()) animation.cancel();

    view.input.resume();

    expect(view.ring.style.opacity).toBe("1");
    expect(view.ring.getAnimations().length).toBeGreaterThan(0);
  });

  it("fades out and back in over 150 ms by default", () => {
    const view = scene();
    setInputModality(document, "gamepad");
    view.button("one").focus();

    view.input.pause();
    expect(fades(view.ring)).toEqual([150]);
    for (const animation of view.ring.getAnimations()) animation.cancel();

    view.input.resume();
    expect(fades(view.ring)).toEqual([150]);
  });

  it.each([
    ["the duration option at 0", { duration: 0 }, null],
    ["--snav-focus-ring-duration at 0ms", {}, "0ms"],
    ["--snav-focus-ring-duration at 0s", {}, "0s"],
  ] as const)("neither fades in nor out with %s", (_, options, property) => {
    const view = scene(options);
    if (property !== null) view.ring.style.setProperty("--snav-focus-ring-duration", property);
    setInputModality(document, "gamepad");
    view.button("one").focus();

    view.input.pause();
    expect(view.ring.style.opacity).toBe("0");
    expect(view.ring.getAnimations()).toHaveLength(0);

    view.input.resume();
    expect(view.ring.style.opacity).toBe("1");
    expect(view.ring.getAnimations()).toHaveLength(0);

    setInputModality(document, "pointer");
    expect(view.ring.style.opacity).toBe("0");
    expect(view.ring.getAnimations()).toHaveLength(0);

    setInputModality(document, "keyboard");
    expect(view.ring.style.opacity).toBe("1");
    expect(view.ring.getAnimations()).toHaveLength(0);
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

function fades(ring: HTMLElement): unknown[] {
  return ring
    .getAnimations()
    .map((animation) => animation.effect)
    .filter(
      (effect): effect is KeyframeEffect =>
        effect instanceof KeyframeEffect &&
        effect.getKeyframes().some((frame) => "opacity" in frame),
    )
    .map((effect) => effect.getTiming().duration);
}
