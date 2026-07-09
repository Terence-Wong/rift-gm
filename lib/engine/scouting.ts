/**
 * Scouting: opponents' attributes are shown as fuzzy ranges, never exact
 * numbers. Ranges tighten with scouting level (0–5). Deterministic per
 * (playerId, attribute, level) so reports don't jitter between renders.
 */

import type { AttributeKey, Player } from "../types";
import { hashSeed, mulberry32 } from "./rng";

export const MAX_SCOUT_LEVEL = 5;

export interface AttributeRange {
  min: number;
  max: number;
  /** True once the range is tight enough to trust (width ≤ 2). */
  confident: boolean;
}

/** Range width by scouting level: unscouted teams are a guess. */
export function rangeWidth(level: number): number {
  return Math.max(1, 8 - Math.min(MAX_SCOUT_LEVEL, Math.max(0, level)) * 1.5);
}

/**
 * Fuzzy range guaranteed to contain the true value. The offset inside the
 * window is a stable hash of player+attribute so the report is consistent.
 */
export function scoutedRange(
  player: Player,
  attribute: AttributeKey,
  level: number,
): AttributeRange {
  const value = player.attributes[attribute];
  const width = rangeWidth(level);
  const roll = mulberry32(hashSeed(`${player.id}:${attribute}`))();
  let min = value - roll * width;
  let max = min + width;
  if (min < 1) {
    max += 1 - min;
    min = 1;
  }
  if (max > 20) {
    min -= max - 20;
    max = 20;
  }
  min = Math.max(1, Math.floor(min));
  max = Math.min(20, Math.ceil(max));
  return { min, max, confident: max - min <= 2 };
}

/** Hidden attributes stay locked until deep scouting. */
export function hiddenVisibleAt(level: number): boolean {
  return level >= 4;
}
