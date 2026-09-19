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
