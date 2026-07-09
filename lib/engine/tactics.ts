/**
 * Tactics layer: playstyle phase shifts, objective-focus biases, and the
 * comp-archetype counter matrix. All values are additive modifiers on the
 * team phase strengths (which live on the 1–20 attribute scale).
 */

import type { CompArchetype, ObjectiveFocus, Playstyle, TeamTactics } from "../types";

export interface PhaseModifiers {
  early: number;
  mid: number;
  late: number;
  /** Multiplier on per-minute noise (1 = neutral). */
  variance: number;
  dragonBonus: number;
  heraldBonus: number;
  baronBonus: number;
}

export const PLAYSTYLES: Record<Playstyle, { label: string; blurb: string }> = {
  AGGRESSIVE: {
    label: "Aggressive early",
    blurb: "Fight for lane priority and early skirmishes. Swingier games.",
  },
  BALANCED: {
    label: "Balanced",
    blurb: "Play what the game gives you. No phase bias.",
  },
  SCALING: {
    label: "Scaling",
    blurb: "Concede tempo, win the late game. Steadier but slower.",
  },
};

export const OBJECTIVES: Record<ObjectiveFocus, { label: string; blurb: string }> = {
  DRAGON: { label: "Dragon soul", blurb: "Stack drakes and win through soul point." },
  HERALD: { label: "Herald tempo", blurb: "Convert herald into plates and early towers." },
  BARON: { label: "Baron priority", blurb: "Set the map for baron windows after 20." },
};

export const ARCHETYPES: Record<CompArchetype, { label: string; blurb: string }> = {
  POKE: { label: "Poke", blurb: "Whittle before objectives. Strong siege, weak to hard engage." },
  PICK: { label: "Pick", blurb: "Catch isolated targets. Punishes poke setups." },
  TEAMFIGHT: { label: "Teamfight", blurb: "5v5 wombo. Runs over pick comps, suffers into poke." },
  SPLITPUSH: { label: "Split push", blurb: "1-3-1 side pressure. Punishes slow mid-game teams." },
  CHEESE: { label: "Early cheese", blurb: "Level-1 plays and dives. High risk, falls off hard." },
};

/**
 * Counter matrix: edge for `a` against `b`, applied to all phases.
 * Poke > Teamfight > Pick > Poke; Split-push punishes Teamfight/Scaling
 * setups; Cheese trades late power for early explosiveness elsewhere.
 */
const COUNTER: Record<CompArchetype, Partial<Record<CompArchetype, number>>> = {
  POKE: { TEAMFIGHT: 0.7, PICK: -0.7, CHEESE: -0.3 },
  PICK: { POKE: 0.7, TEAMFIGHT: -0.7, SPLITPUSH: 0.4 },
  TEAMFIGHT: { PICK: 0.7, POKE: -0.7, SPLITPUSH: -0.5 },
  SPLITPUSH: { TEAMFIGHT: 0.5, PICK: -0.4, CHEESE: 0.3 },
  CHEESE: { POKE: 0.3, SPLITPUSH: -0.3 },
};

export function counterEdge(a: CompArchetype, b: CompArchetype): number {
  return COUNTER[a]?.[b] ?? 0;
}

/** Intrinsic phase profile of an archetype (independent of matchup). */
const ARCHETYPE_PHASES: Record<
  CompArchetype,
  { early: number; mid: number; late: number; variance: number }
> = {
  POKE: { early: 0.3, mid: 0.2, late: -0.2, variance: 0.95 },
  PICK: { early: 0.1, mid: 0.3, late: -0.1, variance: 1.15 },
  TEAMFIGHT: { early: -0.2, mid: 0.2, late: 0.5, variance: 0.9 },
  SPLITPUSH: { early: 0, mid: 0.1, late: 0.4, variance: 1.0 },
  CHEESE: { early: 1.0, mid: -0.2, late: -0.8, variance: 1.25 },
};

const PLAYSTYLE_PHASES: Record<
  Playstyle,
  { early: number; mid: number; late: number; variance: number }
> = {
  AGGRESSIVE: { early: 0.8, mid: 0.1, late: -0.6, variance: 1.2 },
  BALANCED: { early: 0, mid: 0.15, late: 0, variance: 1.0 },
  SCALING: { early: -0.7, mid: 0, late: 0.9, variance: 0.88 },
};

export function computeTacticModifiers(
  own: TeamTactics,
  opponent: TeamTactics,
): PhaseModifiers {
  const style = PLAYSTYLE_PHASES[own.playstyle];
  const arch = ARCHETYPE_PHASES[own.archetype];
  const edge = counterEdge(own.archetype, opponent.archetype);

  return {
    early: style.early + arch.early + edge,
    mid: style.mid + arch.mid + edge,
    late: style.late + arch.late + edge,
    variance: style.variance * arch.variance,
    dragonBonus: own.objective === "DRAGON" ? 1.6 : 0,
    heraldBonus: own.objective === "HERALD" ? 1.6 : 0,
    baronBonus: own.objective === "BARON" ? 1.6 : 0,
  };
}

/** Effective-attribute multiplier applied to a target-banned player. */
export const TARGET_BAN_PENALTY = 0.9;
