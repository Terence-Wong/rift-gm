/**
 * AI opponent decision-making: tactics selection, salary demands, and the
 * free-agency bid resolution used by rival teams. Seeded and pure.
 */

import type {
  CompArchetype,
  ObjectiveFocus,
  Player,
  Playstyle,
  Role,
  Team,
  TeamContext,
  TeamTactics,
} from "../types";
import { ROLES } from "../types";
import { applyTraitToInput } from "./personality";
import { createRng, hashSeed } from "./rng";

/**
 * Build the engine input for a team from current game state. `week` feeds
 * personality traits (slow starters struggle in the opening weeks); the
 * default is past that window, so playoff/synthetic contexts are unaffected.
 */
export function buildTeamContext(
  team: Team,
  players: Record<string, Player>,
  tactics: TeamTactics,
  week = 99,
): TeamContext {
  return {
    teamId: team.id,
    name: team.shortName,
    players: ROLES.map((role) => {
      const p = players[team.starters[role]];
      return applyTraitToInput(
        {
          id: p.id,
          handle: p.handle,
          role,
          attributes: p.attributes,
          form: p.form,
          morale: p.morale,
          fatigue: p.fatigue,
        },
        p,
        week,
      );
    }),
    tactics,
  };
}

/** Rough team phase profile used by AI to pick a style. */
function teamProfile(team: Team, players: Record<string, Player>) {
  let laning = 0;
  let late = 0;
  let macro = 0;
  for (const role of ROLES) {
    const p = players[team.starters[role]];
    laning += p.attributes.laning + p.attributes.aggression * 0.4;
    late += p.attributes.teamfight + p.attributes.mechanics * 0.5;
    macro += p.attributes.macro;
  }
  return { laning, late, macro };
}

/** Deterministic AI tactics for a given match seed key. */
export function aiTactics(
  team: Team,
  opponent: Team,
  players: Record<string, Player>,
  seedKey: string,
): TeamTactics {
  const rng = createRng(hashSeed(`ai-${seedKey}-${team.id}`));
  const profile = teamProfile(team, players);

  let playstyle: Playstyle;
  if (profile.laning > profile.late + 4) playstyle = "AGGRESSIVE";
  else if (profile.late > profile.laning + 4) playstyle = "SCALING";
  else playstyle = rng.pick(["AGGRESSIVE", "BALANCED", "BALANCED", "SCALING"] as Playstyle[]);

  const objective = rng.pick(["DRAGON", "HERALD", "BARON"] as ObjectiveFocus[]);

  const archetypes: CompArchetype[] =
    playstyle === "AGGRESSIVE"
      ? ["PICK", "CHEESE", "POKE", "TEAMFIGHT"]
      : playstyle === "SCALING"
        ? ["TEAMFIGHT", "SPLITPUSH", "POKE", "PICK"]
        : ["TEAMFIGHT", "PICK", "POKE", "SPLITPUSH"];
  const archetype = rng.pick(archetypes);

  // Ban the opponent's best player most of the time.
  let targetBan: string | undefined;
  if (rng.chance(0.75)) {
    const oppStarters = ROLES.map((r) => players[opponent.starters[r]]);
    targetBan = oppStarters.reduce((top, p) => (p.ovr > top.ovr ? p : top)).id;
  }

  return { playstyle, objective, archetype, targetBan };
}

/** What a player expects per year on the open market (same units as budget). */
export function salaryDemand(player: Player): number {
  const base = 150 + Math.max(0, player.ovr - 8) ** 2 * 17;
  const ageFactor = player.age <= 21 ? 1.15 : player.age >= 28 ? 0.75 : 1;
  const potFactor = 1 + Math.max(0, player.attributes.potential - 12) * 0.02;
  return Math.round(base * ageFactor * potFactor);
}

export interface BidResolution {
  accepted: boolean;
  /** Set when a rival outbid the offer. */
  rivalTeamId?: string;
  reason: string;
}

/**
 * Resolve a free-agency bid. Generosity vs. demand sets the odds; rival
 * teams with budget room can snipe stingy offers.
 */
export function resolveBid(
  player: Player,
  offer: number,
  biddingTeamId: string,
  teams: Record<string, Team>,
  seedKey: string,
): BidResolution {
  const rng = createRng(hashSeed(`bid-${seedKey}-${player.id}`));
  const demand = salaryDemand(player);
  const generosity = offer / demand;

  const rivals = Object.values(teams).filter(
    (t) => t.id !== biddingTeamId && t.budget > demand * 1.1,
  );
  const rival = rivals.length > 0 ? rng.pick(rivals) : undefined;

  if (generosity >= 1.2) {
    return { accepted: true, reason: "The offer comfortably beat market rate." };
  }
  if (generosity >= 1.0) {
    if (rival && rng.chance(0.25)) {
      return {
        accepted: false,
        rivalTeamId: rival.id,
        reason: `${rival.name} tabled a stronger package.`,
      };
    }
    return { accepted: true, reason: "The offer met the asking price." };
  }
  if (generosity >= 0.85 && rng.chance(0.35)) {
    return { accepted: true, reason: "They took a discount to get on a roster." };
  }
  return {
    accepted: false,
    rivalTeamId: rival && rng.chance(0.5) ? rival.id : undefined,
    reason: `The offer was below the ~${demand} asking price.`,
  };
}

/** Which starter slot (if any) a team most needs to fill from free agency. */
export function neediestRole(team: Team, players: Record<string, Player>): Role | null {
  let worst: Role | null = null;
  let worstOvr = Infinity;
  for (const role of ROLES) {
    const starter = players[team.starters[role]];
    if (!starter || starter.retired) return role;
    if (starter.ovr < worstOvr) {
      worstOvr = starter.ovr;
      worst = role;
    }
  }
  return worstOvr < 10 ? worst : null;
}
