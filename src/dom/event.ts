/**
 * Listeners are installed natively, and usually in capture, never through a
 * framework's synthetic system: that one delegates from its own root, so an
 * outside handler can run before the element's own. Each one comes back with
 * its teardown — an effect that cannot be undone is a leak waiting for the
 * first unmount.
 */

type DOMEventMap = DocumentEventMap & HTMLElementEventMap & WindowEventMap;

export function addDomEvent<K extends keyof DOMEventMap>(
  target: EventTarget | null | undefined,
  type: K,
  listener: (event: DOMEventMap[K]) => void,
  options?: AddEventListenerOptions,
): VoidFunction {
  if (target === null || target === undefined) return () => {};
  const handler = listener as EventListener;
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/** IME composition: a keydown mid-composition must never reach a machine. */
export function isComposingEvent(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}
