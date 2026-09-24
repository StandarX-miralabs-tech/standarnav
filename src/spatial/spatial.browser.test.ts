import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputSystem, type InputSystem } from "../input-system";
import { type SpatialPlugin, type SpatialPluginOptions, spatialPlugin } from "./spatial";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
  document.body.querySelector("#nav-root")?.remove();
});

function box(id: string, x: number, y: number, width = 100, height = 40, extra = ""): string {
  return `<button id="${id}" ${extra} style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px"></button>`;
}

interface Scene {
  readonly host: HTMLElement;
  readonly plugin: SpatialPlugin;
  readonly input: InputSystem;
  move(direction: "up" | "down" | "left" | "right", source?: "gamepad" | "keyboard"): void;
  arrow(key: string): KeyboardEvent;
  active(): string;
  at(id: string): HTMLElement;
}

function scene(html: string, options: SpatialPluginOptions = {}): Scene {
  const host = document.createElement("div");
  host.id = "nav-root";
  host.style.cssText = "position:fixed;left:0;top:0;width:560px;height:340px";
  host.innerHTML = html;
  document.body.append(host);

  const plugin = spatialPlugin({ root: host, ...options });
  const input = createInputSystem({ plugins: [plugin] });
  cleanups.push(() => {
    input.destroy();
    host.remove();
  });

  return {
    host,
    plugin,
    input,
    move(direction, source = "gamepad"): void {
      const intent = `move${direction[0]?.toUpperCase()}${direction.slice(1)}` as
        | "moveUp"
        | "moveDown"
        | "moveLeft"
        | "moveRight";
      input.emit({ intent, source });
    },
    arrow(key): KeyboardEvent {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      return event;
    },
    active: (): string => document.activeElement?.id ?? "",
    at: (id): HTMLElement => host.querySelector(`#${id}`) as HTMLElement,
  };
}

/** A three by three grid of plain buttons, carrying no attributes whatsoever. */
function grid(): string {
  let html = "";
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      html += box(`c${row}${column}`, column * 120, row * 60);
    }
  }
  return html;
}

describe("spatialPlugin — plain HTML", () => {
  it("makes an unannotated grid navigable with no application code", () => {
    const view = scene(grid());

    view.move("down");
    expect(view.active()).toBe("c00");

    view.move("right");
    expect(view.active()).toBe("c01");
    view.move("down");
    expect(view.active()).toBe("c11");
    view.move("left");
    expect(view.active()).toBe("c10");
    view.move("up");
    expect(view.active()).toBe("c00");
  });

  it("stops at the edge and says so", () => {
    const view = scene(grid());
    const onBounds = vi.fn();
    cleanups.push(view.plugin.onBoundsHit(onBounds));

    view.plugin.focus("#c00");
    view.move("up");

    expect(view.active()).toBe("c00");
    expect(onBounds).toHaveBeenCalledWith("up");
  });

  it("marks the focused element and its container for the styles", () => {
    const view = scene(grid());

    view.plugin.focus("#c11");

    expect(document.querySelector("[data-snav-focused]")?.id).toBe("c11");
    expect(view.host.hasAttribute("data-snav-active")).toBe(true);

    view.move("right");
    expect(document.querySelectorAll("[data-snav-focused]")).toHaveLength(1);
    expect(document.querySelector("[data-snav-focused]")?.id).toBe("c12");
  });

  it("skips what is marked ignorable", () => {
    const view = scene(
      box("a", 0, 0) + box("skipme", 120, 0, 100, 40, "data-snav-ignore") + box("b", 240, 0),
    );
    view.plugin.focus("#a");

    view.move("right");

    expect(view.active()).toBe("b");
  });

  it("takes an explicit redirection over the geometry", () => {
    const view = scene(
      box("a", 0, 0, 100, 40, 'data-snav-right="#far"') + box("near", 120, 0) + box("far", 240, 0),
    );
    view.plugin.focus("#a");

    view.move("right");

    expect(view.active()).toBe("far");
  });

  it("ignores a redirection to a target that cannot take the focus", () => {
    const view = scene(
      box("a", 0, 0, 100, 40, 'data-snav-right="#far"') +
        box("near", 120, 0) +
        box("far", 240, 0, 100, 40, "disabled"),
    );
    view.plugin.focus("#a");

    view.move("right");

    expect(view.active()).toBe("near");
    expect(view.at("far").hasAttribute("data-snav-focused")).toBe(false);
  });
});

describe("spatialPlugin — a focus the browser refuses", () => {
  it("steps over the controls of a disabled fieldset", () => {
    const view = scene(
      `${box("a", 0, 0)}<fieldset disabled>${box("b", 120, 0)}</fieldset>${box("c", 240, 0)}`,
    );
    view.plugin.focus("#a");

    view.move("right");

    expect(view.active()).toBe("c");
    expect(document.querySelector("[data-snav-focused]")?.id).toBe("c");
    expect(view.at("b").hasAttribute("data-snav-focused")).toBe(false);
  });

  /**
   * A `focus` method that does nothing: the engine cannot tell it from a browser that
   * refuses, and it refuses the same way on every engine. The second `<summary>` that
   * was the witness here until 2026-09-24 is no candidate any more (ADR-0030), and no
   * other element was measured that chromium, firefox and webkit all refuse while the
   * selector still accepts it: the `<embed>` and `<object>` that refuse do so on some
   * engines only, as ADR-0030 records.
   */
  function refusing(): Scene {
    const view = scene(`${box("a", 0, 0)}${box("second", 120, 0)}`);
    // Replaced, not spied on: a spy would call through, and nothing is to happen.
    view.at("second").focus = (): void => {};
    return view;
  }

  it("writes nothing when the focus does not land", () => {
    const view = refusing();
    view.plugin.focus("#a");

    expect(view.plugin.focus("#second")).toBe(false);

    expect(view.active()).toBe("a");
    expect(document.querySelector("[data-snav-focused]")?.id).toBe("a");
  });

  it("reports a move whose target refused the focus as not made", () => {
    const view = refusing();
    view.plugin.focus("#a");

    expect(view.plugin.move("right")).toBe(false);

    expect(view.active()).toBe("a");
    expect(view.at("second").hasAttribute("data-snav-focused")).toBe(false);
    expect(document.querySelector("[data-snav-focused]")?.id).toBe("a");
  });
});

describe("spatialPlugin — the two modes", () => {
  it("leaves the arrow keys to the composites by default", () => {
    const view = scene(grid());
    view.plugin.focus("#c00");

    const event = view.arrow("ArrowRight");

    expect(view.active()).toBe("c00");
    expect(event.defaultPrevented).toBe(false);
  });

  it("still crosses the whole page with a gamepad in composite mode", () => {
    const view = scene(grid());
    view.plugin.focus("#c00");

    view.move("right", "gamepad");

    expect(view.active()).toBe("c01");
  });

  it("gives the arrow keys the run of the page in app mode", () => {
    const view = scene(grid(), { mode: "app" });
    view.plugin.focus("#c00");

    const event = view.arrow("ArrowRight");

    expect(view.active()).toBe("c01");
    expect(event.defaultPrevented).toBe(true);
  });
});

const columns =
  `<div id="left" data-snav="container" style="position:absolute;left:0;top:0;width:100px;height:160px">` +
  box("l1", 0, 0) +
  box("l2", 0, 60) +
  box("l3", 0, 120) +
  `</div>` +
  `<div id="right" data-snav="container" style="position:absolute;left:200px;top:0;width:100px;height:160px">` +
  box("r1", 0, 0) +
  box("r2", 0, 60) +
  box("r3", 0, 120) +
  `</div>`;

describe("spatialPlugin — containers", () => {
  it("bubbles out of a container and enters the next by geometry", () => {
    const view = scene(columns);
    view.plugin.focus("#l2");

    view.move("right");

    expect(view.active()).toBe("r2");
  });

  it("remembers where it left a container", () => {
    const view = scene(columns);
    view.plugin.focus("#l3");
    view.move("right");
    expect(view.active()).toBe("r3");

    view.move("up");
    expect(view.active()).toBe("r2");

    // Geometry alone would answer `l2`; the container's memory answers `l3`.
    view.move("left");
    expect(view.active()).toBe("l3");
  });

  it("enters at the first child when told to", () => {
    const view = scene(
      columns.replace(
        'id="right" data-snav="container"',
        'id="right" data-snav="container" data-snav-enter="first"',
      ),
    );
    view.plugin.focus("#l3");

    view.move("right");

    expect(view.active()).toBe("r1");
  });

  it("falls back to geometry when the remembered child is gone", () => {
    const view = scene(columns);
    view.plugin.focus("#r3");
    view.plugin.focus("#l3");
    document.querySelector("#r3")?.remove();

    view.move("right");

    expect(view.active()).toBe("r2");
  });

  it("refuses to leave in a blocked direction", () => {
    const view = scene(
      columns.replace(
        'id="left" data-snav="container"',
        'id="left" data-snav="container" data-snav-block="right"',
      ),
    );
    view.plugin.focus("#l2");

    view.move("right");

    expect(view.active()).toBe("l2");
  });

  it("refuses to leave a trap at all", () => {
    const view = scene(
      columns.replace(
        'id="left" data-snav="container"',
        'id="left" data-snav="container" data-snav-trap',
      ),
    );
    view.plugin.focus("#l2");

    view.move("right");
    expect(view.active()).toBe("l2");

    view.move("up");
    expect(view.active()).toBe("l1");
  });

  it("wraps round on the axis it was told to", () => {
    const view = scene(
      columns.replace(
        'id="left" data-snav="container"',
        'id="left" data-snav="container" data-snav-wrap="y"',
      ),
    );
    view.plugin.focus("#l3");

    view.move("down");

    expect(view.active()).toBe("l1");
  });
});

describe("spatialPlugin — imperative surface", () => {
  it("lets a machine veto a move before the focus goes anywhere", () => {
    const view = scene(grid());
    view.plugin.focus("#c00");
    cleanups.push(
      view.plugin.onWillMove((event) => {
        if (event.to.id === "c01") event.preventDefault();
      }),
    );

    view.move("right");

    expect(view.active()).toBe("c00");
  });

  it("focuses the first candidate of a container on demand", () => {
    const view = scene(columns);

    const found = view.plugin.focusFirst(document.querySelector("#right"));

    expect(found).toBe(true);
    expect(view.active()).toBe("r1");
  });

  it("reports a target it cannot find", () => {
    const view = scene(grid());

    expect(view.plugin.focus("#nothing")).toBe(false);
  });
});

/**
 * The right stick scrolls the page, and needs nothing focused to do it.
 *
 * input.md §3 says the stick's scroll is independent of the focus. Before
 * 2026-09-14 the engine read the scroller off the focused element's ancestors and
 * stopped at the root, which on a page is `body` — an element whose `scrollTop` is
 * 0 for ever in standards mode, because the document scrolls through `<html>`. So
 * the stick moved nothing on any page of the documentation site, and a page with
 * no focusable in it could not be read past the fold at all. The host here is
 * `position: fixed`, so it is the spacer that makes the document scroll.
 */
describe("spatialPlugin — the right stick", () => {
  function tallDocument(): void {
    const spacer = document.createElement("div");
    spacer.id = "spacer";
    spacer.style.cssText = "height:4000px";
    document.body.append(spacer);
    cleanups.push(() => {
      spacer.remove();
      document.scrollingElement?.scrollTo(0, 0);
    });
  }

  function pageTop(): number {
    return document.scrollingElement?.scrollTop ?? 0;
  }

  it("scrolls the document when nothing has the focus", () => {
    tallDocument();
    // The site's own configuration, and it is the whole case: with no `root` the
    // plugin roots itself at `body`, and a walk that starts from `body` — which
    // is what `activeElement` answers once nothing has the focus — stops there.
    // Rooted at the test host instead, the same walk climbed past `body` to
    // `<html>` and the old code passed on a page it never scrolled.
    const input = createInputSystem({ plugins: [spatialPlugin()] });
    cleanups.push(() => input.destroy());
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    input.emit({ intent: "scrollY", source: "gamepad", value: 1 });

    expect(pageTop()).toBeGreaterThan(0);
  });

  it("scrolls the document from a focused control whose ancestors do not scroll", () => {
    tallDocument();
    const view = scene(grid());
    view.plugin.focus("#c00");

    view.input.emit({ intent: "scrollY", source: "gamepad", value: 1 });

    expect(pageTop()).toBeGreaterThan(0);
  });

  it("prefers the focused control's own scroller to the page", () => {
    tallDocument();
    const view = scene(
      `<div id="list" style="position:absolute;left:0;top:0;width:200px;height:100px;overflow:auto">` +
        `<div style="height:800px">${box("inside", 0, 0)}</div></div>`,
    );
    view.plugin.focus("#inside");
    const list = document.querySelector<HTMLElement>("#list");
    if (list === null) throw new Error("no list");

    view.input.emit({ intent: "scrollY", source: "gamepad", value: 1 });

    expect(list.scrollTop).toBeGreaterThan(0);
    expect(pageTop()).toBe(0);
  });

  it("reports nothing to scroll when the page fits, rather than scrolling something else", () => {
    const view = scene(grid());
    (document.activeElement as HTMLElement | null)?.blur();

    view.input.emit({ intent: "scrollY", source: "gamepad", value: 1 });

    expect(pageTop()).toBe(0);
  });
});

/**
 * The trap that caught two components in one day (2026-09-05), pinned at the engine
 * because the rule is the engine's and not any component's.
 *
 * `collectNavNodes` filters on `[data-snav-ignore]` and a zero-size rect, and
 * `isFocusable` (`focus/tabbable.ts:52-59`) checks the selector, `disabled`,
 * visibility and `inert` — **never `aria-hidden`**. So a control taken out of the
 * tab order on purpose, because the keyboard already reaches what it does, is still
 * a d-pad target; and one that is *also* `aria-hidden` is a target a screen reader
 * has nothing at all to say about.
 *
 * Both readings are deliberate and neither is a bug in the engine: a roving
 * collection's items are `tabindex="-1"` precisely so that the container owns one
 * tab stop, and steering to them is the whole point of the d-pad. Which is why the
 * remedy is an opt-out and not a filter — `toast.connect.ts:85` was the first to
 * take it, `search-field:clear-trigger` and `date-field`'s two steppers the next.
 *
 * The three cases below have to be read together: the first says the trap exists,
 * the second says the opt-out closes it, and the third is what stops someone
 * "fixing" the first by dropping every `tabindex="-1"` and taking every collection
 * in the library out of the gamepad's reach.
 */
describe("what a d-pad will and will not steer to", () => {
  it("steers to a focusable the tab order skipped, aria-hidden included", () => {
    const view = scene(
      box("segment", 0, 0, 60, 40) +
        box("stepper", 80, 0, 24, 40, 'tabindex="-1" aria-hidden="true"'),
    );
    view.plugin.focus("#segment");

    view.move("right");

    expect(view.active()).toBe("stepper");
  });

  it("skips it once it says so, and lands on what is behind it", () => {
    const view = scene(
      box("segment", 0, 0, 60, 40) +
        box("stepper", 80, 0, 24, 40, 'tabindex="-1" aria-hidden="true" data-snav-ignore') +
        box("next", 160, 0, 60, 40),
    );
    view.plugin.focus("#segment");

    view.move("right");

    expect(view.active()).toBe("next");
  });

  it("still steers to a roving item, which is the d-pad's whole job", () => {
    const view = scene(box("first", 0, 0, 80, 40) + box("second", 100, 0, 80, 40, 'tabindex="-1"'));
    view.plugin.focus("#first");

    view.move("right");

    expect(view.active()).toBe("second");
  });
});

/**
 * A rail inside a row inside a page — the ordinary television layout, and the one
 * the inherited suite never built: its only two containers are siblings, so
 * `childContainerOf`, the container-scored-as-one-unit rule and the recursive
 * descent of `enterContainer` had never executed before these cases.
 */
function nested(): string {
  return (
    `<div id="page" data-snav="container" style="position:absolute;left:0;top:0;width:560px;height:340px">` +
    `<div id="row" data-snav="container" style="position:absolute;left:0;top:0;width:560px;height:100px">` +
    `<div id="rail" data-snav="container" style="position:absolute;left:0;top:0;width:260px;height:100px">` +
    box("rail-a", 0, 20, 100, 40) +
    box("rail-b", 120, 20, 100, 40) +
    `</div>` +
    box("row-far", 320, 20, 100, 40) +
    `</div>` +
    box("below", 0, 200, 100, 40) +
    `</div>`
  );
}

describe("spatialPlugin — nested containers", () => {
  it("enters a nested container rather than landing on it", () => {
    const view = scene(nested());
    view.plugin.focus("#below");

    view.move("up");

    // The rail is a candidate of #page scored as one unit; the move descends
    // through row and rail and lands on a real focusable.
    expect(view.active()).toBe("rail-a");
  });

  it("descends recursively, two containers deep", () => {
    const view = scene(nested());
    view.plugin.focus("#row-far");

    view.move("left");

    expect(view.active()).toBe("rail-b");
  });

  it("remembers where it left a nested container and returns there", () => {
    const view = scene(nested());
    view.plugin.focus("#rail-b");
    view.move("down");
    expect(view.active()).toBe("below");

    view.move("up");

    // `last` is the default entry strategy, and the memory is per container.
    expect(view.active()).toBe("rail-b");
  });

  it("marks every container on the active path, and only those", () => {
    const view = scene(nested());

    view.plugin.focus("#rail-a");

    const active = [...document.querySelectorAll("[data-snav-active]")].map((node) => node.id);
    expect(active.sort()).toEqual(["nav-root", "page", "rail", "row"]);

    view.plugin.focus("#below");
    const after = [...document.querySelectorAll("[data-snav-active]")].map((node) => node.id);
    expect(after.sort()).toEqual(["nav-root", "page"]);
  });
});

describe("spatialPlugin — pointerFollowsFocus", () => {
  it("is off in composite mode, so a hover changes nothing", () => {
    const view = scene(grid());
    view.plugin.focus("#c00");

    view.at("c22").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));

    expect(view.active()).toBe("c00");
  });

  it("is on in app mode, so a mouse and a pad do not fight over two cursors", () => {
    const view = scene(grid(), { mode: "app" });
    view.plugin.focus("#c00");

    view.at("c22").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));

    expect(view.active()).toBe("c22");
    expect(document.querySelector("[data-snav-focused]")?.id).toBe("c22");
  });

  it("bypasses the onWillMove veto, which a hover is not subject to", () => {
    const view = scene(grid(), { mode: "app" });
    const veto = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    view.plugin.focus("#c00");
    cleanups.push(view.plugin.onWillMove(veto));

    view.at("c22").dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));

    // Deliberate: the handler calls focusElement and remember directly rather than
    // commit, so a machine that vetoes d-pad moves does not also freeze the mouse.
    expect(view.active()).toBe("c22");
    expect(veto).not.toHaveBeenCalled();
  });
});

describe("spatialPlugin — scrolling the focus into view", () => {
  it("centres when the container asks for it", () => {
    const view = scene(
      `<div id="rail" data-snav="container" data-snav-scroll="center" style="position:absolute;left:0;top:0;width:300px;height:60px">` +
        box("a", 0, 0) +
        box("b", 140, 0) +
        `</div>`,
    );
    view.plugin.focus("#a");
    const spy = vi.spyOn(view.at("b"), "scrollIntoView");

    view.move("right");

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ block: "center", inline: "center" }),
    );
  });

  it("stays at nearest when it does not", () => {
    const view = scene(
      `<div id="rail" data-snav="container" style="position:absolute;left:0;top:0;width:300px;height:60px">` +
        box("a", 0, 0) +
        box("b", 140, 0) +
        `</div>`,
    );
    view.plugin.focus("#a");
    const spy = vi.spyOn(view.at("b"), "scrollIntoView");

    view.move("right");

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ block: "nearest", inline: "nearest" }),
    );
  });
});

describe("spatialPlugin — the candidate filter", () => {
  /**
   * A button cannot be collapsed by width and height alone: Chromium's UA sheet
   * gives it padding, a 2px border and a minimum, so `box(id, x, y, 0, 0)` measures
   * 16 x 6 and never reaches the size filter at all. Measured with Playwright on
   * 2026-09-20. Resetting all three is what makes these fixtures test the thing
   * they are named after.
   */
  function collapsible(id: string, x: number, width: number, height: number): string {
    return (
      `<button id="${id}" style="position:absolute;left:${x}px;top:0;` +
      `width:${width}px;height:${height}px;padding:0;border:0;min-width:0"></button>`
    );
  }

  it("drops an element with no size at all", () => {
    const view = scene(box("a", 0, 0) + collapsible("empty", 120, 0, 0) + box("b", 240, 0));
    view.plugin.focus("#a");

    view.move("right");

    expect(view.active()).toBe("b");
  });

  it("drops one that is flat on a single axis", () => {
    // ADR-0009 C1, accepted for v0: the filter is `width === 0 || height === 0`.
    // The source asked for both, which let a 0 x 40 element take the focus — it
    // paints nothing, so nothing can be seen to have been focused. This is the
    // fixture ADR-0009 required before the rule moved; it now pins the rule it
    // moved to, and putting the operator back fails here.
    const view = scene(box("a", 0, 0) + collapsible("thin", 120, 0, 40) + box("b", 240, 0));
    view.plugin.focus("#a");

    view.move("right");

    expect(view.active()).toBe("b");
  });

  it("keeps an element the width of a hairline", () => {
    // The rule is zero, not small. A 1px divider or a deliberately slim control is
    // a real target and C1 must not reach it.
    const view = scene(box("a", 0, 0) + collapsible("hair", 120, 1, 40) + box("b", 240, 0));
    view.plugin.focus("#a");

    view.move("right");

    expect(view.active()).toBe("hair");
  });
});

describe("spatialPlugin — teardown", () => {
  it("takes its attributes off the page with it", () => {
    const view = scene(grid());
    view.plugin.focus("#c11");
    expect(document.querySelectorAll("[data-snav-focused], [data-snav-active]").length).toBe(2);

    view.input.destroy();

    expect(document.querySelectorAll("[data-snav-focused], [data-snav-active]")).toHaveLength(0);
  });
});

describe("spatialPlugin — the right stick, horizontally and by the numbers", () => {
  function rail(): Scene {
    return scene(
      `<div id="rail" style="position:absolute;left:0;top:0;width:200px;height:60px;overflow:auto;white-space:nowrap">` +
        `<div style="width:2000px;height:20px"></div>` +
        box("a", 0, 20, 100, 40) +
        `</div>`,
    );
  }

  it("scrolls a horizontal container on scrollX", () => {
    const view = rail();
    view.plugin.focus("#a");

    view.input.emit({ intent: "scrollX", source: "gamepad", value: 1 });

    expect(view.at("rail").scrollLeft).toBeGreaterThan(0);
  });

  it("goes the other way on a negative value", () => {
    const view = rail();
    view.plugin.focus("#a");
    view.at("rail").scrollLeft = 400;

    view.input.emit({ intent: "scrollX", source: "gamepad", value: -1 });

    expect(view.at("rail").scrollLeft).toBeLessThan(400);
  });

  it("does nothing at all on a zero value", () => {
    const view = rail();
    view.plugin.focus("#a");

    view.input.emit({ intent: "scrollX", source: "gamepad", value: 0 });

    expect(view.at("rail").scrollLeft).toBe(0);
  });

  it("moves 24 pixels at full deflection, and half that at half", () => {
    // ANALOGUE_SCROLL_RATE, asserted rather than described: it is the difference
    // between a stick that feels like a scroll and one that feels like a jump.
    const view = rail();
    view.plugin.focus("#a");

    view.input.emit({ intent: "scrollX", source: "gamepad", value: 1 });
    expect(view.at("rail").scrollLeft).toBe(24);

    view.at("rail").scrollLeft = 0;
    view.input.emit({ intent: "scrollX", source: "gamepad", value: 0.5 });
    expect(view.at("rail").scrollLeft).toBe(12);
  });

  it("is silent when the plugin was told not to scroll", () => {
    const view = scene(
      `<div id="rail" style="position:absolute;left:0;top:0;width:200px;height:60px;overflow:auto">` +
        `<div style="width:2000px;height:20px"></div>` +
        box("a", 0, 20, 100, 40) +
        `</div>`,
      { analogueScroll: false },
    );
    view.plugin.focus("#a");

    view.input.emit({ intent: "scrollX", source: "gamepad", value: 1 });

    expect(view.at("rail").scrollLeft).toBe(0);
  });
});

describe("spatialPlugin — scroll and rescan", () => {
  /**
   * A real virtualised list, not merely a tall one: the later row does not exist
   * as a focusable until the container has scrolled. A list whose rows are all
   * mounted never reaches this path at all — every row is already a candidate,
   * `findBestCandidate` answers, and nothing scrolls.
   */
  function virtualised(): Scene {
    const view = scene(
      // A declared container, because the walk for a scroller starts at the
      // container the move is leaving, never at the focused element.
      `<div id="list" data-snav="container" style="position:absolute;left:0;top:0;width:200px;height:100px;overflow:auto">` +
        box("row0", 0, 0, 100, 40) +
        `<div id="spacer" style="position:absolute;top:0;left:0;width:1px;height:900px"></div>` +
        `<div id="late" style="display:none"></div>` +
        `</div>`,
    );
    const list = view.at("list");
    list.addEventListener("scroll", () => {
      if (list.scrollTop <= 0) return;
      const late = view.at("late");
      late.innerHTML = box("row1", 0, 0, 100, 40);
      late.style.cssText = `position:absolute;left:0;top:${list.scrollTop + 20}px;width:100px;height:40px`;
    });
    return view;
  }

  it("scrolls when nothing is reachable, then lands a frame later", async () => {
    const view = virtualised();
    view.plugin.focus("#row0");
    const list = view.at("list");
    expect(list.scrollTop).toBe(0);

    view.move("down");

    expect(list.scrollTop).toBeGreaterThan(0);
    // The rescan waits a frame, because an adapter mounts the new rows after the
    // scroll — and waits exactly one, or a list with an unreachable end would run
    // to the bottom on a single press.
    expect(view.active()).toBe("row0");

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    expect(view.active()).toBe("row1");
  });

  it("scrolls four fifths of the viewport, not a whole one", () => {
    // SCROLL_STEP_RATIO. A full page would step past whatever the user was
    // reading; a fifth kept is the overlap that leaves a list legible.
    const view = virtualised();
    view.plugin.focus("#row0");
    const list = view.at("list");

    view.move("down");

    expect(list.scrollTop).toBe(Math.round(0.8 * list.clientHeight));
  });
});

describe("spatialPlugin — the inherited hard limit", () => {
  it("terminates on a container nest deeper than MAX_CONTAINER_DEPTH", () => {
    // Seventeen nested containers, one more than the bound. The case is not that
    // the move succeeds — it is that the walk stops rather than looping.
    let html = "";
    for (let depth = 0; depth < 17; depth++) {
      html += `<div id="d${depth}" data-snav="container" style="position:absolute;left:0;top:0;width:${400 - depth}px;height:${300 - depth}px">`;
    }
    html += box("deep", 0, 0);
    html += "</div>".repeat(17);
    const view = scene(`${html}${box("outside", 300, 200)}`);
    view.plugin.focus("#deep");

    expect(() => {
      view.move("right");
      view.move("down");
    }).not.toThrow();
    expect(view.active()).not.toBe("");
  });
});

describe("spatialPlugin — the WeakRef fallback", () => {
  it("remembers, and forgets a removed child, with no WeakRef at all", () => {
    // ADR-0013's fallback path, and the only thing that ever executes it: WeakRef
    // is Chromium 84 / Safari 14.1 / Firefox 79, so every engine running this
    // suite has one. The constructor is read inside the handle rather than at
    // module scope precisely so this deletion works.
    const saved = Reflect.get(globalThis, "WeakRef");
    Reflect.deleteProperty(globalThis, "WeakRef");
    cleanups.push(() => {
      Reflect.set(globalThis, "WeakRef", saved);
    });
    expect(Reflect.get(globalThis, "WeakRef")).toBeUndefined();

    const view = scene(columns);
    view.plugin.focus("#l3");
    view.move("right");
    expect(view.active()).toBe("r3");
    view.move("up");
    expect(view.active()).toBe("r2");

    // The memory answers, exactly as it does with a real WeakRef.
    view.move("left");
    expect(view.active()).toBe("l3");

    // And a remembered child that leaves the document is not returned: the strong
    // reference drops itself on the first read that finds it detached.
    view.move("right");
    view.at("r2").remove();
    view.plugin.focus("#l1");
    view.move("right");
    expect(view.active()).toBe("r1");
  });
});

describe("spatialPlugin — base scope under a live trap", () => {
  it("keeps a modal navigable by d-pad while the page underneath stays silenced", () => {
    // The intent-bus unit tests pin this rule against fake handlers. This is the
    // only case that runs it against the real plugin, which is the only `base`
    // scope the library has: the engine is pushed at setup and therefore sits
    // below everything a component opens later.
    const view = scene(
      columns.replace(
        'id="right" data-snav="container"',
        'id="right" data-snav="container" data-snav-trap',
      ),
    );
    const pageComponent = vi.fn();
    view.plugin.focus("#r1");

    cleanups.push(view.input.pushScope(pageComponent));
    cleanups.push(view.input.pushScope(() => {}, { trapped: true }));

    view.move("down");

    // The engine moved inside the trapping surface…
    expect(view.active()).toBe("r2");
    // …and the component between the engine and the modal never heard the intent.
    expect(pageComponent).not.toHaveBeenCalled();
  });
});

describe("spatialPlugin — shadow DOM", () => {
  it.skip("steers into an open shadow root (ADR-0008: light DOM only in v0)", () => {
    // Ships skipped on purpose, as the acceptance test of any future attempt —
    // ADR-0008 asks for exactly this fixture so the feature cannot be declared
    // done by inspection. It fails today because getFocusables goes through a
    // plain querySelectorAll, which does not cross a shadow boundary, while
    // `contains` in the same dom module is shadow-aware. That inconsistency is
    // the ADR's own open item.
    const view = scene(`${box("outside", 0, 0)}<div id="host" data-snav="container"></div>`);
    const host = view.at("host");
    host.style.cssText = "position:absolute;left:200px;top:0;width:100px;height:40px";
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    inner.id = "inner";
    inner.style.cssText = "width:100px;height:40px";
    shadow.append(inner);

    view.plugin.focus("#outside");
    view.move("right");

    expect(shadow.activeElement?.id).toBe("inner");
  });
});

describe("spatialPlugin — what every engine refuses is no candidate (ADR-0030)", () => {
  it("steps over a second summary, which chromium, firefox and webkit all refuse", () => {
    const view = scene(
      `${box("a", 0, 0)}<details open>` +
        `<summary id="first" style="position:absolute;left:0;top:200px;width:100px;height:40px">one</summary>` +
        `<summary id="second" style="position:absolute;left:120px;top:0;width:100px;height:40px">two</summary>` +
        `</details>${box("c", 240, 0)}`,
    );
    view.plugin.focus("#a");

    expect(view.plugin.move("right")).toBe(true);

    expect(view.active()).toBe("c");
    expect(view.at("second").hasAttribute("data-snav-focused")).toBe(false);
  });

  it("steps over a link and a nested editable inside an editing host", () => {
    // The host sits below the row, and its two children are placed in it.
    const view = scene(
      box("a", 0, 0) +
        `<div id="editor" contenteditable style="position:absolute;left:0;top:200px;width:100px;height:40px">` +
        `<a id="link" href="#x" style="position:absolute;left:120px;top:-200px;width:100px;height:40px">link</a>` +
        `<span id="nested" contenteditable="true" style="position:absolute;left:240px;top:-200px;width:100px;height:40px">nested</span>` +
        `</div>${box("c", 360, 0)}`,
    );
    view.plugin.focus("#a");

    expect(view.plugin.move("right")).toBe(true);

    expect(view.active()).toBe("c");
    expect(document.querySelectorAll("[data-snav-focused]")).toHaveLength(1);
  });
});
