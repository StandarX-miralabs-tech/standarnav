import { describe, expect, it, vi } from "vitest";
import { pushEngageScope } from "./engage";
import { createIntentBus } from "./intent-bus";

describe("pushEngageScope", () => {
  it("turns the directional intents into adjustments", () => {
    const bus = createIntentBus();
    const onAdjust = vi.fn();
    pushEngageScope(bus, { onAdjust });

    const result = bus.dispatch({ intent: "moveRight", source: "gamepad" });

    expect(onAdjust).toHaveBeenCalledWith(
      "moveRight",
      expect.objectContaining({ intent: "moveRight" }),
    );
    expect(result.consumed).toBe(true);
  });

  it("adjusts on the paging and extreme intents too", () => {
    const bus = createIntentBus();
    const seen: string[] = [];
    pushEngageScope(bus, { onAdjust: (intent) => seen.push(intent) });

    for (const intent of ["pageUp", "pageDown", "home", "end"] as const) {
      bus.dispatch({ intent, source: "gamepad" });
    }

    expect(seen).toEqual(["pageUp", "pageDown", "home", "end"]);
  });

  it("commits on select and pops its own scope", () => {
    const bus = createIntentBus();
    const onRelease = vi.fn();
    pushEngageScope(bus, { onAdjust: vi.fn(), onRelease });

    bus.dispatch({ intent: "select", source: "gamepad" });

    expect(onRelease).toHaveBeenCalledWith(true);
    expect(bus.depth()).toBe(0);
  });

  it("backs out on back, and never lets it reach the layer underneath", () => {
    const bus = createIntentBus();
    const underneath = vi.fn();
    bus.pushScope(underneath);
    const onRelease = vi.fn();
    pushEngageScope(bus, { onAdjust: vi.fn(), onRelease });

    const result = bus.dispatch({ intent: "back", source: "gamepad" });

    expect(onRelease).toHaveBeenCalledWith(false);
    expect(result.consumed).toBe(true);
    expect(underneath).not.toHaveBeenCalled();
  });

  it("releases once", () => {
    const bus = createIntentBus();
    const onRelease = vi.fn();
    pushEngageScope(bus, { onAdjust: vi.fn(), onRelease });

    bus.dispatch({ intent: "select", source: "gamepad" });
    bus.dispatch({ intent: "back", source: "gamepad" });

    expect(onRelease).toHaveBeenCalledOnce();
  });

  it("lets anything it has no claim on fall through", () => {
    const bus = createIntentBus();
    const underneath = vi.fn();
    bus.pushScope(underneath);
    pushEngageScope(bus, { onAdjust: vi.fn() });

    bus.dispatch({ intent: "contextMenu", source: "gamepad" });

    expect(underneath).toHaveBeenCalledOnce();
  });

  it("detaches silently — unmounting is not the user letting go", () => {
    const bus = createIntentBus();
    const onRelease = vi.fn();
    const dispose = pushEngageScope(bus, { onAdjust: vi.fn(), onRelease });

    dispose();

    expect(onRelease).not.toHaveBeenCalled();
    expect(bus.depth()).toBe(0);
  });

  it("adjusts inside a trapped dialog with no `within`, because A opens it above the trap", () => {
    const bus = createIntentBus();
    const onAdjust = vi.fn();
    bus.pushScope(() => false, { trapped: true });
    pushEngageScope(bus, { onAdjust });

    const result = bus.dispatch({ intent: "moveLeft", source: "gamepad" });

    // Why engage mode passes no element (ADR-0025): its scope is opened by the user's A,
    // after the dialog it sits in, so the trap is beneath it and never in the way.
    expect(onAdjust).toHaveBeenCalledOnce();
    expect(result.consumed).toBe(true);
  });
});
