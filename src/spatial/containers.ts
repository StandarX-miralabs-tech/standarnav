/**
 * The declarative half. Everything a container can say about itself is a data
 * attribute, which is what lets third-party HTML become navigable without a line of
 * application JavaScript — the parsing is here and pure, the element lookups are one
 * line each at the call site.
 */

import type { MoveDirection } from "./geometry";

export const CONTAINER_SELECTOR = '[data-snav="container"]';
export const IGNORE_SELECTOR = "[data-snav-ignore]";
export const ENTER_ATTRIBUTE = "data-snav-enter";
export const BLOCK_ATTRIBUTE = "data-snav-block";
export const WRAP_ATTRIBUTE = "data-snav-wrap";
export const TRAP_ATTRIBUTE = "data-snav-trap";
export const SCROLL_ATTRIBUTE = "data-snav-scroll";
export const FOCUSED_ATTRIBUTE = "data-snav-focused";
export const ACTIVE_ATTRIBUTE = "data-snav-active";

export type EntryStrategy = "last" | "first" | "nearest";

/** `data-snav-block="left right"`, or bare to block every way out. */
export function blocksDirection(value: string | null, direction: MoveDirection): boolean {
  if (value === null) return false;
  if (value === "") return true;
  return value.split(/\s+/).includes(direction);
}

/** `data-snav-wrap="x | y | both"`, or bare for both. */
export function wrapsDirection(value: string | null, direction: MoveDirection): boolean {
  if (value === null) return false;
  if (value === "" || value === "both") return true;
  return value === (direction === "left" || direction === "right" ? "x" : "y");
}

/**
 * `last` for anything it does not recognise, absent included. The self-healing half
 * — falling back to `nearest` when the remembered element is gone — is the engine's,
 * not this parser's.
 */
export function entryStrategy(value: string | null): EntryStrategy {
  return value === "first" || value === "nearest" ? value : "last";
}

export function directionAttribute(direction: MoveDirection): string {
  return `data-snav-${direction}`;
}
