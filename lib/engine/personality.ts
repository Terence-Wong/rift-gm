/**
 * Player personalities: a light trait layer that visibly interacts with the
 * sim. Traits are a pure function of the player id (deterministic, no save
 * data needed — v1 saves get traits for free) and roughly half the league
 * has one. Effects run through the existing attribute/form/fatigue math.
 */

import type { Player, PlayerMatchInput } from "../types";
import { hashSeed } from "./rng";

export type Trait = "streaky" | "big-stage" | "slow-starter" | "workhorse";

export const TRAIT_INFO: Record<Trait, { label: string; blurb: string }> = {
  streaky: {
    label: "Streaky",
    blurb: "Monster games and disasters, sometimes in the same week. Plays like a player with far lower consistency.",
  },
  "big-stage": {
    label: "Big stage",
    blurb: "Grows in elimination games — a hidden clutch bonus when the season is on the line.",
  },
  "slow-starter": {
    label: "Slow starter",
    blurb: "Needs a few weeks to reach operating temperature. Expect rough form in the season's opening stretch.",
  },
  workhorse: {
    label: "Workhorse",
    blurb: "Shrugs off scrim blocks that break other players. Accumulates fatigue noticeably slower.",
  },
};

const TRAITS: Trait[] = ["streaky", "big-stage", "slow-starter", "workhorse"];

/** Deterministic trait assignment: ~half the player pool carries one. */
export function traitOf(playerId: string): Trait | null {
  const roll = hashSeed(`trait:${playerId}`) % 8;
  return roll < TRAITS.length ? TRAITS[roll] : null;
}

/** Per-match fatigue cost, trait-aware (base 9). */
export function matchFatigueCost(playerId: string): number {
  return traitOf(playerId) === "workhorse" ? 6 : 9;
}

/**
 * Apply a trait to the engine input for one match. Returns a new input;
 * never mutates the player. `week` drives the slow-starter window.
 */
export function applyTraitToInput(
  input: PlayerMatchInput,
  player: Pick<Player, "id">,
  week: number,
): PlayerMatchInput {
  const trait = traitOf(player.id);
  if (!trait) return input;
  const out: PlayerMatchInput = { ...input, attributes: { ...input.attributes } };
  switch (trait) {
    case "streaky":
      out.attributes.consistency = Math.max(1, out.attributes.consistency - 3.5);
      break;
    case "big-stage":
      out.attributes.clutch = Math.min(20, out.attributes.clutch + 2.5);
      break;
    case "slow-starter":
      if (week <= 4) out.form = Math.max(-3, out.form - 1.4);
      break;
    case "workhorse":
      out.fatigue = Math.max(0, out.fatigue - 15);
      break;
  }
  return out;
}
