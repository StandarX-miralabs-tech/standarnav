/**
 * The contractual button grammar, plus the two escape hatches every real deployment
 * eventually needs: a remap for pads the browser could not normalise, and a pad type
 * so the UI can draw Ⓐ or ✕ instead of the word "A".
 */

import type { NavigationIntent } from "../types";

export type PadType = "xbox" | "dualsense" | "switch" | "generic";

export type ButtonOverrides = Readonly<Record<number, NavigationIntent | null>>;

/**
 * The `mapping: "standard"` layout. Also used as the fallback when a pad reports no
 * mapping at all: the first four buttons are the face cluster on essentially every
 * controller ever made, and `setMapping` is there for the ones where it is not.
 */
const STANDARD: readonly (NavigationIntent | null)[] = [
  "select", // 0  A / Cross
  "back", // 1  B / Circle
  "secondary", // 2  X / Square
  "contextMenu", // 3  Y / Triangle
  "tabPrev", // 4  LB
  "tabNext", // 5  RB
  "pageUp", // 6  LT
  "pageDown", // 7  RT
  null, // 8  Back / Select
  "contextMenu", // 9  Start
  null, // 10 L3
  null, // 11 R3
  "moveUp", // 12 d-pad
  "moveDown", // 13
  "moveLeft", // 14
  "moveRight", // 15
];

/**
 * Nintendo puts A where every other pad puts B. The browser's standard mapping
 * already normalises by *position*, so confirm stays under the thumb that every other
 * pad confirms with — swapping again would break that. Hence an explicit option,
 * default off, for apps that would rather match the printed glyph.
 */
export function resolveButtonIntent(
  index: number,
  overrides: ButtonOverrides | undefined,
  swapConfirm: boolean,
): NavigationIntent | null {
  const override = overrides?.[index];
  if (override !== undefined) return override;

  const effective = swapConfirm ? (index === 0 ? 1 : index === 1 ? 0 : index) : index;
  return STANDARD[effective] ?? null;
}

/** Held keys traverse a list; held activations do not fire a button ten times. */
const REPEATABLE: ReadonlySet<NavigationIntent> = new Set<NavigationIntent>([
  "moveUp",
  "moveDown",
  "moveLeft",
  "moveRight",
  "pageUp",
  "pageDown",
  "tabNext",
  "tabPrev",
]);

export function isRepeatableIntent(intent: NavigationIntent): boolean {
  return REPEATABLE.has(intent);
}

const PAD_PATTERNS: readonly (readonly [RegExp, PadType])[] = [
  [/xbox|xinput|045e/i, "xbox"],
  [/dualsense|dualshock|playstation|054c|0ce6|09cc/i, "dualsense"],
  [/switch|joy-?con|pro controller|057e/i, "switch"],
];

/** `Gamepad.id` is free-form vendor text; this is a heuristic, not a lookup. */
export function detectPadType(id: string): PadType {
  for (const [pattern, type] of PAD_PATTERNS) {
    if (pattern.test(id)) return type;
  }
  return "generic";
}

/**
 * A trigger is analogue, so "pressed" needs two thresholds or it chatters at rest on
 * a worn pad. Returns the new pressed state given the previous one.
 */
export function isTriggerPressed(value: number, wasPressed: boolean): boolean {
  return wasPressed ? value > 0.3 : value > 0.5;
}
