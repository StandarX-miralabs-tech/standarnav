/**
 * Reads of the platform, each taking the window or the element it reads, which is the
 * point: it can only be called from an effect, never during render. A media query answered
 * at render time is how a hydration mismatch is born.
 */

import { imageOf } from "../tabbable";
import type { Rect } from "../types";

export function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * An `<area>` has no box of its own on chromium and webkit, and the whole image's on firefox,
 * so its shape is laid over its image's border box; webkit alone hit-tests the content box.
 */
export function rectOf(element: Element): Rect {
  const image = element.localName === "area" ? imageOf(element) : null;
  if (image === null) return element.getBoundingClientRect();
  const box = image.getBoundingClientRect();
  const shape = element.getAttribute("shape")?.toLowerCase();
  if (shape === "default") return box;
  const circle = shape === "circle" || shape === "circ";
  const poly = shape === "poly" || shape === "polygon";
  const numbers =
    element
      .getAttribute("coords")
      ?.match(/-?\d*\.?\d+/g)
      ?.map(Number) ?? [];
  const [a = 0, b = 0, r = 0] = numbers;
  if (numbers.length < (circle ? 3 : poly ? 6 : 4) || (circle && r < 0)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const points = circle
    ? [a - r, b - r, a + r, b + r]
    : numbers.slice(0, poly ? numbers.length & -2 : 4);
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: box.x + left,
    y: box.y + top,
    width: Math.max(...xs) - left,
    height: Math.max(...ys) - top,
  };
}
