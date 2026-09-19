/**
 * Which modality the user is currently driving the page with, and the attribute the
 * styles read to decide whether a focus ring is warranted.
 *
 * `:focus-visible` alone cannot carry that contract: it is one browser heuristic, it
 * cannot be read from script before paint, and it has no answer at all for a gamepad
 * — the modality this library exists to serve. So the store lives here and publishes
 * itself as `data-snav-input` on `<html>`; `:focus-visible` is only ever a complement.
 *
 * One tracker per document, ref-counted: listeners go on with the first subscriber and
 * come off with the last, so an app that never focuses anything pays nothing. The
 * gamepad engine is deliberately not a dependency here — it pushes its modality in
 * through `setInputModality`, which is what keeps `./gamepad` at zero bytes when it is
 * not imported.
 */

import type { InputModality } from "./types";

export const MODALITY_ATTRIBUTE = "data-snav-input";

/**
 * A mouse merely crossing the page must not take the modality away from a keyboard or
 * gamepad session — the ring would blink out from under the user's hands. Only a real
 * `pointerdown`, or this much *continuous* movement, reads as intent.
 */
const POINTER_INTENT_MS = 300;

/** A gap this long ends a streak: the pointer was set down, not moved across. */
const POINTER_STREAK_GAP_MS = 100;

export interface PointerStreak {
  readonly start: number;
  readonly last: number;
}

/**
 * Pure so the anti-flicker rule can be tested without waiting 300 real milliseconds.
 * Event timestamps share one time origin per document; a reading that goes backwards
 * came from somewhere else and starts a fresh streak rather than counting as age.
 */
export function trackPointerStreak(streak: PointerStreak | null, timeStamp: number): PointerStreak {
  if (
    streak === null ||
    timeStamp < streak.last ||
    timeStamp - streak.last > POINTER_STREAK_GAP_MS
  ) {
    return { start: timeStamp, last: timeStamp };
  }
  return { start: streak.start, last: timeStamp };
}

export function isPointerIntent(streak: PointerStreak): boolean {
  return streak.last - streak.start >= POINTER_INTENT_MS;
}

/** Keyboard and gamepad want a ring; pointer and touch do not. */
export function isFocusVisibleModality(modality: InputModality): boolean {
  return modality === "keyboard" || modality === "gamepad";
}

interface ModalityState {
  modality: InputModality;
  streak: PointerStreak | null;
  refs: number;
  readonly listeners: Set<(modality: InputModality) => void>;
  apply(modality: InputModality): void;
  dispose(): void;
}

const states = new WeakMap<Document, ModalityState>();

// Modifiers alone never mean "the user is navigating with the keyboard": holding Shift
// before a click would otherwise flip the whole page into keyboard mode.
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS"]);

function stateOf(doc: Document): ModalityState {
  const existing = states.get(doc);
  if (existing !== undefined) return existing;

  const apply = (modality: InputModality): void => {
    state.streak = null;
    if (state.modality === modality) return;
    state.modality = modality;
    doc.documentElement.setAttribute(MODALITY_ATTRIBUTE, modality);
    for (const listener of [...state.listeners]) listener(modality);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (MODIFIER_KEYS.has(event.key)) return;
    apply("keyboard");
  };

  const onPointerDown = (event: PointerEvent): void => {
    apply(event.pointerType === "touch" ? "touch" : "pointer");
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === "touch") return;
    // The delay only protects a session that has a ring to lose; from pointer or
    // touch there is nothing to flicker, so a mouse move is taken at its word.
    if (!isFocusVisibleModality(state.modality)) {
      apply("pointer");
      return;
    }
    state.streak = trackPointerStreak(state.streak, event.timeStamp);
    if (isPointerIntent(state.streak)) apply("pointer");
  };

  const state: ModalityState = {
    modality: "pointer",
    streak: null,
    refs: 0,
    listeners: new Set(),
    apply,
    dispose(): void {
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("pointerdown", onPointerDown, true);
      doc.removeEventListener("pointermove", onPointerMove, true);
      doc.documentElement.removeAttribute(MODALITY_ATTRIBUTE);
      states.delete(doc);
    },
  };

  // Capture phase: the modality has to be settled before any component's own handler
  // reads it, and before the focus it is about to describe actually moves.
  doc.addEventListener("keydown", onKeyDown, true);
  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("pointermove", onPointerMove, { capture: true, passive: true });

  doc.documentElement.setAttribute(MODALITY_ATTRIBUTE, state.modality);
  states.set(doc, state);
  return state;
}

/**
 * Starts the tracker and keeps it alive for as long as the returned dispose is unused.
 * The listener is optional: a consumer that only wants `data-snav-input` on `<html>`
 * for its stylesheet holds a reference without subscribing to anything.
 */
export function trackInputModality(
  doc: Document,
  listener?: ((modality: InputModality) => void) | undefined,
): VoidFunction {
  const state = stateOf(doc);
  state.refs++;
  if (listener !== undefined) state.listeners.add(listener);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (listener !== undefined) state.listeners.delete(listener);
    state.refs--;
    if (state.refs === 0) state.dispose();
  };
}

/**
 * How a source the DOM has no events for announces itself — the gamepad engine, once
 * a button or a stick crosses its dead zone. A no-op while nothing is tracking: there
 * is no subscriber to tell and no attribute on the page to correct.
 */
export function setInputModality(doc: Document, modality: InputModality): void {
  states.get(doc)?.apply(modality);
}

/**
 * Only meaningful while something is subscribed — otherwise it reports the default
 * rather than a stale reading, which is the honest answer for a tracker that is not
 * running.
 */
export function getInputModality(doc: Document): InputModality {
  return states.get(doc)?.modality ?? "pointer";
}

export function isFocusVisible(doc: Document): boolean {
  return isFocusVisibleModality(getInputModality(doc));
}
