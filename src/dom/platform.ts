/**
 * The read takes a window, which is the point: it can only be called from an
 * effect, never during render. A media query answered at render time is how a
 * hydration mismatch is born.
 */

export function prefersReducedMotion(win: Window): boolean {
  return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
