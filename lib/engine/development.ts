/**
 * Player development: weekly training growth, post-match form/morale/
 * fatigue updates, and offseason aging. Pure functions over Player-shaped
 * data — callers own persistence.
 */

import { clampAttr, computeOvr, round1 } from "../attributes";
import type { AttributeKey, Attributes, Player } from "../types";
import type { Rng } from "./rng";

export const TRAINABLE: AttributeKey[] = [
  "laning",
  "mechanics",
  "macro",
  "teamfight",
  "aggression",
];

/** Age multiplier on growth: young players grow, veterans plateau. */
export function growthAgeFactor(age: number): number {
  if (age <= 19) return 1.3;
  if (age <= 22) return 1.0;
  if (age <= 25) return 0.55;
  if (age <= 28) return 0.25;
  return 0.1;
}

/**
 * One week of focused training. Returns the applied delta (0 if none).
 * Growth is gated by POTENTIAL and age; high-attribute points cost more.
 */
export function applyTraining(player: Player, focus: AttributeKey, rng: Rng): number {
  if (!TRAINABLE.includes(focus)) return 0;
  const current = player.attributes[focus];
  const potFactor = Math.max(0.15, (player.attributes.potential - 6) / 14);
  const headroom = Math.max(0, (20 - current) / 20);
  const base = 0.09 * growthAgeFactor(player.age) * potFactor * (0.4 + headroom);
  const gain = Math.max(0, base + rng.normal(0, 0.02));
  if (gain <= 0.005) return 0;
  player.attributes[focus] = clampAttr(round1(current + gain));
  player.ovr = computeOvr(player.role, player.attributes);
  return round1(gain);
}

/** Rating on 0–10; updates rolling form (−3…+3). */
export function updateFormAfterMatch(player: Player, rating: number): void {
  player.form = Math.max(-3, Math.min(3, player.form * 0.65 + (rating - 5) * 0.55));
}

export function applyMatchFatigue(player: Player, cost = 9): void {
  player.fatigue = Math.min(100, player.fatigue + cost);
}

export function applyWeeklyRecovery(player: Player, rested: boolean): void {
  player.fatigue = Math.max(0, player.fatigue - (rested ? 22 : 11));
  // Morale drifts toward 60.
  player.morale = Math.round(player.morale + (60 - player.morale) * 0.06);
}

export function applyResultMorale(player: Player, won: boolean): void {
  player.morale = Math.max(0, Math.min(100, player.morale + (won ? 5 : -6)));
}

export interface AgingOutcome {
  deltas: Partial<Record<AttributeKey, number>>;
  retired: boolean;
}

/**
 * Offseason aging: high-potential youth grow across the board; veterans
 * lose reflex-driven attributes (mechanics/laning) while macro can tick up.
 */
export function applyOffseasonAging(player: Player, rng: Rng): AgingOutcome {
  player.age += 1;
  const deltas: Partial<Record<AttributeKey, number>> = {};
  const a: Attributes = player.attributes;

  if (player.age <= 23) {
    const potFactor = Math.max(0, (a.potential - 8) / 12);
    for (const key of TRAINABLE) {
      const d = round1(Math.max(0, rng.normal(0.35 * potFactor, 0.18)));
      if (d > 0) {
        a[key] = clampAttr(round1(a[key] + d));
        deltas[key] = d;
      }
    }
  } else if (player.age >= 27) {
    const declineRate = 0.25 + (player.age - 27) * 0.16;
    for (const key of ["mechanics", "laning"] as AttributeKey[]) {
      const d = round1(Math.max(0, rng.normal(declineRate, 0.15)));
      if (d > 0) {
        a[key] = clampAttr(round1(a[key] - d));
        deltas[key] = -d;
      }
    }
    const macroGain = round1(Math.max(0, rng.normal(0.15, 0.1)));
    if (macroGain > 0) {
      a.macro = clampAttr(round1(a.macro + macroGain));
      deltas.macro = macroGain;
    }
  }

  // Potential converges toward current ability as the ceiling closes.
  if (player.age >= 24 && a.potential > 10) {
    a.potential = clampAttr(round1(a.potential - 0.4));
  }

  player.ovr = computeOvr(player.role, player.attributes);

  const retireP =
    player.age >= 32 ? 0.55 : player.age >= 30 ? 0.28 : player.age >= 28 ? 0.08 : 0;
  const retired = rng.chance(retireP * (player.ovr < 10 ? 1.5 : 1));
  return { deltas, retired };
}

/** Projected weekly gain shown on the Training screen. */
export function projectedGain(player: Player, focus: AttributeKey): number {
  const potFactor = Math.max(0.15, (player.attributes.potential - 6) / 14);
  const headroom = Math.max(0, (20 - player.attributes[focus]) / 20);
  return round1(0.09 * growthAgeFactor(player.age) * potFactor * (0.4 + headroom) * 10) / 10;
}
