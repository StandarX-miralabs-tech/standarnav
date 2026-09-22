export function isHTMLElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as HTMLElement).nodeName === "string"
  );
}

export function queryAll<T extends Element = HTMLElement>(
  root: ParentNode | null | undefined,
  selector: string,
): T[] {
  return root === null || root === undefined ? [] : [...root.querySelectorAll<T>(selector)];
}

/**
 * Shadow-aware containment. `Node.contains` stops at a shadow boundary, so a
 * subtree rendered inside a web component would read as "outside" its own host.
 *
 * Nothing calls this in v0 — the engine is light-DOM only. It is the seam the
 * shadow-DOM path is planned to use, not code to delete: see ADR-0008.
 */
export function contains(parent: Node | null | undefined, child: Node | null | undefined): boolean {
  if (parent === null || parent === undefined || child === null || child === undefined)
    return false;
  if (parent === child || parent.contains(child)) return true;

  let node: Node | null = child;
  while (node !== null) {
    const root: Node = node.getRootNode();
    if (root === parent) return true;
    const host: Element | null = (root as ShadowRoot).host ?? null;
    if (host === null || host === node) return false;
    if (parent.contains(host)) return true;
    node = host;
  }
  return false;
}

/**
 * `composedPath()[0]`, never `event.target`: inside a shadow root the browser
 * retargets `target` to the host, which loses the element actually pressed.
 */
export function getEventTarget<T extends EventTarget = HTMLElement>(event: Event): T | null {
  const composed = event.composedPath?.();
  return (composed?.[0] as T | undefined) ?? (event.target as T | null) ?? null;
}
