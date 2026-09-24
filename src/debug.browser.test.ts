import { afterEach, describe, expect, it } from "vitest";
import { explainMove, scanNativeSelects } from "./debug";
import { createInputSystem } from "./input-system";
import type { MoveDirection } from "./spatial/geometry";
import { spatialPlugin } from "./spatial/spatial";

const cleanups: VoidFunction[] = [];

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

interface Scene {
  readonly root: HTMLElement;
  at(id: string): HTMLElement;
  move(direction: MoveDirection): void;
}

/**
 * One container, no redirections, no wrap and nothing scrollable. Outside that
 * perimeter the engine and explainMove are not meant to agree: the engine answers
 * a redirection first, walks out to the parent, wraps, and scroll-and-rescans,
 * none of which explainMove models. Scoping the fixture is what makes the
 * assertion about ADR-0010 decision 4 rather than about those four differences.
 */
function scene(cells: readonly (readonly [string, number, number])[]): Scene {
  const root = document.createElement("div");
  root.id = "parity-root";
  root.style.cssText = "position:fixed;left:0;top:0;width:560px;height:340px";
  root.innerHTML = cells
    .map(
      ([id, x, y]) =>
        `<button id="${id}" style="position:absolute;left:${x}px;top:${y}px;width:100px;height:40px"></button>`,
    )
    .join("");
  document.body.append(root);

  const plugin = spatialPlugin({ root, mode: "app" });
  const input = createInputSystem({ plugins: [plugin] });
  cleanups.push(() => {
    input.destroy();
    root.remove();
  });

  return {
    root,
    at: (id) => root.querySelector(`#${id}`) as HTMLElement,
    move: (direction) => {
      plugin.move(direction);
    },
  };
}

const DIRECTIONS: readonly MoveDirection[] = ["up", "down", "left", "right"];

describe("explainMove", () => {
  it("names the element the engine actually lands on, in all four directions", () => {
    // A deliberately irregular lattice: rows of different pitch, so the winner is
    // not simply the nearest centre and the two passes have something to disagree
    // about if they ever stop sharing an implementation.
    const view = scene([
      ["a0", 0, 0],
      ["a1", 140, 0],
      ["a2", 300, 0],
      ["b0", 40, 90],
      ["b1", 200, 90],
      ["c0", 0, 190],
      ["c1", 160, 190],
      ["c2", 340, 190],
    ]);

    for (const origin of ["a1", "b0", "b1", "c1"]) {
      for (const direction of DIRECTIONS) {
        const from = view.at(origin);
        from.focus();

        const explained = explainMove(from, direction, { root: view.root });
        view.move(direction);

        const landed = document.activeElement === from ? null : (document.activeElement as Element);
        expect(explained.winner?.element ?? null, `${origin} ${direction}`).toBe(landed);
      }
    }
  });

  it("scores the same list the engine scores, origin excluded", () => {
    const view = scene([
      ["a", 0, 0],
      ["b", 140, 0],
      ["c", 300, 0],
    ]);
    const from = view.at("b");

    const explained = explainMove(from, "right", { root: view.root });

    expect(explained.candidates.map((entry) => entry.candidate.element.id)).toEqual(["a", "c"]);
    expect(explained.container).toBe(view.root);
    expect(explained.origin).toBe(from);
  });

  it("reports no winner when nothing lies that way", () => {
    const view = scene([
      ["a", 0, 0],
      ["b", 140, 0],
    ]);
    const from = view.at("b");
    from.focus();

    expect(explainMove(from, "right", { root: view.root }).winner).toBeNull();
  });
});

describe("explainMove — where it is meant to differ from the engine", () => {
  it("does not model a directional redirection, which the engine answers first", () => {
    const view = scene([
      ["a", 0, 0],
      ["near", 140, 0],
      ["far", 300, 0],
    ]);
    view.at("a").setAttribute("data-snav-right", "#far");
    const from = view.at("a");
    from.focus();

    expect(explainMove(from, "right", { root: view.root }).winner?.element.id).toBe("near");
    view.move("right");
    expect(document.activeElement?.id).toBe("far");
  });

  it("scores one container, while the engine walks out of it", () => {
    const root = document.createElement("div");
    root.id = "walk-root";
    root.style.cssText = "position:fixed;left:0;top:0;width:560px;height:340px";
    root.innerHTML =
      `<div id="left" data-snav="container" style="position:absolute;left:0;top:0;width:100px;height:100px">` +
      `<button id="l1" style="position:absolute;left:0;top:0;width:100px;height:40px"></button>` +
      `</div>` +
      `<button id="r1" style="position:absolute;left:200px;top:0;width:100px;height:40px"></button>`;
    document.body.append(root);
    const plugin = spatialPlugin({ root, mode: "app" });
    const input = createInputSystem({ plugins: [plugin] });
    cleanups.push(() => {
      input.destroy();
      root.remove();
    });

    const from = root.querySelector("#l1") as HTMLElement;
    from.focus();

    // Inside #left there is nothing to the right, so the explanation stops there.
    expect(explainMove(from, "right", { root }).winner).toBeNull();
    // The engine climbs to the root and finds #r1.
    plugin.move("right");
    expect(document.activeElement?.id).toBe("r1");
  });

  it("does not model wrapping, which the engine reaches only when nothing scores", () => {
    const root = document.createElement("div");
    root.id = "wrap-root";
    root.style.cssText = "position:fixed;left:0;top:0;width:560px;height:340px";
    root.innerHTML =
      `<div id="rail" data-snav="container" data-snav-wrap="x" style="position:absolute;left:0;top:0;width:400px;height:60px">` +
      `<button id="w1" style="position:absolute;left:0;top:0;width:100px;height:40px"></button>` +
      `<button id="w2" style="position:absolute;left:140px;top:0;width:100px;height:40px"></button>` +
      `</div>`;
    document.body.append(root);
    const plugin = spatialPlugin({ root, mode: "app" });
    const input = createInputSystem({ plugins: [plugin] });
    cleanups.push(() => {
      input.destroy();
      root.remove();
    });

    const from = root.querySelector("#w2") as HTMLElement;
    from.focus();

    expect(explainMove(from, "right", { root }).winner).toBeNull();
    plugin.move("right");
    expect(document.activeElement?.id).toBe("w1");
  });

  it("names a winner the browser refuses, where the engine goes on to the next", () => {
    const view = scene([
      ["a", 0, 0],
      ["b", 140, 0],
      ["c", 300, 0],
    ]);
    // A focus that never lands: explainMove cannot learn that without focusing.
    view.at("b").focus = (): void => {};
    const from = view.at("a");
    from.focus();

    expect(explainMove(from, "right", { root: view.root }).winner?.element.id).toBe("b");
    view.move("right");
    expect(document.activeElement?.id).toBe("c");
  });
});

describe("scanNativeSelects", () => {
  function mount(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    cleanups.push(() => host.remove());
    return host;
  }

  it("reports the closed select the engine will focus and cannot follow into", () => {
    // In FOCUSABLE_SELECTOR (`select:not([disabled])`), so the engine focuses it and
    // then `activateFocused` clicks it — which on a television opens a platform popup
    // outside the document. That is the whole defect ADR-0021 is about.
    const host = mount(`<select id="one"><option>a</option></select>`);

    expect(scanNativeSelects(host).map((element) => element.id)).toEqual(["one"]);
  });

  it("leaves the list-box forms alone, because those navigate", () => {
    const host = mount(
      `<select id="sized" size="4"><option>a</option></select>
       <select id="many" multiple><option>a</option></select>`,
    );

    // `size` above one and `multiple` render inside the document, so the engine moves
    // through their options like any other markup. Reporting them would be noise.
    expect(scanNativeSelects(host)).toEqual([]);
  });

  it("asks the engine about focusability rather than deciding for itself", () => {
    const host = mount(
      `<select id="off" disabled><option>a</option></select>
       <select id="gone" hidden><option>a</option></select>`,
    );

    // A disabled select is out of FOCUSABLE_SELECTOR and a hidden one fails isHidden,
    // so neither is ever a candidate and neither is a trap. The scan is only right
    // here because it calls the engine's own isFocusable (ADR-0010).
    expect(scanNativeSelects(host)).toEqual([]);
  });
});
