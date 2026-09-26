import { afterEach, describe, expect, it } from "vitest";
import { focusElement, getTabbableEdges, getTabbables, isFocusable, isTabbable } from "./tabbable";

const cleanups: VoidFunction[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  cleanups.push(() => host.remove());
  return host;
}

afterEach(() => {
  for (const dispose of cleanups.splice(0, cleanups.length)) dispose();
});

describe("tabbable", () => {
  it("lists the tabbables in document order and skips the rest", () => {
    const host = mount(`
      <button id="one"></button>
      <button id="disabled" disabled></button>
      <a id="link" href="#x"></a>
      <span id="span"></span>
      <div id="roved" tabindex="-1"></div>
      <input id="text" />
    `);

    expect(getTabbables(host).map((node) => node.id)).toEqual(["one", "link", "text"]);
    expect(isFocusable(host.querySelector("#roved"))).toBe(true);
    expect(isTabbable(host.querySelector("#roved"))).toBe(false);
    expect(isFocusable(host.querySelector("#span"))).toBe(false);
    expect(isFocusable(host.querySelector("#disabled"))).toBe(false);
  });

  it("ignores hidden and inert subtrees", () => {
    const host = mount(`
      <button id="visible"></button>
      <div hidden><button id="hidden"></button></div>
      <div style="display: none"><button id="none"></button></div>
      <div inert><button id="inert"></button></div>
    `);

    expect(getTabbables(host).map((node) => node.id)).toEqual(["visible"]);
  });

  it("keeps aria-disabled items reachable, as APG asks", () => {
    const host = mount(`<button id="a" aria-disabled="true"></button>`);

    expect(isTabbable(host.querySelector("#a"))).toBe(true);
  });

  it("reports the edges, and null on an empty container", () => {
    const host = mount(`<div id="empty"></div><button id="a"></button><button id="b"></button>`);

    const [first, last] = getTabbableEdges(host);
    expect(first?.id).toBe("a");
    expect(last?.id).toBe("b");
    expect(getTabbableEdges(host.querySelector("#empty"))).toEqual([null, null]);
  });

  it("drops what a disabled fieldset disables, and keeps its first legend and its links", () => {
    const host = mount(`
      <button id="before"></button>
      <fieldset disabled>
        <legend><button id="legend"></button></legend>
        <button id="button"></button>
        <input id="input" />
        <a id="link" href="#x">link</a>
      </fieldset>
    `);
    const at = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;

    at("button").focus();
    expect(document.activeElement).not.toBe(at("button"));

    expect(isFocusable(at("button"))).toBe(false);
    expect(isFocusable(at("input"))).toBe(false);
    expect(isFocusable(at("legend"))).toBe(true);
    expect(isFocusable(at("link"))).toBe(true);
    expect(getTabbables(host).map((node) => node.id)).toEqual(["before", "legend", "link"]);
  });

  it("reports the edges of a surface that ends in a disabled fieldset", () => {
    const host = mount(`
      <button id="first"></button>
      <fieldset disabled>
        <legend><button id="legend"></button></legend>
        <button id="dead"></button>
        <input id="dead-too" />
      </fieldset>
    `);

    const [first, last] = getTabbableEdges(host);
    expect(first?.id).toBe("first");
    expect(last?.id).toBe("legend");
  });

  it("still rejects disabled on an element the browser would focus, ADR-0009 rule 6", () => {
    const host = mount(`
      <div id="div" tabindex="0" disabled>div</div>
      <a id="link" href="#x" disabled>link</a>
    `);
    const div = host.querySelector("#div") as HTMLElement;

    div.focus();
    expect(document.activeElement).toBe(div);

    expect(isFocusable(div)).toBe(false);
    expect(isFocusable(host.querySelector("#link"))).toBe(false);
  });

  it("counts an editing host as a Tab stop, and not what is editable inside it", () => {
    const host = mount(`
      <button id="before"></button>
      <div id="editor" contenteditable>text <span id="nested" contenteditable="true">nested</span></div>
      <div id="pinned" contenteditable tabindex="-1">pinned</div>
      <div id="outer" contenteditable><span contenteditable="false">fixed <span id="island" contenteditable>island</span></span></div>
      <button id="after"></button>
    `);
    const at = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;

    expect(at("editor").tabIndex).toBe(-1);
    expect(isTabbable(at("editor"))).toBe(true);
    expect(isTabbable(at("nested"))).toBe(false);
    expect(isFocusable(at("pinned"))).toBe(true);
    expect(isTabbable(at("pinned"))).toBe(false);
    expect(isTabbable(at("island"))).toBe(true);
    expect(getTabbables(host).map((node) => node.id)).toEqual([
      "before",
      "editor",
      "outer",
      "island",
      "after",
    ]);
  });

  /**
   * Measured on chromium, firefox and webkit on 2026-09-24 (ADR-0030): inside an editing
   * host, a link and an element editable for no other reason refuse `focus()` on all
   * three when they carry no tabindex. A control, a frame, an embedded object, a media
   * element with controls and a details summary take it anyway, `contenteditable` or not.
   */
  it("drops a link and a nested editable of an editing host, unless they carry a tabindex", () => {
    const host = mount(`
      <button id="before"></button>
      <div id="editor" contenteditable>
        <a id="link" href="#x">link</a>
        <p>text <a id="deep" href="#x">deep</a></p>
        <span id="nested" contenteditable="true">nested</span>
        <span id="plain" contenteditable="plaintext-only">plain</span>
        <span id="pinned" contenteditable="true" tabindex="-1">pinned</span>
        <span id="stop" contenteditable="true" tabindex="0">stop</span>
        <button id="button">button</button>
        <button id="editable-button" contenteditable="true">editable button</button>
        <input id="input" />
        <details open><summary id="summary">summary</summary>body</details>
        <span contenteditable="false">fixed <span id="island" contenteditable>island</span></span>
      </div>
    `);
    const at = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;
    const lands = (id: string): boolean => {
      at("before").focus();
      at(id).focus();
      return document.activeElement === at(id);
    };

    for (const id of ["link", "deep", "nested", "plain"]) {
      expect(lands(id), id).toBe(false);
      expect(isFocusable(at(id)), id).toBe(false);
      expect(isTabbable(at(id)), id).toBe(false);
    }
    const kept = ["pinned", "stop", "button", "editable-button", "input", "summary", "island"];
    for (const id of kept) {
      expect(lands(id), id).toBe(true);
      expect(isFocusable(at(id)), id).toBe(true);
    }
    expect(isTabbable(at("stop"))).toBe(true);
    expect(isTabbable(at("island"))).toBe(true);
  });

  it("keeps a link with a tabindex in an editing host, which the engines split on", () => {
    // Chromium and webkit focus it, firefox does not (2026-09-24): not every engine
    // refuses it, so it stays a candidate and the spatial engine's retry covers firefox.
    const host = mount(`<div contenteditable><a id="link" href="#x" tabindex="0">link</a></div>`);

    expect(isFocusable(host.querySelector("#link"))).toBe(true);
  });

  it("takes only the first summary child of a details as focusable", () => {
    const host = mount(`
      <button id="before"></button>
      <details open>
        <summary id="first">first</summary>
        <summary id="second">second</summary>
        <div><summary id="grandchild">grandchild</summary></div>
      </details>
      <summary id="orphan">orphan</summary>
    `);
    const at = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;

    for (const id of ["first", "second", "grandchild", "orphan"]) {
      at("before").focus();
      at(id).focus();
      const lands = document.activeElement === at(id);
      expect(lands, id).toBe(id === "first");
      expect(isFocusable(at(id)), id).toBe(lands);
    }
    expect(getTabbables(host).map((node) => node.id)).toEqual(["before", "first"]);
  });

  it("drops a contenteditable attribute that does not make its element editable", () => {
    const host = mount(`
      <div id="inherit" contenteditable="inherit">inherit</div>
      <div id="upper" contenteditable="FALSE">upper</div>
      <div id="bogus" contenteditable="bogus">bogus</div>
      <div id="stop" contenteditable="inherit" tabindex="0">stop</div>
    `);
    const inherit = host.querySelector("#inherit") as HTMLElement;

    inherit.focus();
    expect(document.activeElement).not.toBe(inherit);

    expect(isFocusable(inherit)).toBe(false);
    expect(isFocusable(host.querySelector("#upper"))).toBe(false);
    expect(isFocusable(host.querySelector("#bogus"))).toBe(false);
    expect(isTabbable(host.querySelector("#stop"))).toBe(true);
  });

  it("reports an editing host as the last edge", () => {
    const host = mount(`<button id="a"></button><div id="editor" contenteditable>text</div>`);

    const [first, last] = getTabbableEdges(host);
    expect(first?.id).toBe("a");
    expect(last?.id).toBe("editor");
  });

  it("focuses without scrolling the page", () => {
    const host = mount(`<div style="height: 200vh"></div><button id="low"></button>`);
    const button = host.querySelector("#low") as HTMLElement;

    focusElement(button);

    expect(document.activeElement).toBe(button);
    expect(window.scrollY).toBe(0);
  });

  /**
   * Measured on chromium, firefox and webkit on 2026-09-26: an `<area href>` of a map an
   * `<img usemap>` uses takes `focus()` and a Tab stop on all three, though chromium and webkit
   * report it with no box and `checkVisibility()` false. An area of a map no image uses, one
   * outside any map, and one whose images are all hidden are refused on all three. A map
   * named by its id alone is focused by chromium and firefox and refused by webkit, and a map
   * whose first image is hidden and second shown is focused by firefox and refused by chromium
   * and webkit: the spatial engine's retry covers both.
   */
  it("keeps an area of an image map in use, and drops one no image uses", () => {
    const image = `width="200" height="100" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"`;
    const host = mount(`
      <button id="before"></button>
      <img usemap="#tab-used" ${image}>
      <map name="tab-used">
        <area id="rect" shape="rect" coords="0,0,100,100" href="#" alt="rect">
        <area id="circle" shape="circle" coords="150,50,40" href="#" alt="circle">
      </map>
      <map name="tab-unused"><area id="unused" coords="0,0,10,10" href="#" alt="unused"></map>
      <area id="stray" coords="0,0,10,10" href="#" alt="stray">
      <img usemap="#tab-gone" style="display:none" ${image}>
      <img usemap="#tab-gone" style="visibility:hidden" ${image}>
      <map name="tab-gone"><area id="gone" coords="0,0,10,10" href="#" alt="gone"></map>
      <button id="after"></button>
    `);
    const elsewhere = mount(`
      <img usemap="#tab-by-id" ${image}>
      <map id="tab-by-id"><area id="by-id" coords="0,0,10,10" href="#" alt="by id"></map>
      <img usemap="#tab-twin" style="display:none" ${image}>
      <img usemap="#tab-twin" ${image}>
      <map name="tab-twin"><area id="twin" coords="0,0,10,10" href="#" alt="twin"></map>
    `);
    const at = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
    const lands = (id: string): boolean => {
      at("before").focus();
      at(id).focus();
      return document.activeElement === at(id);
    };

    expect(lands("rect")).toBe(true);
    expect(lands("circle")).toBe(true);
    for (const id of ["rect", "circle", "by-id", "twin"]) {
      expect(isFocusable(at(id)), id).toBe(true);
      expect(isTabbable(at(id)), id).toBe(true);
    }
    for (const id of ["unused", "stray", "gone"]) {
      expect(lands(id), id).toBe(false);
      expect(isFocusable(at(id)), id).toBe(false);
      expect(isTabbable(at(id)), id).toBe(false);
    }
    expect(getTabbables(host).map((node) => node.id)).toEqual([
      "before",
      "rect",
      "circle",
      "after",
    ]);
    expect(getTabbables(elsewhere).map((node) => node.id)).toEqual(["by-id", "twin"]);
  });
});
