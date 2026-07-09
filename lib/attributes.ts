/**
 * Attribute math shared between the build-time data pipeline and the app:
 * percentile → 1–20 mapping and the role-weighted OVR blend.
 */

import type { Attributes, Role } from "./types";

/** Role weight matrix for OVR (visible attributes only). */
export const ROLE_WEIGHTS: Record<
  Role,
  { laning: number; mechanics: number; macro: number; teamfight: number; aggression: number }
> = {
  TOP: { laning: 0.28, mechanics: 0.24, macro: 0.2, teamfight: 0.2, aggression: 0.08 },
  JGL: { laning: 0.08, mechanics: 0.16, macro: 0.32, teamfight: 0.22, aggression: 0.22 },
  MID: { laning: 0.22, mechanics: 0.28, macro: 0.22, teamfight: 0.2, aggression: 0.08 },
  ADC: { laning: 0.22, mechanics: 0.3, macro: 0.12, teamfight: 0.28, aggression: 0.08 },
  SUP: { laning: 0.1, mechanics: 0.12, macro: 0.34, teamfight: 0.26, aggression: 0.18 },
};

/**
 * Map a 0–1 percentile to the 1–20 scale with a light S-curve so 19–20
 * stay rare. Percentiles are computed within a role, never across roles.
 */
export function percentileToAttribute(p: number): number {
  const clamped = Math.min(1, Math.max(0, p));
  // Mild curve: compress the top end.
  const curved = Math.pow(clamped, 1.18);
  return round1(1 + curved * 19 * 0.98);
}

/** Percentile rank of `value` within `values` (0..1, midrank for ties). */
export function percentileRank(value: number, values: number[]): number {
  if (values.length <= 1) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < value) below++;
    else if (v === value) equal++;
  }
  return (below + (equal - 1) / 2) / (values.length - 1);
}

/** Role-weighted OVR on the same 1–20 scale, one decimal. */
export function computeOvr(role: Role, attrs: Attributes): number {
  const w = ROLE_WEIGHTS[role];
  const ovr =
    w.laning * attrs.laning +
    w.mechanics * attrs.mechanics +
    w.macro * attrs.macro +
    w.teamfight * attrs.teamfight +
    w.aggression * attrs.aggression;
  return round1(ovr);
}

export function clampAttr(v: number): number {
  return Math.min(20, Math.max(1, v));
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
