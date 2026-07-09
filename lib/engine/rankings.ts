/**
 * Weekly power rankings with analyst blurbs. Pure and seeded: score blends
 * record, streak, roster strength, and current form; blurbs are templated
 * but varied per (season, week, team) so the copy doesn't repeat verbatim.
 */

import type { Player, Team } from "../types";
import { ROLES } from "../types";
import type { StandingsRow } from "./schedule";
import { createRng, hashSeed } from "./rng";

export interface PowerRankEntry {
  teamId: string;
  rank: number;
  prevRank: number | null;
  score: number;
  blurb: string;
}

const RISER_LINES = [
  (t: string) => `${t} are playing like a different roster — the form curve is straight up.`,
  (t: string) => `Nobody wants to see ${t} on the schedule right now.`,
  (t: string) => `${t} keep winning the mid-game by 2k before anyone notices. Real climb.`,
];

const FALLER_LINES = [
  (t: string) => `${t} look tired — the map reads a step slow and the gold lines sag.`,
  (t: string) => `Something's off in ${t}'s early game; teams have found the blueprint.`,
  (t: string) => `${t} are dropping winnable games. That's a slump, not variance.`,
];

const TOP_LINES = [
  (t: string) => `${t} at the summit. The gap is real: cleaner objective setups than anyone.`,
  (t: string) => `Until someone takes a series off ${t}, this spot isn't moving.`,
  (t: string) => `${t} make good teams look ordinary. That's what #1 looks like.`,
];

const STEADY_LINES = [
  (t: string) => `${t} holding serve — solid, unspectacular, exactly on seed.`,
  (t: string) => `A quiet week for ${t}; the schedule stiffens from here.`,
  (t: string) => `${t} are what their record says they are.`,
];

/**
 * Compute this week's power rankings. `prev` (last week's board) drives the
 * movement arrows and blurb tone.
 */
export function computePowerRankings(
  teams: Record<string, Team>,
  players: Record<string, Player>,
  standings: StandingsRow[],
  prev: PowerRankEntry[] | null,
  seedKey: string,
): PowerRankEntry[] {
  const rng = createRng(hashSeed(`rank-${seedKey}`));
  const byId = new Map(standings.map((r) => [r.teamId, r]));
  const prevRankOf = new Map((prev ?? []).map((e) => [e.teamId, e.rank]));

  const scored = Object.values(teams).map((team) => {
    const row = byId.get(team.id);
    let ovr = 0;
    let form = 0;
    for (const role of ROLES) {
      const p = players[team.starters[role]];
      ovr += (p?.ovr ?? 0) / 5;
      form += (p?.form ?? 0) / 5;
    }
    const score =
      (row?.wins ?? 0) * 2 + (row?.streak ?? 0) * 0.6 + ovr * 0.8 + form * 1.5;
    return { team, score };
  });

  scored.sort((a, b) => b.score - a.score || a.team.id.localeCompare(b.team.id));

  return scored.map(({ team, score }, i) => {
    const rank = i + 1;
    const prevRank = prevRankOf.get(team.id) ?? null;
    const moved = prevRank === null ? 0 : prevRank - rank; // + = climbed
    const lines =
      rank === 1 ? TOP_LINES : moved >= 2 ? RISER_LINES : moved <= -2 ? FALLER_LINES : STEADY_LINES;
    return {
      teamId: team.id,
      rank,
      prevRank,
      score: Math.round(score * 10) / 10,
      blurb: rng.pick(lines)(team.shortName),
    };
  });
}
