/**
 * `@standarx/nav/debug` — why the focus went there.
 *
 * A separate entry, so an application that ships spatial navigation does not ship the
 * explanation of it. Import it in a playground, a Storybook harness or a support
 * build; it costs the production bundle nothing.
 *
 * It scores exactly the list the engine scores — going through `collectNavNodes`
 * rather than re-deriving candidates — because a diagnostic that measures something
 * else is worse than no diagnostic at all.
 */

import {
  findBestCandidate,
  type MoveDirection,
  type ScoredCandidate,
  type ScoreOptions,
  scoreCandidates,
} from "./spatial/geometry";
import { collectNavNodes, containerOf, type NavNode } from "./spatial/spatial";
import { isFocusable } from "./tabbable";
import type { Rect } from "./types";

export type { MoveDirection, NavNode, ScoredCandidate, ScoreOptions };

export interface SpatialExplanation {
  /** The element the move started from. */
  readonly origin: HTMLElement;
  readonly originRect: Rect;
  /** The container the search happened in — the deepest one holding the origin. */
  readonly container: HTMLElement;
  /** Every candidate, scored, in document order. Lower is better. */
  readonly candidates: readonly ScoredCandidate<NavNode>[];
  /**
   * What this container's scoring alone chooses — which is not always where the focus
   * goes. The engine answers a directional redirection attribute first; it walks out to
   * the parent container when this one yields nothing; it wraps, and scrolls and rescans
   * a frame later, where this is `null`; it descends into a nested container and lands on
   * a descendant; and when the browser refuses the focus it goes on to the next candidate,
   * which this cannot know without focusing, so it may name what the engine skips.
   */
  readonly winner: NavNode | null;
}

/**
 * What a move in `direction` would consider and why. `root` defaults to the origin's
 * document body, which is the plugin's own default.
 */
export function explainMove(
  origin: HTMLElement,
  direction: MoveDirection,
  options: {
    readonly root?: HTMLElement | null | undefined;
    readonly score?: ScoreOptions | undefined;
  } = {},
): SpatialExplanation {
  const root = options.root ?? origin.ownerDocument.body;
  const container = containerOf(origin, root);
  const originRect = origin.getBoundingClientRect();

  const nodes = collectNavNodes(container, root).filter(
    (node) => node.element !== origin && !node.element.contains(origin),
  );
  // The winner comes from the engine's own function, never from a second
  // implementation of the same rule: a diagnostic that can disagree with the
  // engine is worse than none (ADR-0010, decision 4). `scoreCandidates` stays
  // for the per-candidate table alone, so the hot path still allocates nothing.
  const candidates = scoreCandidates(originRect, nodes, direction, options.score);
  const winner = findBestCandidate(originRect, nodes, direction, options.score);

  return { origin, originRect, container, candidates, winner };
}

/**
 * The native `<select>`s in `root` that the engine will focus and cannot follow into.
 *
 * A closed `<select>` opens a platform popup — a native menu on a television, drawn
 * outside the document — and the engine loses the focus into something it cannot see
 * or score. The trap is silent on a desktop, where the popup is navigable by the
 * browser itself, so it is not reproducible where it is written: hence a scan rather
 * than a runtime warning ([ADR-0021](../docs/adr/0021-native-select-on-television.md)).
 *
 * `multiple`, and `size` above one, render as a list box inside the document instead
 * and navigate like any other markup, so they are not reported. Focusability is asked
 * of the engine's own `isFocusable`, never re-derived here (ADR-0010).
 */
export function scanNativeSelects(root: HTMLElement): readonly HTMLSelectElement[] {
  return [...root.querySelectorAll<HTMLSelectElement>("select")].filter(
    (element) => isFocusable(element) && !element.multiple && element.size <= 1,
  );
}
