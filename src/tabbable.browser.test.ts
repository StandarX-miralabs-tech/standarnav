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

  it("focuses without scrolling the page", () => {
    const host = mount(`<div style="height: 200vh"></div><button id="low"></button>`);
    const button = host.querySelector("#low") as HTMLElement;

    focusElement(button);

    expect(document.activeElement).toBe(button);
    expect(window.scrollY).toBe(0);
  });
});
