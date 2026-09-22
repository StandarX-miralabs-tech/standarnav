/**
 * Auto-repeat, owned by the engine so that a held d-pad and a held arrow key behave
 * identically. The keyboard gets repeats from the OS for free; the gamepad gets none
 * at all, and left alone the two would diverge the moment a list got long.
 *
 * Timestamps in, timestamp out — no state object and no allocation, because the
 * caller keeps `dueAt` and `count` in typed arrays and this is called for every held
 * button on every frame.
 */

export interface RepeatOptions {
  /** How long a press is held before it starts repeating. */
  readonly delay?: number | undefined;
  readonly interval?: number | undefined;
  /** The pace after `fastAfter` repeats — long lists need an escape velocity. */
  readonly intervalFast?: number | undefined;
  readonly fastAfter?: number | undefined;
}

const DEFAULT_DELAY = 400;
const DEFAULT_INTERVAL = 130;
const DEFAULT_INTERVAL_FAST = 60;
const DEFAULT_FAST_AFTER = 6;

/** A stick pushed to the edge scrolls this much faster than one barely deflected. */
const STICK_SLOWEST = 250;
const STICK_FASTEST = 60;

export function firstRepeatAt(now: number, options?: RepeatOptions | undefined): number {
  return now + (options?.delay ?? DEFAULT_DELAY);
}

function intervalFor(
  count: number,
  modulation: number | null,
  options: RepeatOptions | undefined,
): number {
  if (modulation !== null) {
    // Push harder, scroll faster. The window is the sector's own entry threshold
    // upwards, so the slowest analogue repeat sits right where a move first counts.
    const ratio = Math.min(1, Math.max(0, (modulation - 0.5) / 0.5));
    return STICK_SLOWEST + (STICK_FASTEST - STICK_SLOWEST) * ratio;
  }
  return count >= (options?.fastAfter ?? DEFAULT_FAST_AFTER)
    ? (options?.intervalFast ?? DEFAULT_INTERVAL_FAST)
    : (options?.interval ?? DEFAULT_INTERVAL);
}

/**
 * When the repeat after this one is due, or `-1` while the current one has not come
 * round yet. `modulation` is a stick's magnitude, or `null` for a digital source —
 * a d-pad has no "harder", so it takes the stepped ladder instead.
 */
export function nextRepeatAt(
  dueAt: number,
  count: number,
  now: number,
  modulation: number | null,
  options?: RepeatOptions | undefined,
): number {
  if (now < dueAt) return -1;
  return now + intervalFor(count + 1, modulation, options);
}
