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

function makePad(init: PadInit = {}, buttonCount = 16): Gamepad {
  const buttons = Array.from({ length: buttonCount }, (_unused, index) => {
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

// Six slots and a settable button count: the engine bounds are MAX_PADS = 4 and
// MAX_BUTTONS = 20, and a harness with exactly four slots and sixteen buttons cannot
// represent either boundary, let alone a pad past it.
function harness(
  options: GamepadPluginOptions = {},
  initial: PadInit | null = {},
  buttonCount = 16,
) {
  const pads: (Gamepad | null)[] = [null, null, null, null, null, null];
  if (initial !== null) pads[0] = makePad(initial, buttonCount);

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
      pads[index] = init === null ? null : makePad({ ...init, index }, buttonCount);
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

describe("gamepadPlugin — the inherited hard limits", () => {
  it("polls four pads and ignores a fifth", () => {
    // MAX_PADS = 4, asserted nowhere before this. The harness offers six slots
    // precisely so the boundary and the slot past it are both representable.
    // Slot 0 holds an idle pad because the loop only starts when one is present.
    const scene = harness();
    scene.set({ buttons: { 0: 1 } }, 3);
    scene.set({ buttons: { 1: 1 } }, 4);
    scene.frame(16);

    expect(names(scene.intents)).toEqual(["select"]);
  });

  it("reads twenty buttons and stops there", () => {
    // MAX_BUTTONS = 20. Button 15 is the last of the standard mapping, so a pad
    // reporting more is not exotic — it is any pad with paddles or a touchpad.
    const scene = harness({}, {}, 24);
    scene.set({ buttons: { 15: 1, 21: 1 } });
    scene.frame(16);

    expect(names(scene.intents)).toEqual(["moveRight"]);
  });
});

describe("gamepadPlugin — rumble", () => {
  function padWithActuator(): { pad: Gamepad; play: ReturnType<typeof vi.fn> } {
    const play = vi.fn(() => Promise.resolve("complete"));
    const pad = makePad();
    Object.defineProperty(pad, "vibrationActuator", { value: { playEffect: play } });
    return { pad, play };
  }

  function runtimeFor(pads: (Gamepad | null)[]): GamepadRuntime {
    return {
      getGamepads: (): readonly (Gamepad | null)[] => pads,
      requestFrame: (): number => 1,
      cancelFrame: (): void => {},
    };
  }

  it("plays a dual-rumble effect with the documented defaults", () => {
    const { pad, play } = padWithActuator();
    const plugin = gamepadPlugin({ runtime: runtimeFor([pad]) });
    const input = createInputSystem({ plugins: [plugin] });
    cleanups.push(() => input.destroy());

    plugin.rumble();

    expect(play).toHaveBeenCalledWith("dual-rumble", {
      duration: 120,
      weakMagnitude: 0.4,
      strongMagnitude: 0.2,
    });
  });

  it("takes the caller's numbers when given them", () => {
    const { pad, play } = padWithActuator();
    const plugin = gamepadPlugin({ runtime: runtimeFor([pad]) });
    const input = createInputSystem({ plugins: [plugin] });
    cleanups.push(() => input.destroy());

    plugin.rumble({ duration: 30, weak: 1, strong: 0.5 });

    expect(play).toHaveBeenCalledWith("dual-rumble", {
      duration: 30,
      weakMagnitude: 1,
      strongMagnitude: 0.5,
    });
  });

  it("rumbles the named pad rather than the active one", () => {
    const first = padWithActuator();
    const second = padWithActuator();
    const plugin = gamepadPlugin({ runtime: runtimeFor([first.pad, second.pad]) });
    const input = createInputSystem({ plugins: [plugin] });
    cleanups.push(() => input.destroy());

    plugin.rumble({ padIndex: 1 });

    expect(first.play).not.toHaveBeenCalled();
    expect(second.play).toHaveBeenCalledOnce();
  });

  it("is a no-op on a pad with no haptics", () => {
    const plugin = gamepadPlugin({ runtime: runtimeFor([makePad()]) });
    const input = createInputSystem({ plugins: [plugin] });
    cleanups.push(() => input.destroy());

    expect(() => plugin.rumble()).not.toThrow();
  });

  it("swallows a refusal rather than leaving a rejection nobody watches", async () => {
    const play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    const pad = makePad();
    Object.defineProperty(pad, "vibrationActuator", { value: { playEffect: play } });
    const plugin = gamepadPlugin({ runtime: runtimeFor([pad]) });
    const input = createInputSystem({ plugins: [plugin] });
    cleanups.push(() => input.destroy());

    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);
    cleanups.push(() => window.removeEventListener("unhandledrejection", unhandled));

    plugin.rumble();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(play).toHaveBeenCalledOnce();
    expect(unhandled).not.toHaveBeenCalled();
  });
});

describe("gamepadPlugin — the bits nothing wired up", () => {
  it("reports a connection, its family and its mapping", () => {
    const scene = harness({}, null);
    const seen: { id: string; padType: string; mapping: string; index: number }[] = [];
    cleanups.push(scene.plugin.onConnected((info) => seen.push(info)));

    // A plain Event carrying a `gamepad` property: constructing a real
    // GamepadEvent needs a real Gamepad, which a test cannot mint.
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", {
      value: makePad({ id: "DualSense Wireless Controller", index: 2 }),
    });
    window.dispatchEvent(event);

    expect(seen).toEqual([
      { index: 2, id: "DualSense Wireless Controller", padType: "dualsense", mapping: "standard" },
    ]);
  });

  it("reports a disconnection and forgets what that pad was holding", () => {
    const scene = harness();
    const gone = vi.fn();
    cleanups.push(scene.plugin.onDisconnected(gone));

    scene.set({ buttons: { 0: 1 } }, 1);
    scene.frame(16);

    const event = new Event("gamepaddisconnected");
    Object.defineProperty(event, "gamepad", { value: makePad({ index: 1 }) });
    window.dispatchEvent(event);

    expect(gone).toHaveBeenCalledWith(expect.objectContaining({ index: 1 }));
    // The button is still down, and it emits again, because the slot was cleared.
    scene.frame(32);
    expect(names(scene.intents)).toEqual(["select", "select"]);
  });

  it("stops listening once its own teardown has run", () => {
    const scene = harness({}, null);
    const seen = vi.fn();
    cleanups.push(scene.plugin.onConnected(seen));

    scene.input.destroy();
    const event = new Event("gamepadconnected");
    Object.defineProperty(event, "gamepad", { value: makePad() });
    window.dispatchEvent(event);

    expect(seen).not.toHaveBeenCalled();
  });

  it("ignores an assign outside the four slots", () => {
    const scene = harness();
    const route = vi.fn();

    expect(() => {
      scene.plugin.assign(-1, route);
      scene.plugin.assign(4, route);
    }).not.toThrow();

    scene.set({ buttons: { 0: 1 } });
    scene.frame(16);
    expect(route).not.toHaveBeenCalled();
    expect(names(scene.intents)).toEqual(["select"]);
  });

  it("calls a pad generic until it has seen one", () => {
    const scene = harness({}, null);

    expect(scene.plugin.padType()).toBe("generic");
    expect(scene.plugin.padType(3)).toBe("generic");
    expect(scene.plugin.padType(99)).toBe("generic");
  });
});

/**
 * A blank same-origin iframe, so a test owns a whole Document: `visibilityState`
 * is read-only on the page running the suite, and the engine's battery promise is
 * written entirely in terms of it. Reused by the input-system cases.
 */
function iframeDocument(): Document {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;left:-9999px;width:200px;height:200px";
  document.body.append(frame);
  cleanups.push(() => frame.remove());
  return frame.contentDocument as Document;
}

describe("gamepadPlugin — the battery promise", () => {
  function hidden() {
    const doc = iframeDocument();
    let state: DocumentVisibilityState = "visible";
    Object.defineProperty(doc, "visibilityState", {
      configurable: true,
      get: () => state,
    });

    const pads: (Gamepad | null)[] = [makePad(), null, null, null];
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

    const plugin = gamepadPlugin({ runtime });
    const input = createInputSystem({ doc, plugins: [plugin] });
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
    frame(0);

    return {
      intents,
      frame,
      isPolling: (): boolean => pending !== null,
      press(index: number): void {
        pads[0] = makePad({ buttons: { [index]: 1 } });
      },
      go(to: DocumentVisibilityState): void {
        state = to;
        doc.dispatchEvent(new Event("visibilitychange"));
      },
    };
  }

  it("stops polling outright when the tab goes away", () => {
    const scene = hidden();
    expect(scene.isPolling()).toBe(true);

    scene.go("hidden");

    // Explicit, rather than trusting a hidden tab's rAF to be throttled: "slower"
    // is not "stopped", and this is the whole of the battery claim.
    expect(scene.isPolling()).toBe(false);
  });

  it("comes back without firing what was held while it was away", () => {
    const scene = hidden();
    scene.go("hidden");
    scene.press(0);

    scene.go("visible");
    expect(scene.isPolling()).toBe(true);
    scene.frame(16);
    scene.frame(32);

    // The first frame back re-reads the pads without emitting. Without it, a
    // button pressed in the background surfaces as a phantom activation the
    // instant the user returns.
    expect(names(scene.intents)).toEqual([]);
  });
});
