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
  const candidates = scoreCandidates(originRect, nodes, direction, options.score);

  // The engine's rule, restated once here rather than exported from the hot path:
  // the best aligned candidate, and only if none is aligned, the best of the rest.
  let winner: NavNode | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const pass of [true, false]) {
    for (const entry of candidates) {
      if (!entry.eligible || entry.aligned !== pass) continue;
      if (entry.score < best) {
        winner = entry.candidate;
        best = entry.score;
      }
    }
    if (winner !== null) break;
  }

  return { origin, originRect, container, candidates, winner };
}
