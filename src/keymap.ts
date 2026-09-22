/**
 * Keyboard and TV remote → intent. Pure: it takes a description of a key, not an
 * event, so the whole table is tested without a DOM and the TV rows are reachable
 * on a laptop.
 *
 * Two deliberate omissions, both traps:
 *
 * `moveLeft`/`moveRight` are **physical** and never mirrored for RTL. A d-pad has
 * no notion of writing direction, and the spatial engine scores real geometry, so
 * inverting here would send the focus the wrong way across the screen. Writing
 * direction belongs where "next/prev" is derived — a composite widget's own key
 * handling — which is outside this package entirely.
 *
 * `Shift`+arrow produces nothing. It is the range-extend gesture of listboxes and
 * grids, owned by the component's own keydown; emitting a directional intent for it
 * would have the selection extend and the focus move somewhere else at once.
 */

import { isHTMLElement } from "./dom/query";
import type { IntentSource, NavigationIntent } from "./types";

export interface KeyDescriptor {
  readonly key: string;
  /**
   * Deprecated on the web and indispensable on television: webOS and Tizen send
   * their Back and Channel keys as numeric codes with no standard `key` name.
   */
  readonly keyCode?: number | undefined;
  readonly shiftKey?: boolean | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
  readonly metaKey?: boolean | undefined;
}

export interface ResolvedKey {
  readonly intent: NavigationIntent;
  readonly source: IntentSource;
}

export interface KeymapOverrides {
  /** By `event.key`. `null` disables a default row. */
  readonly keys?: Readonly<Record<string, NavigationIntent | null>> | undefined;
  /** By `event.keyCode`, for remotes the platform gives no name for. */
  readonly keyCodes?: Readonly<Record<number, NavigationIntent | null>> | undefined;
}

const KEY_INTENTS: Readonly<Record<string, NavigationIntent>> = {
  ArrowUp: "moveUp",
  ArrowDown: "moveDown",
  ArrowLeft: "moveLeft",
  ArrowRight: "moveRight",
  Enter: "select",
  " ": "select",
  // Old TV browsers and IE-era engines never adopted the single-space name.
  Spacebar: "select",
  Escape: "back",
  Esc: "back",
  Tab: "tabNext",
  PageUp: "pageUp",
  PageDown: "pageDown",
  Home: "home",
  End: "end",
  ContextMenu: "contextMenu",
};

/** Remote keys the platform does name — same intents, a different source. */
const REMOTE_KEY_INTENTS: Readonly<Record<string, NavigationIntent>> = {
  GoBack: "back",
  BrowserBack: "back",
  Exit: "back",
  ChannelUp: "pageUp",
  ChannelDown: "pageDown",
};

/**
 * The rows a laptop can never produce. Channel up/down reads as paging: it is the
 * one remote gesture whose whole purpose is "a screenful at a time".
 */
const REMOTE_KEY_CODES: ReadonlyMap<number, NavigationIntent> = new Map([
  [461, "back"], // webOS Back
  [10009, "back"], // Tizen Return
  [10182, "back"], // Tizen Exit
  [427, "pageUp"], // Channel Up
  [428, "pageDown"], // Channel Down
]);

/** `null` disables the key outright; `undefined` means no override was written. */
function overrideFor(
  descriptor: KeyDescriptor,
  overrides: KeymapOverrides | undefined,
): ResolvedKey | null | undefined {
  if (overrides === undefined) return undefined;

  const byKey = overrides.keys?.[descriptor.key];
  if (byKey === null) return null;
  if (byKey !== undefined) return { intent: byKey, source: "keyboard" };

  if (descriptor.keyCode === undefined) return undefined;
  const byCode = overrides.keyCodes?.[descriptor.keyCode];
  if (byCode === null) return null;
  if (byCode !== undefined) return { intent: byCode, source: "remote" };
  return undefined;
}

export function resolveKeyIntent(
  descriptor: KeyDescriptor,
  overrides?: KeymapOverrides | undefined,
): ResolvedKey | null {
  // A modifier means an application shortcut, not navigation. Shift is the sole
  // exception because two contractual rows are built on it.
  if (descriptor.ctrlKey === true || descriptor.altKey === true || descriptor.metaKey === true) {
    return null;
  }

  const override = overrideFor(descriptor, overrides);
  if (override !== undefined) return override;

  if (descriptor.shiftKey === true) {
    if (descriptor.key === "Tab") return { intent: "tabPrev", source: "keyboard" };
    if (descriptor.key === "F10") return { intent: "contextMenu", source: "keyboard" };
    return null;
  }

  const remoteByName = REMOTE_KEY_INTENTS[descriptor.key];
  if (remoteByName !== undefined) return { intent: remoteByName, source: "remote" };

  const byName = KEY_INTENTS[descriptor.key];
  if (byName !== undefined) return { intent: byName, source: "keyboard" };

  if (descriptor.keyCode !== undefined) {
    const byCode = REMOTE_KEY_CODES.get(descriptor.keyCode);
    if (byCode !== undefined) return { intent: byCode, source: "remote" };
  }

  return null;
}

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!isHTMLElement(target)) return false;
  if (target.isContentEditable) return true;

  const tag = target.localName;
  if (tag === "textarea") return true;
  if (tag === "input") return !NON_TEXT_INPUT_TYPES.has((target as HTMLInputElement).type);

  const role = target.getAttribute("role");
  return role === "textbox" || role === "searchbox";
}

/** Intents a caret has no claim on: they mean the same thing inside a field. */
const TEXT_SAFE_INTENTS: ReadonlySet<NavigationIntent> = new Set<NavigationIntent>([
  "back",
  "tabNext",
  "tabPrev",
  "contextMenu",
]);

/** Vertical movement is a caret gesture in a textarea and free in a single line. */
const VERTICAL_INTENTS: ReadonlySet<NavigationIntent> = new Set<NavigationIntent>([
  "moveUp",
  "moveDown",
  "pageUp",
  "pageDown",
]);

/**
 * Escape still dismisses from inside a field, and Tab still tabs — but Space types
 * a space and the arrows move a caret, so those never reach a navigation scope
 * unless the application asks for the vertical pair.
 */
export function isIntentAllowedInTextEntry(
  intent: NavigationIntent,
  allowVertical: boolean,
): boolean {
  if (TEXT_SAFE_INTENTS.has(intent)) return true;
  return allowVertical && VERTICAL_INTENTS.has(intent);
}
