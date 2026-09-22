/**
 * The window is explicit: the engine never reaches for a global, so content
 * living in an iframe or a popup schedules on the right clock.
 */

export function raf(win: Window, fn: VoidFunction): VoidFunction {
  const id = win.requestAnimationFrame(fn);
  return () => win.cancelAnimationFrame(id);
}
