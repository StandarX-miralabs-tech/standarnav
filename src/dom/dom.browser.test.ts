import { afterEach, describe, expect, it, vi } from "vitest";
import { addDomEvent } from "./event";
import { prefersReducedMotion, rectOf } from "./platform";
import { contains, getEventTarget, isHTMLElement, queryAll } from "./query";
import { raf } from "./raf";

const mounted: Element[] = [];

function mount(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  mounted.push(host);
  return host;
}

function frame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

afterEach(() => {
  for (const node of mounted.splice(0, mounted.length)) node.remove();
});

describe("query", () => {
  it("lists elements, tolerating a null root", () => {
    const host = mount(`<button data-part="trigger"></button><button data-part="item"></button>`);

    expect(queryAll(host, "button")).toHaveLength(2);
    expect(queryAll(null, "button")).toEqual([]);
    expect(queryAll(undefined, "button")).toEqual([]);
  });

  it("recognises elements without instanceof, so cross-realm nodes work", () => {
    const host = mount(`<div></div>`);

    expect(isHTMLElement(host.firstElementChild)).toBe(true);
    expect(isHTMLElement(document)).toBe(false);
    expect(isHTMLElement(null)).toBe(false);
  });

  it("sees through a shadow boundary, which Node.contains does not", () => {
    const host = mount(`<div id="outer"><div id="host"></div></div>`);
    const outer = host.querySelector("#outer") as HTMLElement;
    const shadowHost = host.querySelector("#host") as HTMLElement;
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.append(inner);

    expect(outer.contains(inner)).toBe(false);
    expect(contains(outer, inner)).toBe(true);
    expect(contains(outer, outer)).toBe(true);
    expect(contains(inner, outer)).toBe(false);
    expect(contains(null, inner)).toBe(false);
  });

  it("retargets an event to the element actually clicked", async () => {
    const host = mount(`<div id="host"></div>`);
    const shadowHost = host.querySelector("#host") as HTMLElement;
    const shadow = shadowHost.attachShadow({ mode: "open" });
    const inner = document.createElement("button");
    shadow.append(inner);

    const seen = await new Promise<{ target: EventTarget | null; composed: EventTarget | null }>(
      (resolve) => {
        document.addEventListener(
          "click",
          (event) => resolve({ target: event.target, composed: getEventTarget(event) }),
          { once: true },
        );
        inner.click();
      },
    );

    expect(seen.target).toBe(shadowHost);
    expect(seen.composed).toBe(inner);
  });
});

describe("event", () => {
  it("returns a teardown that actually removes the listener", () => {
    const host = mount(`<button></button>`);
    const node = host.firstElementChild as HTMLButtonElement;
    const listener = vi.fn();

    const remove = addDomEvent(node, "click", listener);
    node.click();
    remove();
    node.click();

    expect(listener).toHaveBeenCalledOnce();
  });

  it("is a no-op on a missing target", () => {
    expect(() => addDomEvent(null, "click", vi.fn())()).not.toThrow();
  });
});

describe("raf", () => {
  it("cancels a scheduled frame", async () => {
    const fn = vi.fn();
    raf(window, fn)();
    await frame();

    expect(fn).not.toHaveBeenCalled();
  });
});

describe("platform", () => {
  it("reads the media feature from the window it was given", () => {
    expect(typeof prefersReducedMotion(window)).toBe("boolean");
  });

  it("lays an area's coords over its image as written, whatever size CSS gives the image", () => {
    // Chromium, firefox and webkit hit-test the coords in CSS pixels from the image's corner and
    // scale nothing when CSS resizes the image (2026-09-26, ADR-0031).
    const host = mount(
      `<img usemap="#scaled" alt="" width="200" height="100" style="position:fixed;left:100px;top:50px;width:400px;height:200px"` +
        ` src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E">` +
        `<map name="scaled"><area id="corner" shape="rect" coords="20,40,60,80" href="#" alt="corner"></map>`,
    );

    expect(rectOf(host.querySelector("#corner") as Element)).toEqual({
      x: 120,
      y: 90,
      width: 40,
      height: 40,
    });
  });
});
