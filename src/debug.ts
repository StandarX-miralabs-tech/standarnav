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
   * What this container's scoring alone chooses — which is not always where the
   * focus goes. The engine answers a directional redirection attribute before it
   * scores anything; it walks out to the parent container when this one yields
   * nothing; it wraps, and it scrolls and rescans a frame later, in cases where
   * this is `null`; and when the choice is a nested container it descends into it
   * and lands on a descendant rather than on the container itself.
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
