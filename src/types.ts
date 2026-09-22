/**
 * How the user is driving the document right now, mirrored on `<html>` as
 * `data-snav-input`. A different axis from `IntentSource`: pointer and touch
 * produce no intents at all, and a remote arrives as `keydown`, so it reports
 * `keyboard` here while its intents carry `source: "remote"`.
 */
export type InputModality = "keyboard" | "pointer" | "touch" | "gamepad";

export type IntentSource = "keyboard" | "gamepad" | "remote";

export type NavigationIntent =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "select"
  | "secondary"
  | "back"
  | "contextMenu"
  | "tabNext"
  | "tabPrev"
  | "pageUp"
  | "pageDown"
  | "home"
  | "end"
  | "scrollX"
  | "scrollY";

export interface IntentEvent {
  readonly intent: NavigationIntent;
  readonly source: IntentSource;
  /** Held down — an OS key repeat or the gamepad engine's own repeat machine. */
  readonly repeat: boolean;
  /** -1..1, and only for the analogue intents (`scrollX`, `scrollY`). */
  readonly value?: number | undefined;
  readonly originalEvent: Event | null;
  readonly defaultPrevented: boolean;
  /** Suppresses the native default without claiming the intent — see `pushScope`. */
  preventDefault(): void;
}

/** Viewport-relative geometry, in the shape `getBoundingClientRect` reports it. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
