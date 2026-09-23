import { describe, expect, it, vi } from "vitest";
import { createIntentBus, createIntentEvent } from "./intent-bus";
import type { IntentEvent } from "./types";

describe("createIntentEvent", () => {
  it("defaults the optional half and reports its own prevention", () => {
    const event = createIntentEvent({ intent: "moveDown", source: "gamepad" });

    expect(event.repeat).toBe(false);
    expect(event.originalEvent).toBeNull();
    expect(event.defaultPrevented).toBe(false);

    event.preventDefault();
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("createIntentBus", () => {
  it("asks the deepest scope first", () => {
    const bus = createIntentBus();
    const order: string[] = [];
    bus.pushScope(() => {
      order.push("outer");
    });
    bus.pushScope(() => {
      order.push("inner");
    });

    bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(order).toEqual(["inner", "outer"]);
  });

  it("stops the walk when a scope claims the intent", () => {
    const bus = createIntentBus();
    const outer = vi.fn();
    bus.pushScope(outer);
    bus.pushScope(() => true);

    const result = bus.dispatch({ intent: "select", source: "gamepad" });

    expect(outer).not.toHaveBeenCalled();
    expect(result).toMatchObject({ consumed: true, defaultPrevented: true });
  });

  it("reports a bare preventDefault without claiming the intent", () => {
    const bus = createIntentBus();
    const outer = vi.fn();
    bus.pushScope(outer);
    bus.pushScope((event: IntentEvent) => {
      event.preventDefault();
    });

    const result = bus.dispatch({ intent: "moveUp", source: "keyboard" });

    expect(outer).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ consumed: false, defaultPrevented: true });
    expect(result.event.intent).toBe("moveUp");
  });

  it("swallows what a trapped scope did not handle", () => {
    const bus = createIntentBus();
    const outer = vi.fn();
    bus.pushScope(outer);
    bus.pushScope(() => {}, { trapped: true });

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(outer).not.toHaveBeenCalled();
  });

  it("asks a base scope through a trap, and still swallows when it declines", () => {
    const bus = createIntentBus();
    const engine = vi.fn(() => false);
    const component = vi.fn();
    // The real order: the engine is pushed at setup, the component later, the
    // modal last.
    bus.pushScope(engine, { base: true });
    bus.pushScope(component);
    bus.pushScope(() => {}, { trapped: true });

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    expect(component).not.toHaveBeenCalled();
    expect(engine).toHaveBeenCalledOnce();
  });

  it("lets a base scope act through a trap, which is what keeps a modal navigable", () => {
    const bus = createIntentBus();
    const moved: string[] = [];
    const component = vi.fn();
    bus.pushScope(
      (event) => {
        moved.push(event.intent);
        return true;
      },
      { base: true },
    );
    bus.pushScope(component);
    bus.pushScope(() => {}, { trapped: true });

    expect(bus.dispatch({ intent: "moveDown", source: "gamepad" }).consumed).toBe(true);
    // The page's own component stays silenced — that half of the trap is intact.
    expect(component).not.toHaveBeenCalled();
    expect(moved).toEqual(["moveDown"]);
  });

  it("lets back and the tab pair through a trap", () => {
    const bus = createIntentBus();
    const outer = vi.fn();
    bus.pushScope(outer);
    bus.pushScope(() => {}, { trapped: true });

    for (const intent of ["back", "tabNext", "tabPrev"] as const) {
      bus.dispatch({ intent, source: "keyboard" });
    }

    expect(outer).toHaveBeenCalledTimes(3);
  });

  it("survives a handler that opens or closes a scope mid-dispatch", () => {
    const bus = createIntentBus();
    const outer = vi.fn();
    bus.pushScope(outer);
    const disposeMiddle = bus.pushScope(() => {});
    bus.pushScope(() => {
      disposeMiddle();
      bus.pushScope(() => true);
    });

    const result = bus.dispatch({ intent: "moveLeft", source: "keyboard" });

    // The scope pushed during the walk is not consulted for the event that opened
    // it, and the one disposed on the way down is skipped rather than crashed into.
    expect(outer).toHaveBeenCalledOnce();
    expect(result.consumed).toBe(false);
  });

  it("pops a scope once, however many times its dispose is called", () => {
    const bus = createIntentBus();
    const dispose = bus.pushScope(() => {});
    bus.pushScope(() => {});

    dispose();
    dispose();

    expect(bus.depth()).toBe(1);
  });

  it("carries the analogue payload through untouched", () => {
    const bus = createIntentBus();
    const seen: number[] = [];
    bus.pushScope((event: IntentEvent) => {
      if (event.value !== undefined) seen.push(event.value);
    });

    bus.dispatch({ intent: "scrollY", source: "gamepad", value: -0.42 });

    expect(seen).toEqual([-0.42]);
  });
});

describe("createIntentBus — the native answer (ADR-0026)", () => {
  it("answers true and false exactly as before a third answer existed", () => {
    const bus = createIntentBus();
    const answer = vi.fn<() => boolean | undefined>(() => true);
    bus.pushScope(answer);

    expect(bus.dispatch({ intent: "moveDown", source: "keyboard" })).toMatchObject({
      consumed: true,
      defaultPrevented: true,
    });
    answer.mockReturnValue(false);
    expect(bus.dispatch({ intent: "moveDown", source: "keyboard" })).toMatchObject({
      consumed: false,
      defaultPrevented: false,
    });
    answer.mockReturnValue(undefined);
    expect(bus.dispatch({ intent: "moveDown", source: "keyboard" })).toMatchObject({
      consumed: false,
      defaultPrevented: false,
    });
  });

  it("stops the walk, the base scope included, and leaves the default", () => {
    const bus = createIntentBus();
    const engine = vi.fn(() => true);
    const page = vi.fn(() => true);
    bus.pushScope(engine, { base: true });
    bus.pushScope(page);
    bus.pushScope(() => "native");

    const result = bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(page).not.toHaveBeenCalled();
    expect(engine).not.toHaveBeenCalled();
    expect(result).toMatchObject({ consumed: false, defaultPrevented: false });
  });

  it("does not undo a preventDefault made by a scope asked before it", () => {
    const bus = createIntentBus();
    const engine = vi.fn(() => true);
    bus.pushScope(engine, { base: true });
    bus.pushScope(() => "native");
    bus.pushScope((event: IntentEvent) => {
      event.preventDefault();
      return false;
    });

    const result = bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(engine).not.toHaveBeenCalled();
    expect(result).toMatchObject({ consumed: false, defaultPrevented: true });
  });

  it("ends a trapped walk with the default kept when a base scope answers native", () => {
    const bus = createIntentBus();
    const page = vi.fn(() => true);
    bus.pushScope(() => "native", { base: true });
    bus.pushScope(page);
    bus.pushScope(() => false, { trapped: true });

    const result = bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(page).not.toHaveBeenCalled();
    expect(result).toMatchObject({ consumed: false, defaultPrevented: false });
  });

  it("ends the walk with the default kept when the trap itself answers native", () => {
    const bus = createIntentBus();
    const engine = vi.fn(() => true);
    bus.pushScope(engine, { base: true });
    bus.pushScope(() => "native", { trapped: true });

    const result = bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(engine).not.toHaveBeenCalled();
    expect(result).toMatchObject({ consumed: false, defaultPrevented: false });
  });

  it("still swallows through a trap when the only native answer is one it silenced", () => {
    const bus = createIntentBus();
    const page = vi.fn(() => "native" as const);
    const engine = vi.fn(() => false);
    bus.pushScope(engine, { base: true });
    bus.pushScope(page);
    bus.pushScope(() => false, { trapped: true });

    const result = bus.dispatch({ intent: "moveDown", source: "keyboard" });

    expect(page).not.toHaveBeenCalled();
    expect(engine).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ consumed: true, defaultPrevented: true });
  });
});
