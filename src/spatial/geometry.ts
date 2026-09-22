/**
 * The scoring, and the whole of it: pure arithmetic over rectangles, so the feel of
 * spatial navigation is testable as fixtures rather than as screenshots.
 *
 * Geometry on a live DOM, never a precomputed graph. A graph has to be invalidated,
 * and it is wrong the moment a list virtualises or a menu opens. A move is a human
 * action, so measuring a few dozen rectangles per move costs nothing worth saving.
 *
 * Two passes. Pass A only considers candidates whose projection on the perpendicular
 * axis overlaps the origin's, which is what stops a right-press from landing two rows
 * down. Pass B opens it up to everything eligible, so a layout with nothing aligned
 * still has somewhere to go.
 *
 * The orthogonal penalty is asymmetric: 30 across a horizontal move and 2 down a
 * vertical one. Reading down a column tolerates being off-axis; reading along a row
 * does not. Every constant here has its provenance in ADR-0016.
 */

import type { Rect } from "../types";

export type MoveDirection = "up" | "down" | "left" | "right";

export interface HasRect {
  readonly rect: Rect;
}

export interface ScoreOptions {
  /** How far a candidate may overlap the origin along the move and still count as
   * beyond it, as a fraction of the origin's size. */
  readonly overlapThreshold?: number | undefined;
  /** Penalty per pixel off-axis during a horizontal move. */
  readonly weightHorizontal?: number | undefined;
  /** …and during a vertical one. */
  readonly weightVertical?: number | undefined;
  /** Reward for a full projection overlap. Defaults to the origin's own size across
   * the move, which self-calibrates to whatever is being navigated. */
  readonly alignBonus?: number | undefined;
}

const DEFAULT_OVERLAP_THRESHOLD = 0.3;
const DEFAULT_WEIGHT_HORIZONTAL = 30;
const DEFAULT_WEIGHT_VERTICAL = 2;

function isHorizontal(direction: MoveDirection): boolean {
  return direction === "left" || direction === "right";
}

/** Distance from the origin's exit edge to the candidate's entry edge; negative when
 * the candidate reaches back over the origin. */
function axisGap(origin: Rect, candidate: Rect, direction: MoveDirection): number {
  switch (direction) {
    case "right":
      return candidate.x - (origin.x + origin.width);
    case "left":
      return origin.x - (candidate.x + candidate.width);
    case "down":
      return candidate.y - (origin.y + origin.height);
    case "up":
      return origin.y - (candidate.y + candidate.height);
  }
}

function overlapOn(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart);
}

function orthogonalOverlap(origin: Rect, candidate: Rect, horizontal: boolean): number {
  return horizontal
    ? overlapOn(origin.y, origin.height, candidate.y, candidate.height)
    : overlapOn(origin.x, origin.width, candidate.x, candidate.width);
}

function scoreOf(
  origin: Rect,
  candidate: Rect,
  direction: MoveDirection,
  horizontal: boolean,
  gap: number,
  overlap: number,
  weight: number,
  alignBonus: number,
): number {
  // P1: the middle of the edge the focus is leaving by.
  const exitX =
    direction === "right"
      ? origin.x + origin.width
      : direction === "left"
        ? origin.x
        : origin.x + origin.width / 2;
  const exitY =
    direction === "down"
      ? origin.y + origin.height
      : direction === "up"
        ? origin.y
        : origin.y + origin.height / 2;

  // P2: the nearest point of the edge the candidate would be entered by.
  const entryX = horizontal
    ? direction === "right"
      ? candidate.x
      : candidate.x + candidate.width
    : Math.min(candidate.x + candidate.width, Math.max(candidate.x, exitX));
  const entryY = horizontal
    ? Math.min(candidate.y + candidate.height, Math.max(candidate.y, exitY))
    : direction === "down"
      ? candidate.y
      : candidate.y + candidate.height;

  const euclid = Math.hypot(entryX - exitX, entryY - exitY);
  const orthogonal = horizontal ? Math.abs(entryY - exitY) : Math.abs(entryX - exitX);
  const intersection =
    Math.max(0, overlapOn(origin.x, origin.width, candidate.x, candidate.width)) *
    Math.max(0, overlapOn(origin.y, origin.height, candidate.y, candidate.height));
  const ratio =
    overlap <= 0
      ? 0
      : Math.min(
          1,
          overlap /
            Math.max(
              1,
              Math.min(
                horizontal ? origin.height : origin.width,
                horizontal ? candidate.height : candidate.width,
              ),
            ),
        );

  return (
    euclid + Math.max(0, gap) + weight * orthogonal - Math.sqrt(intersection) - alignBonus * ratio
  );
}

/**
 * The candidate a move lands on, or `null` when nothing is eligible. Ties go to the
 * earlier entry, which is DOM order — candidates are collected in document order and
 * that is the tiebreak the spec asks for.
 */
export function findBestCandidate<T extends HasRect>(
  origin: Rect,
  candidates: readonly T[],
  direction: MoveDirection,
  options?: ScoreOptions | undefined,
): T | null {
  const horizontal = isHorizontal(direction);
  const threshold = options?.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD;
  const tolerance = threshold * (horizontal ? origin.width : origin.height);
  const weight = horizontal
    ? (options?.weightHorizontal ?? DEFAULT_WEIGHT_HORIZONTAL)
    : (options?.weightVertical ?? DEFAULT_WEIGHT_VERTICAL);
  const alignBonus = options?.alignBonus ?? (horizontal ? origin.height : origin.width);

  let aligned: T | null = null;
  let alignedScore = Number.POSITIVE_INFINITY;
  let any: T | null = null;
  let anyScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const gap = axisGap(origin, candidate.rect, direction);
    if (gap < -tolerance) continue;

    const overlap = orthogonalOverlap(origin, candidate.rect, horizontal);
    const score = scoreOf(
      origin,
      candidate.rect,
      direction,
      horizontal,
      gap,
      overlap,
      weight,
      alignBonus,
    );

    if (overlap > 0 && score < alignedScore) {
      aligned = candidate;
      alignedScore = score;
    }
    if (score < anyScore) {
      any = candidate;
      anyScore = score;
    }
  }

  return aligned ?? any;
}

export interface ScoredCandidate<T> {
  readonly candidate: T;
  readonly score: number;
  /** Its projection across the move overlaps the origin's — the first pass. */
  readonly aligned: boolean;
  /** It cleared the directional filter at all. */
  readonly eligible: boolean;
}

/**
 * Every candidate with its score and which pass it belongs to — for a debug overlay
 * and for support tickets. A second loop rather than a shared one on purpose:
 * `findBestCandidate` is the hot path and must not allocate an object per candidate
 * to satisfy a diagnostic that runs when a developer asks for it.
 */
export function scoreCandidates<T extends HasRect>(
  origin: Rect,
  candidates: readonly T[],
  direction: MoveDirection,
  options?: ScoreOptions | undefined,
): ScoredCandidate<T>[] {
  const horizontal = isHorizontal(direction);
  const tolerance =
    (options?.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD) *
    (horizontal ? origin.width : origin.height);
  const weight = horizontal
    ? (options?.weightHorizontal ?? DEFAULT_WEIGHT_HORIZONTAL)
    : (options?.weightVertical ?? DEFAULT_WEIGHT_VERTICAL);
  const alignBonus = options?.alignBonus ?? (horizontal ? origin.height : origin.width);

  return candidates.map((candidate) => {
    const gap = axisGap(origin, candidate.rect, direction);
    const overlap = orthogonalOverlap(origin, candidate.rect, horizontal);
    return {
      candidate,
      eligible: gap >= -tolerance,
      aligned: overlap > 0,
      score: scoreOf(
        origin,
        candidate.rect,
        direction,
        horizontal,
        gap,
        overlap,
        weight,
        alignBonus,
      ),
    };
  });
}

/**
 * Where a move goes when it falls off the end of a wrapping container: the far side
 * of the same row or column. Alignment first, so wrapping right from the end of row
 * two lands at the start of row two rather than the start of the grid.
 */
export function findWrapCandidate<T extends HasRect>(
  origin: Rect,
  candidates: readonly T[],
  direction: MoveDirection,
): T | null {
  const horizontal = isHorizontal(direction);
  const alignedOnly = candidates.filter(
    (candidate) => orthogonalOverlap(origin, candidate.rect, horizontal) > 0,
  );
  const pool = alignedOnly.length > 0 ? alignedOnly : candidates;

  let best: T | null = null;
  let bestEdge = Number.POSITIVE_INFINITY;

  for (const candidate of pool) {
    const { rect } = candidate;
    // The edge a move in `direction` would eventually reach if it kept going the
    // other way — so wrapping right starts from the leftmost candidate.
    const edge =
      direction === "right"
        ? rect.x
        : direction === "left"
          ? -(rect.x + rect.width)
          : direction === "down"
            ? rect.y
            : -(rect.y + rect.height);
    if (edge < bestEdge) {
      best = candidate;
      bestEdge = edge;
    }
  }

  return best;
}
