import { afterEach, describe, expect, it, vi } from "vitest";
import { createIntentBus, type IntentBus } from "./intent-bus";
import type { NavigationIntent } from "./types";

// `within` is answered with `Node.contains`, so these run against a real document rather
// than against stand-ins that would only assert what the stand-in was told to answer.
afterEach(() => {
  document.body.replaceChildren();
});

function element(parent: Element = document.body): HTMLDivElement {
  const created = document.createElement("div");
  parent.append(created);
  return created;
}

function recorder(bus: IntentBus): {
  readonly asked: string[];
  readonly push: (name: string, options?: Parameters<IntentBus["pushScope"]>[1]) => VoidFunction;
} {
  const asked: string[] = [];
  return {
    asked,
    push: (name, options) =>
      bus.pushScope(() => {
        asked.push(name);
        return false;
      }, options),
  };
}

function press(bus: IntentBus, intent: NavigationIntent = "moveDown"): boolean {
  return bus.dispatch({ intent, source: "gamepad" }).consumed;
}

describe("createIntentBus — a trap confined to its surface", () => {
  it("asks a scope beneath the trap whose element is inside the trapping surface", () => {
    const bus = createIntentBus();
    const dialog = element();
    const group = element(dialog);
    const { asked, push } = recorder(bus);
    // The order a framework opens them in one commit: the composite, then the dialog.
    push("composite", { within: group });
    push("dialog", { trapped: true, within: dialog });

    expect(press(bus)).toBe(true);

    // Asked, and asked after the trap: containment does not reorder the stack.
    expect(asked).toEqual(["dialog", "composite"]);
  });

  it("lets a contained scope claim the intent and end the walk", () => {
    const bus = createIntentBus();
    const dialog = element();
    const group = element(dialog);
    const engine = vi.fn(() => false);
    bus.pushScope(engine, { base: true });
    bus.pushScope(() => true, { within: group });
    bus.pushScope(() => false, { trapped: true, within: dialog });

    expect(press(bus)).toBe(true);
    expect(engine).not.toHaveBeenCalled();
  });

  it("counts the surface itself as inside it", () => {
    const bus = createIntentBus();
    const dialog = element();
    const { asked, push } = recorder(bus);
    push("content", { within: dialog });
    push("dialog", { trapped: true, within: dialog });

    press(bus);

    expect(asked).toEqual(["dialog", "content"]);
  });

  it("still silences a scope whose element is outside the surface", () => {
    const bus = createIntentBus();
    const dialog = element();
    const page = element();
    const { asked, push } = recorder(bus);
    push("page", { within: page });
    push("dialog", { trapped: true, within: dialog });

    expect(press(bus)).toBe(true);
    expect(asked).toEqual(["dialog"]);
  });

  it("changes nothing for a trap that names no surface", () => {
    const bus = createIntentBus();
    const dialog = element();
    const group = element(dialog);
    const { asked, push } = recorder(bus);
    push("composite", { within: group });
    push("dialog", { trapped: true });

    expect(press(bus)).toBe(true);
    expect(asked).toEqual(["dialog"]);
  });

  it("changes nothing for a scope that names no element", () => {
    const bus = createIntentBus();
    const dialog = element();
    const { asked, push } = recorder(bus);
    push("composite");
    push("dialog", { trapped: true, within: dialog });

    expect(press(bus)).toBe(true);
    expect(asked).toEqual(["dialog"]);
  });

  it("reads a getter at dispatch, so an element attached after the push counts", () => {
    const bus = createIntentBus();
    let dialog: HTMLElement | null = null;
    let group: HTMLElement | null = null;
    const { asked, push } = recorder(bus);
    // Pushed before either element exists, which is what an adapter's first commit does.
    push("composite", { within: () => group });
    push("dialog", { trapped: true, within: () => dialog });

    press(bus);
    expect(asked).toEqual(["dialog"]);

    dialog = element();
    group = element(dialog);
    press(bus);

    expect(asked).toEqual(["dialog", "dialog", "composite"]);
  });

  it("treats a getter answering null as no element, on either side", () => {
    const bus = createIntentBus();
    const dialog = element();
    const { asked, push } = recorder(bus);
    push("composite", { within: () => null });
    push("dialog", { trapped: true, within: dialog });
    press(bus);
    expect(asked).toEqual(["dialog"]);

    const other = createIntentBus();
    const group = element(dialog);
    const second = recorder(other);
    second.push("composite", { within: group });
    second.push("dialog", { trapped: true, within: () => undefined });
    press(other);
    expect(second.asked).toEqual(["dialog"]);
  });

  it("still asks a base scope, which names no element", () => {
    const bus = createIntentBus();
    const dialog = element();
    const group = element(dialog);
    const { asked, push } = recorder(bus);
    push("engine", { base: true });
    push("page");
    push("composite", { within: group });
    push("dialog", { trapped: true, within: dialog });

    expect(press(bus)).toBe(true);
    expect(asked).toEqual(["dialog", "composite", "engine"]);
  });

  it("lets back and the tab pair reach every scope, contained or not", () => {
    const bus = createIntentBus();
    const dialog = element();
    const group = element(dialog);
    const { asked, push } = recorder(bus);
    push("page");
    push("composite", { within: group });
    push("dialog", { trapped: true, within: dialog });

    for (const intent of ["back", "tabNext", "tabPrev"] as const) {
      expect(press(bus, intent)).toBe(false);
    }

    expect(asked).toEqual([
      ...["dialog", "composite", "page"],
      ...["dialog", "composite", "page"],
      ...["dialog", "composite", "page"],
    ]);
  });

  it("confines to the upper dialog when a second one opens over the first", () => {
    const bus = createIntentBus();
    const first = element();
    const firstGroup = element(first);
    const second = element();
    const secondGroup = element(second);
    const { asked, push } = recorder(bus);
    push("first composite", { within: firstGroup });
    push("first dialog", { trapped: true, within: first });
    push("second composite", { within: secondGroup });
    push("second dialog", { trapped: true, within: second });

    press(bus);

    expect(asked).toEqual(["second dialog", "second composite"]);
  });

  it("confines to the upper dialog when it is nested inside the first one in the DOM", () => {
    const bus = createIntentBus();
    const first = element();
    const firstGroup = element(first);
    const second = element(first);
    const secondGroup = element(second);
    const { asked, push } = recorder(bus);
    push("first composite", { within: firstGroup });
    push("first dialog", { trapped: true, within: first });
    push("second composite", { within: secondGroup });
    push("second dialog", { trapped: true, within: second });

    press(bus);

    // The first dialog's element holds the second one, not the other way round.
    expect(asked).toEqual(["second dialog", "second composite"]);
  });

  it("narrows to a nested dialog opened in the same commit as the one around it", () => {
    const bus = createIntentBus();
    const outer = element();
    const outerGroup = element(outer);
    const inner = element(outer);
    const innerGroup = element(inner);
    const { asked, push } = recorder(bus);
    // Children first, the outermost dialog last and therefore on top.
    push("outer composite", { within: outerGroup });
    push("inner composite", { within: innerGroup });
    push("inner dialog", { trapped: true, within: inner });
    push("outer dialog", { trapped: true, within: outer });

    press(bus);

    // The inner dialog is inside the outer surface, so it is asked; being a trap, its own
    // surface is the one that counts below it, and the outer dialog's composite is
    // silenced by the modal drawn over it.
    expect(asked).toEqual(["outer dialog", "inner dialog", "inner composite"]);
  });
});
