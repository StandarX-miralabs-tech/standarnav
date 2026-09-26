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

  /**
   * Measured on chromium, firefox and webkit on 2026-09-26 (ADR-0031, amendment of that date).
   * Every engine wires an image to the first `<map>` of its tree whose `name` or `id` the
   * `usemap` names, and chromium and webkit focus the areas of a later map of the same name all
   * the same, where firefox refuses them; a `usemap` with no leading `#` wires nothing, and its
   * area is refused on all three. Across a shadow boundary: a map and its image in one shadow
   * root pair up on firefox and webkit, where chromium refuses the area; an image inside a shadow
   * root with its map outside is refused on all three; a map inside a shadow root with its image
   * outside is focused by chromium alone. The engine pairs an area with an image of its own tree,
   * by the map's name or id, and leaves what the engines split on to the spatial engine's retry.
   */
  it("pairs an area with an image of its own tree, by the map's name or id", () => {
    const image = `width="200" height="100" alt="" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"`;
    const host = mount(`
      <button id="before"></button>
      <img usemap="#twice" ${image}>
      <map name="twice"><area id="first-map" coords="0,0,100,100" href="#" alt="first"></map>
      <map name="twice"><area id="second-map" coords="100,0,200,100" href="#" alt="second"></map>
      <img usemap="#either" ${image}>
      <map id="either"><area id="by-id-first" coords="0,0,100,100" href="#" alt="by id"></map>
      <map name="either"><area id="by-name-second" coords="100,0,200,100" href="#" alt="by name"></map>
      <img usemap="unhashed" ${image}>
      <map name="unhashed"><area id="unhashed" coords="0,0,200,100" href="#" alt="unhashed"></map>
      <div id="both-inside"></div>
      <div id="image-inside"></div>
      <map name="map-outside"><area id="map-outside" coords="0,0,100,100" href="#" alt="map outside"></map>
      <img usemap="#image-outside" ${image}>
      <div id="map-inside"></div>
    `);
    const shadow = (id: string, html: string): ShadowRoot => {
      const root = (host.querySelector(`#${id}`) as HTMLElement).attachShadow({ mode: "open" });
      root.innerHTML = html;
      return root;
    };
    const bothInside = shadow(
      "both-inside",
      `<img usemap="#both" ${image}>` +
        `<map name="both"><area id="both" coords="0,0,100,100" href="#" alt="both"></map>`,
    );
    shadow("image-inside", `<img usemap="#map-outside" ${image}>`);
    const mapInside = shadow(
      "map-inside",
      `<map name="image-outside"><area id="image-outside" coords="0,0,100,100" href="#" alt="image outside"></map>`,
    );
    const at = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
    const lands = (node: HTMLElement): boolean => {
      at("before").focus();
      node.focus();
      return (node.getRootNode() as Document | ShadowRoot).activeElement === node;
    };

    expect(lands(at("first-map"))).toBe(true);
    for (const id of ["first-map", "second-map", "by-id-first", "by-name-second"]) {
      expect(isFocusable(at(id)), id).toBe(true);
      expect(isTabbable(at(id)), id).toBe(true);
    }
    expect(getTabbables(host).map((node) => node.id)).toEqual([
      "before",
      "first-map",
      "second-map",
      "by-id-first",
      "by-name-second",
    ]);
    expect(lands(at("unhashed"))).toBe(false);
    expect(isFocusable(at("unhashed"))).toBe(false);
    expect(isFocusable(bothInside.getElementById("both"))).toBe(true);
    expect(lands(at("map-outside"))).toBe(false);
    expect(isFocusable(at("map-outside"))).toBe(false);
    expect(isFocusable(mapInside.getElementById("image-outside"))).toBe(false);
  });

  it("never counts a clickable div without a tabindex, until it is given one", () => {
    // ADR-0005 and ADR-0009: a `div` is not in `FOCUSABLE_SELECTOR`, whatever it listens to,
    // and no engine focuses it either. `tabindex="0"` is the documented fix, and the whole of it.
    const host = mount(`
      <button id="before"></button>
      <div id="clickable" role="button" style="cursor:pointer">clickable</div>
      <button id="after"></button>
    `);
    const clickable = host.querySelector("#clickable") as HTMLElement;
    let clicks = 0;
    clickable.addEventListener("click", () => {
      clicks += 1;
    });

    clickable.click();
    expect(clicks).toBe(1);
    clickable.focus();
    expect(document.activeElement).not.toBe(clickable);

    expect(isFocusable(clickable)).toBe(false);
    expect(isTabbable(clickable)).toBe(false);
    expect(getTabbables(host).map((node) => node.id)).toEqual(["before", "after"]);

    clickable.tabIndex = 0;
    expect(isTabbable(clickable)).toBe(true);
    expect(getTabbables(host).map((node) => node.id)).toEqual(["before", "clickable", "after"]);
  });

  /**
   * Measured on chromium, firefox and webkit on 2026-09-26: `checkVisibility({ visibilityProperty:
   * true })` is `false` for `visibility: hidden` and for `visibility: collapse` alike, inherited
   * or not, and no engine focuses either; a child set back to `visible` is focused on all three.
   * The fallback of ADR-0013's tier reads layout boxes, which `visibility` keeps, so rule 5 of
   * ADR-0009 has it read the computed property too: the two paths answer the same thing. That
   * includes an SVG element, which has no `offsetParent` at all rather than a null one, and a
   * `position: fixed` element, whose `offsetParent` is null while its boxes are there.
   */
  it("drops visibility: hidden on the fallback path, as checkVisibility does", () => {
    const host = mount(`
      <button id="visible"></button>
      <button id="hidden" style="visibility:hidden"></button>
      <button id="collapsed" style="visibility:collapse"></button>
      <div style="visibility:hidden"><button id="inherited"></button></div>
      <div style="visibility:hidden"><button id="shown" style="visibility:visible"></button></div>
      <div style="display:none"><button id="none"></button></div>
      <button id="fixed-hidden" style="position:fixed;top:0;left:0;visibility:hidden"></button>
      <button id="fixed-shown" style="position:fixed;top:0;left:0"></button>
      <div style="display:none"><svg><g id="svg-none" tabindex="0"><rect width="10" height="10"/></g></svg></div>
      <svg width="20" height="20"><g id="svg-shown" tabindex="0"><rect width="10" height="10"/></g></svg>
    `);
    const at = (id: string): HTMLElement => host.querySelector(`#${id}`) as HTMLElement;
    const lands = (id: string): boolean => {
      at("visible").focus();
      at(id).focus();
      return document.activeElement === at(id);
    };
    const tabbables = (): string[] => getTabbables(host).map((node) => node.id);
    const proto = Element.prototype as { checkVisibility?: unknown };
    const descriptor = Object.getOwnPropertyDescriptor(proto, "checkVisibility");
    if (descriptor === undefined) throw new Error("no checkVisibility to hide");
    const dropped = ["hidden", "collapsed", "inherited", "none", "fixed-hidden", "svg-none"];
    const kept = ["visible", "shown", "fixed-shown", "svg-shown"];

    for (const id of dropped) {
      expect(lands(id), id).toBe(false);
      expect(at(id).checkVisibility({ visibilityProperty: true }), id).toBe(false);
      expect(isFocusable(at(id)), id).toBe(false);
    }
    for (const id of kept) {
      expect(lands(id), id).toBe(true);
      expect(at(id).checkVisibility({ visibilityProperty: true }), id).toBe(true);
      expect(isFocusable(at(id)), id).toBe(true);
    }
    expect(tabbables()).toEqual(kept);

    // The fallback is the live path on the tier ADR-0013 supports, and no CI engine runs it
    // unless the method is taken away, as the WeakRef case of spatial.browser.test.ts does.
    delete proto.checkVisibility;
    try {
      expect(typeof at("hidden").checkVisibility).toBe("undefined");
      expect(tabbables()).toEqual(kept);
      for (const id of dropped) expect(isFocusable(at(id)), id).toBe(false);
      for (const id of kept) expect(isFocusable(at(id)), id).toBe(true);
    } finally {
      Object.defineProperty(proto, "checkVisibility", descriptor);
    }
  });
});
