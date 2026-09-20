/**
 * Spatial navigation — the differentiator, and userland by necessity: `css-nav-1` was
 * handed back to the WICG, last touched in 2019, and no browser ever shipped it.
 *
 * Real DOM focus, never a virtual cursor keyed by id. Screen readers, `:focus`, form
 * behaviour and browser extensions all come free that way, and none of them can be
 * given back afterwards.
 *
 * Declarative first: a container is `data-snav="container"` and everything else is an
 * attribute on it, so plain HTML becomes navigable with no application code. The
 * imperative surface is for the cases attributes cannot express.
 */

import { addDomEvent } from "../dom/event";
import { prefersReducedMotion } from "../dom/platform";
import { isHTMLElement } from "../dom/query";
import { raf } from "../dom/raf";
import type { InputPlugin, InputPluginContext } from "../input-system";
import { focusElement, getFocusables, isFocusable } from "../tabbable";
import type { IntentEvent, NavigationIntent, Rect } from "../types";
import {
  ACTIVE_ATTRIBUTE,
  BLOCK_ATTRIBUTE,
  blocksDirection,
  CONTAINER_SELECTOR,
  directionAttribute,
  ENTER_ATTRIBUTE,
  entryStrategy,
  FOCUSED_ATTRIBUTE,
  IGNORE_SELECTOR,
  SCROLL_ATTRIBUTE,
  TRAP_ATTRIBUTE,
  WRAP_ATTRIBUTE,
  wrapsDirection,
} from "./containers";
import {
  findBestCandidate,
  findWrapCandidate,
  type MoveDirection,
  type ScoreOptions,
} from "./geometry";

// `move()`, `WillMoveEvent.direction` and `SpatialPluginOptions.score` all name
// these, and `./geometry` is not a published subpath — without the re-export a
// consumer can call the API but cannot write its types down.
export type { MoveDirection, ScoreOptions };

const MOVE_DIRECTIONS: Readonly<Record<string, MoveDirection>> = {
  moveUp: "up",
  moveDown: "down",
  moveLeft: "left",
  moveRight: "right",
};

/** How far a step-and-rescan scrolls, as a share of the scroller's own viewport. */
const SCROLL_STEP_RATIO = 0.8;
/** Pixels per frame at full stick deflection. */
const ANALOGUE_SCROLL_RATE = 24;
/** Depth bound on the walk out through nested containers. */
const MAX_CONTAINER_DEPTH = 16;

export type SpatialMode = "composite" | "app";

export interface WillMoveEvent {
  readonly from: HTMLElement | null;
  readonly to: HTMLElement;
  readonly direction: MoveDirection;
  readonly defaultPrevented: boolean;
  /** The machine's veto, in one call. */
  preventDefault(): void;
}

export interface SpatialPluginOptions {
  /**
   * `composite` is the web default and APG-strict: arrow keys stay inside composites
   * and only Tab moves between them, while a gamepad still crosses the whole page.
   * `app` gives the arrow keys the same freedom — televisions, kiosks, dashboards.
   */
  readonly mode?: SpatialMode | undefined;
  readonly root?: HTMLElement | null | undefined;
  readonly score?: ScoreOptions | undefined;
  /** Hovering focuses, so a mouse and a pad do not fight over two cursors. Defaults
   * to on in `app` mode and off in `composite`. */
  readonly pointerFollowsFocus?: boolean | undefined;
  /** Right-stick scrolling of the focused element's scroll container. On by default. */
  readonly analogueScroll?: boolean | undefined;
}

export interface SpatialPlugin extends InputPlugin {
  move(direction: MoveDirection): boolean;
  focus(target: HTMLElement | string): boolean;
  focusFirst(container?: HTMLElement | null | undefined): boolean;
  onWillMove(listener: (event: WillMoveEvent) => void): VoidFunction;
  /** Nowhere left to go — the hook for a bump animation or a rumble. */
  onBoundsHit(listener: (direction: MoveDirection) => void): VoidFunction;
}

export interface NavNode {
  readonly element: HTMLElement;
  /** A nested container, scored once as a unit rather than as all of its children. */
  readonly isContainer: boolean;
  readonly rect: Rect;
}

interface ElementHandle {
  deref(): HTMLElement | null;
}

interface WeakRefCtor {
  new (target: HTMLElement): { deref(): HTMLElement | undefined };
}

/**
 * A weak reference where the engine has one, and a self-releasing strong reference
 * where it does not. `WeakRef` is Chromium 84 / Safari 14.1 / Firefox 79, below the
 * parsing floor of ADR-0013 but inside the best-effort band, and `lib` stays at
 * es2020 so the fallback cannot be deleted as dead code.
 *
 * The fallback drops its reference on the first read that finds the element
 * detached, which is the contract ADR-0013 states: the same observable behaviour,
 * at the cost of holding one element per container until that container is next
 * entered.
 *
 * The constructor is read here rather than at module scope so a test can delete the
 * global before a plugin is built.
 */
function elementHandle(element: HTMLElement): ElementHandle {
  const ctor = (globalThis as unknown as { WeakRef?: WeakRefCtor }).WeakRef;
  if (typeof ctor === "function") {
    const ref = new ctor(element);
    return { deref: (): HTMLElement | null => ref.deref() ?? null };
  }

  let strong: HTMLElement | null = element;
  return {
    deref(): HTMLElement | null {
      if (strong !== null && !strong.isConnected) strong = null;
      return strong;
    },
  };
}

function isHorizontal(direction: MoveDirection): boolean {
  return direction === "left" || direction === "right";
}

/** The deepest declared container holding `element`, or the root if there is none. */
export function containerOf(element: HTMLElement, root: HTMLElement): HTMLElement {
  const found = element.closest<HTMLElement>(CONTAINER_SELECTOR);
  return found !== null && root.contains(found) ? found : root;
}

/** The child of `container` that owns `from`, so a nested container scores once. */
function childContainerOf(from: HTMLElement, container: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = from;
  for (let depth = 0; node !== null && depth < MAX_CONTAINER_DEPTH; depth++) {
    const parent: HTMLElement | null =
      node.parentElement?.closest<HTMLElement>(CONTAINER_SELECTOR) ?? null;
    if (parent === container || parent === null) return node;
    node = parent;
  }
  return null;
}

/**
 * What a move from inside `container` may land on: its own focusables, plus each
 * nested container as a single unit. Exported because a diagnostic has to score the
 * same list the engine does — one that measures something else is worse than none.
 */
export function collectNavNodes(container: HTMLElement, root: HTMLElement): NavNode[] {
  const nodes: NavNode[] = [];
  const seen = new Set<HTMLElement>();

  for (const element of getFocusables(container)) {
    if (element.closest(IGNORE_SELECTOR) !== null) continue;

    const owner = containerOf(element, root);
    const target = owner === container ? element : childContainerOf(owner, container);
    if (target === null || seen.has(target)) continue;
    seen.add(target);

    const rect = target.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    nodes.push({ element: target, isContainer: target !== element, rect });
  }

  return nodes;
}

function canScroll(element: Element, direction: MoveDirection): boolean {
  switch (direction) {
    case "up":
      return element.scrollTop > 1;
    case "down":
      return element.scrollTop + element.clientHeight < element.scrollHeight - 1;
    case "left":
      return element.scrollLeft > 1;
    case "right":
      return element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
  }
}

function nearestScrollable(
  from: HTMLElement | null,
  root: HTMLElement,
  direction: MoveDirection,
): HTMLElement | null {
  let node: HTMLElement | null = from;
  for (let depth = 0; node !== null && depth < MAX_CONTAINER_DEPTH; depth++) {
    if (canScroll(node, direction)) return node;
    if (node === root) return null;
    node = node.parentElement;
  }
  return null;
}

/**
 * The page itself, which the walk above can never reach.
 *
 * In standards mode the element that scrolls the document is `scrollingElement` —
 * `<html>` — and `body.scrollTop` is 0 for ever; a walk that ends at `body`
 * therefore answers "nothing scrolls" on every page whose only scroller is the page,
 * and a page with no focusable at all could not be read past the fold. The stick's
 * scroll is independent of the focus, and this is the half of that the walk alone
 * cannot keep.
 */
function pageScroller(root: HTMLElement, direction: MoveDirection): HTMLElement | null {
  const page = root.ownerDocument.scrollingElement;
  return isHTMLElement(page) && canScroll(page, direction) ? page : null;
}

export function spatialPlugin(options: SpatialPluginOptions = {}): SpatialPlugin {
  const mode: SpatialMode = options.mode ?? "composite";
  const followPointer = options.pointerFollowsFocus ?? mode === "app";
  const analogueScroll = options.analogueScroll !== false;

  // A container remembers the child that had the focus, and forgets it for free when
  // that child is removed.
  // Re-assignable so the teardown can drop the whole map: on the `WeakRef` fallback
  // path a handle holds its element strongly, so every remembered element would
  // stay reachable through this closure for as long as the plugin object lives —
  // long after `destroy()`.
  let memory = new WeakMap<HTMLElement, ElementHandle>();
  const willMoveListeners = new Set<(event: WillMoveEvent) => void>();
  const boundsListeners = new Set<(direction: MoveDirection) => void>();

  // The containers currently carrying `data-snav-active`, kept rather than queried
  // back out of the document — this runs on every move.
  const activeContainers: HTMLElement[] = [];

  let context: InputPluginContext | null = null;
  let rescanning = false;
  let cancelRescan: VoidFunction | null = null;
  let focused: HTMLElement | null = null;

  function doc(): Document | null {
    return context?.doc ?? null;
  }

  function rootOf(): HTMLElement | null {
    const document = doc();
    if (document === null) return null;
    return options.root ?? document.body;
  }

  function activeElement(): HTMLElement | null {
    const node = doc()?.activeElement ?? null;
    return isHTMLElement(node) ? node : null;
  }

  function remember(element: HTMLElement, root: HTMLElement): void {
    focused?.removeAttribute(FOCUSED_ATTRIBUTE);
    for (const stale of activeContainers) stale.removeAttribute(ACTIVE_ATTRIBUTE);
    activeContainers.length = 0;

    focused = element;
    element.setAttribute(FOCUSED_ATTRIBUTE, "");

    let container: HTMLElement | null = containerOf(element, root);
    for (let depth = 0; container !== null && depth < MAX_CONTAINER_DEPTH; depth++) {
      memory.set(container, elementHandle(element));
      container.setAttribute(ACTIVE_ATTRIBUTE, "");
      activeContainers.push(container);
      if (container === root) break;
      container = containerOf(container.parentElement ?? root, root);
    }
  }

  function scrollFocusIntoView(element: HTMLElement, root: HTMLElement): void {
    const document = doc();
    const win = document?.defaultView ?? null;
    if (win === null) return;

    const centred =
      containerOf(element, root).getAttribute(SCROLL_ATTRIBUTE) === "center" ? "center" : "nearest";
    element.scrollIntoView({
      block: centred,
      inline: centred,
      behavior: prefersReducedMotion(win) ? "auto" : "smooth",
    });
  }

  function commit(from: HTMLElement | null, to: HTMLElement, direction: MoveDirection): boolean {
    const root = rootOf();
    if (root === null) return false;

    if (willMoveListeners.size > 0) {
      let prevented = false;
      const event: WillMoveEvent = {
        from,
        to,
        direction,
        get defaultPrevented(): boolean {
          return prevented;
        },
        preventDefault(): void {
          prevented = true;
        },
      };
      for (const listener of [...willMoveListeners]) listener(event);
      if (prevented) return false;
    }

    focusElement(to, { preventScroll: true });
    remember(to, root);
    scrollFocusIntoView(to, root);
    return true;
  }

  function enterContainer(
    container: HTMLElement,
    origin: Rect,
    direction: MoveDirection,
    root: HTMLElement,
  ): HTMLElement | null {
    const strategy = entryStrategy(container.getAttribute(ENTER_ATTRIBUTE));

    if (strategy === "last") {
      const remembered = memory.get(container)?.deref() ?? null;
      if (remembered !== null && container.contains(remembered) && isFocusable(remembered)) {
        return remembered;
      }
    }

    const nodes = collectNavNodes(container, root);
    const chosen =
      strategy === "first"
        ? (nodes[0] ?? null)
        : (findBestCandidate(origin, nodes, direction, options.score) ?? nodes[0] ?? null);
    if (chosen === null) return null;
    return chosen.isContainer
      ? enterContainer(chosen.element, origin, direction, root)
      : chosen.element;
  }

  function land(
    from: HTMLElement | null,
    node: NavNode,
    origin: Rect,
    direction: MoveDirection,
    root: HTMLElement,
  ): boolean {
    if (!node.isContainer) return commit(from, node.element, direction);
    const target = enterContainer(node.element, origin, direction, root);
    return target !== null && commit(from, target, direction);
  }

  /**
   * A virtualised list mounts its next rows on the scroll, so the rescan waits a
   * frame — and only ever one, or a list with an unreachable end would scroll to the
   * bottom on a single press.
   */
  function scrollAndRescan(
    container: HTMLElement,
    root: HTMLElement,
    direction: MoveDirection,
  ): boolean {
    if (rescanning) return false;
    const document = doc();
    const win = document?.defaultView ?? null;
    if (win === null) return false;

    const scroller = nearestScrollable(container, root, direction);
    if (scroller === null) return false;

    const step =
      SCROLL_STEP_RATIO * (isHorizontal(direction) ? scroller.clientWidth : scroller.clientHeight);
    const delta = direction === "right" || direction === "down" ? step : -step;
    scroller.scrollBy(isHorizontal(direction) ? { left: delta } : { top: delta });

    rescanning = true;
    cancelRescan = raf(win, () => {
      cancelRescan = null;
      move(direction);
      rescanning = false;
    });
    return true;
  }

  function move(direction: MoveDirection): boolean {
    const root = rootOf();
    if (root === null) return false;

    const active = activeElement();
    if (active === null || active === doc()?.body || !root.contains(active)) {
      return focusFirst(root);
    }

    const redirect = active.getAttribute(directionAttribute(direction));
    if (redirect !== null) {
      const target = root.ownerDocument.querySelector<HTMLElement>(redirect);
      if (target !== null) return commit(active, target, direction);
    }

    const origin = active.getBoundingClientRect();
    let container = containerOf(active, root);

    for (let depth = 0; depth < MAX_CONTAINER_DEPTH; depth++) {
      const nodes = collectNavNodes(container, root).filter(
        (node) => node.element !== active && !node.element.contains(active),
      );

      const best = findBestCandidate(origin, nodes, direction, options.score);
      if (best !== null) return land(active, best, origin, direction, root);

      if (wrapsDirection(container.getAttribute(WRAP_ATTRIBUTE), direction)) {
        const wrapped = findWrapCandidate(origin, nodes, direction);
        if (wrapped !== null) return land(active, wrapped, origin, direction, root);
      }

      if (scrollAndRescan(container, root, direction)) return true;

      if (container === root) break;
      if (container.hasAttribute(TRAP_ATTRIBUTE)) break;
      if (blocksDirection(container.getAttribute(BLOCK_ATTRIBUTE), direction)) break;
      container = containerOf(container.parentElement ?? root, root);
    }

    for (const listener of [...boundsListeners]) listener(direction);
    return false;
  }

  function focusFirst(container?: HTMLElement | null | undefined): boolean {
    const root = rootOf();
    if (root === null) return false;
    const scope = container ?? root;
    const nodes = collectNavNodes(scope, root);
    const first = nodes[0];
    if (first === undefined) return false;
    return land(activeElement(), first, scope.getBoundingClientRect(), "down", root);
  }

  function analogueScrollBy(intent: NavigationIntent, value: number): boolean {
    const root = rootOf();
    if (root === null || value === 0) return false;
    const horizontal = intent === "scrollX";
    const direction: MoveDirection = horizontal
      ? value > 0
        ? "right"
        : "left"
      : value > 0
        ? "down"
        : "up";

    // The focused control's own scroller first — a sidebar, a list — and the page
    // when it has none, or when nothing has the focus at all.
    const scroller =
      nearestScrollable(activeElement(), root, direction) ?? pageScroller(root, direction);
    if (scroller === null) return false;
    const delta = value * ANALOGUE_SCROLL_RATE;
    scroller.scrollBy(horizontal ? { left: delta } : { top: delta });
    return true;
  }

  function handleIntent(event: IntentEvent): boolean {
    if (event.intent === "scrollX" || event.intent === "scrollY") {
      return analogueScroll && analogueScrollBy(event.intent, event.value ?? 0);
    }

    const direction = MOVE_DIRECTIONS[event.intent];
    if (direction === undefined) return false;
    // APG-strict by default: arrow keys belong to whatever composite has the focus,
    // and only Tab crosses between them. A gamepad has no Tab, so it crosses anyway.
    if (mode === "composite" && event.source === "keyboard") return false;
    return move(direction);
  }

  return {
    name: "spatial",

    setup(pluginContext): VoidFunction {
      context = pluginContext;
      // Pushed at setup, so it sits at the bottom of the stack: every scope a
      // component opens later is asked first, and this is the last resort.
      //
      // `base`, and it is the only scope in the library that is: a modal's trap
      // has to silence the page without silencing movement *inside* the modal,
      // and this engine already confines itself to the trapping surface through
      // `data-snav-trap`. Without it a dialog opened on a pad could be left but
      // never navigated.
      const teardowns = [pluginContext.bus.pushScope(handleIntent, { base: true })];

      if (followPointer) {
        teardowns.push(
          addDomEvent(
            pluginContext.doc,
            "pointerover",
            (event: PointerEvent) => {
              const target = event.target;
              if (!isHTMLElement(target) || !isFocusable(target)) return;
              const root = rootOf();
              if (root === null || !root.contains(target)) return;
              focusElement(target, { preventScroll: true });
              remember(target, root);
            },
            { capture: true, passive: true },
          ),
        );
      }

      return () => {
        for (const teardown of teardowns.reverse()) teardown();
        // A scroll-and-rescan in flight owns both a frame and the latch that stops a
        // second one starting. Leaving either behind would fire a move into a torn
        // down plugin, or latch the feature off for good on a plugin set up again.
        cancelRescan?.();
        cancelRescan = null;
        rescanning = false;
        willMoveListeners.clear();
        boundsListeners.clear();
        for (const stale of activeContainers) stale.removeAttribute(ACTIVE_ATTRIBUTE);
        activeContainers.length = 0;
        focused?.removeAttribute(FOCUSED_ATTRIBUTE);
        focused = null;
        // Dropping the map releases every handle, and with them every element the
        // fallback path is holding strongly.
        memory = new WeakMap();
        context = null;
      };
    },

    move,
    focusFirst,

    focus(target): boolean {
      const root = rootOf();
      if (root === null) return false;
      const element =
        typeof target === "string" ? root.ownerDocument.querySelector<HTMLElement>(target) : target;
      if (element === null) return false;
      return commit(activeElement(), element, "down");
    },

    onWillMove(listener): VoidFunction {
      willMoveListeners.add(listener);
      return () => willMoveListeners.delete(listener);
    },

    onBoundsHit(listener): VoidFunction {
      boundsListeners.add(listener);
      return () => boundsListeners.delete(listener);
    },
  };
}
