import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputSystem } from "../input-system";
import type { IntentEvent } from "../types";
import { type GamepadPluginOptions, type GamepadRuntime, gamepadPlugin } from "./gamepad";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

interface PadInit {
  readonly id?: string;
  readonly index?: number;
  /** Button index to analogue value; anything over 0.5 also reads as `pressed`. */
  readonly buttons?: Readonly<Record<number, number>>;
  readonly axes?: readonly number[];
}

function makePad(init: PadInit = {}): Gamepad {
  const buttons = Array.from({ length: 16 }, (_unused, index) => {
    const value = init.buttons?.[index] ?? 0;
    return { pressed: value > 0.5, touched: value > 0, value };
  });
  // The DOM lib types `vibrationActuator` as always present, so a structural stand-in
  // needs one cast. It is confined to this helper.
  return {
    index: init.index ?? 0,
    id: init.id ?? "Test Pad (STANDARD GAMEPAD)",
    connected: true,
    mapping: "standard",
    timestamp: 0,
    axes: init.axes ?? [0, 0, 0, 0],
    buttons,
  } as unknown as Gamepad;
}

function harness(options: GamepadPluginOptions = {}, initial: PadInit | null = {}) {
  const pads: (Gamepad | null)[] = [null, null, null, null];
  if (initial !== null) pads[0] = makePad(initial);

  let pending: ((now: number) => void) | null = null;
  const runtime: GamepadRuntime = {
    getGamepads: (): readonly (Gamepad | null)[] => pads,
    requestFrame(callback): number {
      pending = callback;
      return 1;
    },
    cancelFrame(): void {
      pending = null;
    },
  };

  const plugin = gamepadPlugin({ ...options, runtime });
  const input = createInputSystem({ plugins: [plugin] });
  const intents: IntentEvent[] = [];
  const off = input.onIntent((event) => intents.push(event));
  cleanups.push(() => {
    off();
    input.destroy();
  });

  const frame = (now: number): void => {
    const callback = pending;
    pending = null;
    callback?.(now);
  };
  // A pad present before setup gets one silent frame: whatever it is holding belongs
  // to before we existed.
  frame(0);

  return {
    plugin,
    input,
    intents,
    frame,
    isPolling: (): boolean => pending !== null,
    set(init: PadInit | null, index = 0): void {
      pads[index] = init === null ? null : makePad({ ...init, index });
    },
  };
}

function names(intents: readonly IntentEvent[]): string[] {
  return intents.map((event) => event.intent);
}

describe("gamepadPlugin", () => {
  it("emits the contractual grammar for the face buttons", () => {
    const scene = harness();

    scene.set({ buttons: { 0: 1 } });
    scene.frame(16);
    scene.set({ buttons: { 2: 1 } });
    scene.frame(32);
    scene.set({ buttons: { 3: 1 } });
    scene.frame(48);

    expect(names(scene.intents)).toEqual(["select", "secondary", "contextMenu"]);
    expect(scene.intents[0]?.source).toBe("gamepad");
  });

  it("takes the modality the moment a pad is used", () => {
    const scene = harness();
    expect(scene.input.modality).toBe("pointer");

    scene.set({ buttons: { 0: 1 } });
    scene.frame(16);

    expect(scene.input.modality).toBe("gamepad");
  });

  it("never repeats an activation, however long it is held", () => {
    const scene = harness();
    scene.set({ buttons: { 0: 1 } });

    for (let now = 16; now <= 2_000; now += 16) scene.frame(now);

    expect(names(scene.intents)).toEqual(["select"]);
  });

  it("repeats a direction on the delay-then-interval ladder", () => {
    const scene = harness();
    scene.set({ buttons: { 13: 1 } });

    scene.frame(16);
    expect(names(scene.intents)).toEqual(["moveDown"]);

    for (let now = 32; now < 400; now += 16) scene.frame(now);
    expect(scene.intents).toHaveLength(1);

    scene.frame(420);
    expect(scene.intents).toHaveLength(2);
    expect(scene.intents[1]?.repeat).toBe(true);
  });

  it("stops repeating the moment the button comes up", () => {
    const scene = harness();
    scene.set({ buttons: { 13: 1 } });
    scene.frame(16);
    scene.set({ buttons: {} });
    scene.frame(32);

    for (let now = 48; now <= 1_200; now += 16) scene.frame(now);

    expect(scene.intents).toHaveLength(1);
  });

  it("makes one flick of the stick exactly one move", () => {
    const scene = harness();
    scene.set({ axes: [0, -0.9, 0, 0] });

    for (let now = 16; now < 400; now += 16) scene.frame(now);

    expect(names(scene.intents)).toEqual(["moveUp"]);
  });

  it("gives the direction back when the stick recentres", () => {
    const scene = harness();
    scene.set({ axes: [0, -0.9, 0, 0] });
    scene.frame(16);
    scene.set({ axes: [0, 0, 0, 0] });
    scene.frame(32);
    scene.set({ axes: [0, -0.9, 0, 0] });
    scene.frame(48);

    expect(names(scene.intents)).toEqual(["moveUp", "moveUp"]);
  });

  it("asks for a firmer pull on a trigger than to keep holding it", () => {
    const scene = harness();

    scene.set({ buttons: { 6: 0.4 } });
    scene.frame(16);
    expect(scene.intents).toHaveLength(0);

    scene.set({ buttons: { 6: 0.6 } });
    scene.frame(32);
    expect(names(scene.intents)).toEqual(["pageUp"]);

    scene.set({ buttons: { 6: 0.4 } });
    scene.frame(48);
    scene.set({ buttons: { 6: 0.2 } });
    scene.frame(64);
    scene.set({ buttons: { 6: 0.6 } });
    scene.frame(80);
    expect(names(scene.intents)).toEqual(["pageUp", "pageUp"]);
  });

  it("scrolls from the right stick and signs off with a zero", () => {
    const scene = harness();
    scene.set({ axes: [0, 0, 0.8, 0] });
    scene.frame(16);

    const first = scene.intents[0];
    expect(first?.intent).toBe("scrollX");
    expect(first?.value).toBeGreaterThan(0);

    scene.set({ axes: [0, 0, 0, 0] });
    scene.frame(32);

    const last = scene.intents.slice(-2);
    expect(names(last)).toEqual(["scrollX", "scrollY"]);
    expect(last[0]?.value).toBe(0);
  });

  it("leaves the right stick alone when scrolling is off", () => {
    const scene = harness({ scroll: false });
    scene.set({ axes: [0, 0, 0.8, 0] });
    scene.frame(16);

    expect(scene.intents).toHaveLength(0);
  });

  it("applies a remap keyed by the pad's own id", () => {
    const scene = harness({}, { id: "Odd Pad" });
    scene.plugin.setMapping("Odd Pad", { 0: "contextMenu", 1: null });

    scene.set({ id: "Odd Pad", buttons: { 0: 1, 1: 1 } });
    scene.frame(16);

    expect(names(scene.intents)).toEqual(["contextMenu"]);
  });

  it("puts confirm on the glyph only when asked", () => {
    const scene = harness({ swapNintendoConfirm: true });
    scene.set({ buttons: { 0: 1 } });
    scene.frame(16);

    expect(names(scene.intents)).toEqual(["back"]);
  });

  it("routes an assigned pad away from the shared stack", () => {
    const scene = harness();
    const route = vi.fn();
    scene.plugin.assign(0, route);

    scene.set({ buttons: { 0: 1 } });
    scene.frame(16);

    expect(route).toHaveBeenCalledOnce();
    expect(route.mock.calls[0]?.[0].intent).toBe("select");
    expect(scene.intents).toHaveLength(0);
  });

  it("merges every pad into the same navigation by default", () => {
    const scene = harness();
    scene.set({ buttons: { 13: 1 } });
    scene.set({ buttons: { 12: 1 } }, 1);
    scene.frame(16);

    expect(names(scene.intents)).toEqual(["moveDown", "moveUp"]);
    expect(scene.plugin.activeIndex).toBe(1);
  });

  it("names the pad family so the ui can draw the right glyphs", () => {
    const scene = harness({}, { id: "DualSense Wireless Controller" });

    expect(scene.plugin.padType(0)).toBe("dualsense");
    expect(scene.plugin.padType(3)).toBe("generic");
  });

  it("stops polling while paused and fires nothing that was held through it", () => {
    const scene = harness();

    scene.input.pause();
    expect(scene.isPolling()).toBe(false);

    scene.set({ buttons: { 0: 1 } });
    scene.input.resume();
    scene.frame(16);
    scene.frame(32);

    expect(scene.intents).toHaveLength(0);
  });

  it("lets go of the loop when the last pad does", () => {
    const scene = harness();
    expect(scene.isPolling()).toBe(true);

    scene.set(null);
    scene.frame(16);

    expect(scene.isPolling()).toBe(false);
  });

  it("stops polling once the system is destroyed", () => {
    const scene = harness();

    scene.input.destroy();

    expect(scene.isPolling()).toBe(false);
  });
});
