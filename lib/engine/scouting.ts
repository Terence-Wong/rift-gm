/**
 * Scouting: opponents' attributes are shown as fuzzy ranges, never exact
 * numbers. Ranges tighten with scouting level (0–5). Deterministic per
 * (playerId, attribute, level) so reports don't jitter between renders.
 */

import { ROLE_WEIGHTS } from "../attributes";
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

/**
 * Estimated OVR range from the per-attribute scouted ranges, weighted by the
 * player's role (the range always contains the true OVR). Level 5 collapses
 * to the exact value.
 */
export function estimatedOvrRange(player: Player, level: number): AttributeRange {
  if (level >= MAX_SCOUT_LEVEL) {
    return { min: player.ovr, max: player.ovr, confident: true };
  }
  const weights = ROLE_WEIGHTS[player.role];
  let min = 0;
  let max = 0;
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    const r = scoutedRange(player, key, level);
    min += weights[key] * r.min;
    max += weights[key] * r.max;
  }
  min = Math.max(1, Math.floor(min * 10) / 10);
  max = Math.min(20, Math.ceil(max * 10) / 10);
  return { min, max, confident: max - min <= 2 };
}

export type UpgradeVerdict =
  | "likely upgrade"
  | "possible upgrade"
  | "too close to call"
  | "not an upgrade"
  | "unknown";

/**
 * FM-style relative read: is this player an upgrade over YOUR starter in the
 * role? Computed from the scouted range, never the true value — a thin file
 * gives a hedged answer, which is the point.
 */
export function upgradeVerdict(
  player: Player,
  level: number,
  starterOvr: number | null,
): UpgradeVerdict {
  if (starterOvr === null) return "unknown";
  const range = estimatedOvrRange(player, level);
  if (range.min > starterOvr + 0.3) return "likely upgrade";
  if (range.max < starterOvr - 0.3) return "not an upgrade";
  const mid = (range.min + range.max) / 2;
  if (mid > starterOvr + 0.5) return "possible upgrade";
  return "too close to call";
}
