/**
 * Two different problems that both get called "dead zone", and giving them one
 * treatment is what makes gamepad menus feel broken.
 *
 * A continuous reading (the right stick scrolling a list) wants a *radial* cut with
 * renormalisation: measure the magnitude, not each axis. Per-axis thresholds carve a
 * square hole, so a diagonal slips through at a lower true deflection than a straight
 * push does, and the stick feels stronger on the diagonals.
 *
 * A discrete reading (the left stick moving the focus) wants a sector with hysteresis
 * instead. One flick has to mean exactly one move, and the boundary between "right"
 * and "up" has to be sticky — otherwise a stick held at 46° machine-guns alternating
 * moves, the classic bug every engine ships once.
 *
 * Everything here is pure and returns scalars, never objects: this runs sixty times a
 * second and must not allocate.
 */

export type StickCurve = "linear" | "quadratic";

export interface DeadZoneOptions {
  /** Below this magnitude the stick reads as centred. */
  readonly deadZone?: number | undefined;
  /** Quadratic buys precision near the centre, which is what fine scrolling wants. */
  readonly curve?: StickCurve | undefined;
}

const DEFAULT_DEAD_ZONE = 0.15;

/**
 * The corrected magnitude of a stick: 0 inside the dead zone, and renormalised so
 * that the first perceptible movement past the edge is a real 0 rather than a jump
 * to `deadZone`.
 */
export function applyDeadZone(x: number, y: number, options?: DeadZoneOptions | undefined): number {
  const deadZone = options?.deadZone ?? DEFAULT_DEAD_ZONE;
  const magnitude = Math.hypot(x, y);
  if (magnitude <= deadZone) return 0;

  const normalized = Math.min(1, (magnitude - deadZone) / (1 - deadZone));
  return options?.curve === "linear" ? normalized : normalized * normalized;
}

export type StickDirection = "up" | "down" | "left" | "right";

export interface SectorOptions {
  /** Magnitude that claims a direction. */
  readonly enter?: number | undefined;
  /** Magnitude that gives it back — lower than `enter`, hence the hysteresis. */
  readonly exit?: number | undefined;
  /** Extra degrees a stick must cross before it changes sector. */
  readonly marginDeg?: number | undefined;
}

const DEFAULT_ENTER = 0.5;
const DEFAULT_EXIT = 0.3;
const DEFAULT_MARGIN_DEG = 12;

/** Screen axes: y grows downwards, exactly as the Gamepad API reports it. */
function nearestSector(x: number, y: number): StickDirection {
  if (Math.abs(x) >= Math.abs(y)) return x > 0 ? "right" : "left";
  return y > 0 ? "down" : "up";
}

function degreesFromAxis(x: number, y: number, direction: StickDirection): number {
  const magnitude = Math.hypot(x, y);
  if (magnitude === 0) return 180;
  const dot = direction === "right" ? x : direction === "left" ? -x : direction === "down" ? y : -y;
  return (Math.acos(Math.min(1, Math.max(-1, dot / magnitude))) * 180) / Math.PI;
}

/**
 * The direction a stick is claiming, given the one it claimed last frame. `null` means
 * centred — and a caller only emits a move on the transition into a direction, which
 * is what turns a held stick into one move plus a repeat rather than sixty moves.
 */
export function resolveSector(
  current: StickDirection | null,
  x: number,
  y: number,
  options?: SectorOptions | undefined,
): StickDirection | null {
  const magnitude = Math.hypot(x, y);

  if (current === null) {
    return magnitude >= (options?.enter ?? DEFAULT_ENTER) ? nearestSector(x, y) : null;
  }

  if (magnitude <= (options?.exit ?? DEFAULT_EXIT)) return null;

  // 45° is where the sectors meet; the margin is how far past the meeting point the
  // stick has to travel before the old direction lets go.
  const margin = options?.marginDeg ?? DEFAULT_MARGIN_DEG;
  return degreesFromAxis(x, y, current) <= 45 + margin ? current : nearestSector(x, y);
}
