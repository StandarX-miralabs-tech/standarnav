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

  it("focuses without scrolling the page", () => {
    const host = mount(`<div style="height: 200vh"></div><button id="low"></button>`);
    const button = host.querySelector("#low") as HTMLElement;

    focusElement(button);

    expect(document.activeElement).toBe(button);
    expect(window.scrollY).toBe(0);
  });
});
