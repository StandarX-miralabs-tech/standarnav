/**
 * Who can take focus, and who is in the tab order. Everything that traps, restores
 * or rings focus asks this module first.
 *
 * Visibility goes through `checkVisibility()` where the browser offers it: it is
 * the engine's own answer, which beats re-deriving `display: none` from computed
 * styles and gets `content-visibility` and closed `<details>` right for free.
 * `inert` is checked separately — an inert subtree is still visible.
 *
 * Light DOM only, deliberately: piercing shadow roots would mean walking every
 * open root on every move, and the callers that need it can pass their own root.
 * See ADR-0008.
 */

import { isHTMLElement, queryAll } from "./dom/query";

export const FOCUSABLE_SELECTOR: string = [
  "input:not([type='hidden']):not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "button:not([disabled])",
  "a[href]",
  "area[href]",
  "iframe",
  "object",
  "embed",
  "audio[controls]",
  "video[controls]",
  "summary",
  // `:read-write`, not a list of values: `false`, `inherit` under a plain parent and an
  // invalid value all leave the element uneditable and unfocusable, in any letter case.
  "[contenteditable]:read-write",
  "[tabindex]",
].join(",");

interface VisibilityCheck {
  checkVisibility?: (options?: {
    contentVisibilityAuto?: boolean;
    visibilityProperty?: boolean;
  }) => boolean;
}

export function isHidden(node: HTMLElement): boolean {
  // Through `unknown`, not an intersection: the method is absent below the
  // baseline of ADR-0013, and typing it as present makes the fallback read as
  // dead code that someone eventually deletes.
  const check = (node as unknown as VisibilityCheck).checkVisibility;
  if (typeof check === "function") {
    return !check.call(node, { contentVisibilityAuto: true, visibilityProperty: true });
  }
  return node.offsetParent === null && node.getClientRects().length === 0;
}

export function isInert(node: HTMLElement): boolean {
  return node.closest("[inert]") !== null;
}

export function isFocusable(node: HTMLElement | null | undefined): boolean {
  if (node === null || node === undefined) return false;
  if (!node.matches(FOCUSABLE_SELECTOR)) return false;
  // `:disabled` reaches a control through a disabled `<fieldset>`; `[disabled]` keeps
  // the attribute an opt-out on elements the browser would still focus (ADR-0009, rule 6).
  if (node.matches(":disabled,[disabled]")) return false;
  // `aria-disabled` stays focusable on purpose: APG wants disabled menu items and
  // toolbar buttons reachable, unlike natively disabled form controls.
  return !isHidden(node) && !isInert(node);
}

// An editing host reports `tabIndex` -1 and is a Tab stop anyway; what is editable
// inside it is not.
function inTabOrder(node: HTMLElement): boolean {
  return (
    node.tabIndex >= 0 ||
    (node.isContentEditable &&
      !node.hasAttribute("tabindex") &&
      !node.parentElement?.isContentEditable)
  );
}

export function isTabbable(node: HTMLElement | null | undefined): boolean {
  return isFocusable(node) && inTabOrder(node as HTMLElement);
}

export function getFocusables(
  root: HTMLElement | Document | null | undefined,
  includeRoot = false,
): HTMLElement[] {
  const found = queryAll<HTMLElement>(root, FOCUSABLE_SELECTOR).filter((node) => isFocusable(node));
  if (includeRoot && isHTMLElement(root) && isFocusable(root)) found.unshift(root);
  return found;
}

export function getTabbables(
  root: HTMLElement | Document | null | undefined,
  includeRoot = false,
): HTMLElement[] {
  return getFocusables(root, includeRoot).filter(inTabOrder);
}

export function getTabbableEdges(
  root: HTMLElement | Document | null | undefined,
): [first: HTMLElement | null, last: HTMLElement | null] {
  const tabbables = getTabbables(root);
  // Index arithmetic, not `.at(-1)`: `Array.prototype.at` is Chromium 92 /
  // Safari 15.4 / Firefox 90, above the tier ADR-0013 supports, so `.at` throws
  // on the very televisions this package exists for.
  return [tabbables[0] ?? null, tabbables[tabbables.length - 1] ?? null];
}

export function getFirstTabbable(
  root: HTMLElement | Document | null | undefined,
): HTMLElement | null {
  return getTabbableEdges(root)[0];
}

export function getLastTabbable(
  root: HTMLElement | Document | null | undefined,
): HTMLElement | null {
  return getTabbableEdges(root)[1];
}

export interface FocusOptions {
  readonly select?: boolean | undefined;
  readonly preventScroll?: boolean | undefined;
}

/** Focus without scrolling by default: an overlay that jumps the page on open is a bug. */
export function focusElement(
  node: HTMLElement | null | undefined,
  options: FocusOptions = {},
): void {
  if (node === null || node === undefined) return;
  node.focus({ preventScroll: options.preventScroll ?? true });
  if (options.select === true && node instanceof HTMLInputElement) node.select();
}
