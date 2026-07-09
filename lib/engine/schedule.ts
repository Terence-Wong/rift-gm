/**
 * Season scheduling: double round-robin via the circle method, plus
 * playoff seeding helpers. Pure functions — no store access.
 */

import type { Fixture, Team } from "../types";

/**
 * Double round-robin. For n teams (n even) this yields 2·(n−1) weeks of
 * n/2 fixtures. Sides swap in the second leg.
 */
export function generateDoubleRoundRobin(teamIds: string[]): Fixture[] {
  const ids = [...teamIds];
  if (ids.length % 2 !== 0) ids.push("__BYE__");
  const n = ids.length;
  const rounds = n - 1;
  const fixtures: Fixture[] = [];
  let counter = 0;

  const rotation = [...ids];
  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = rotation[i];
      const bTeam = rotation[n - 1 - i];
      if (a === "__BYE__" || bTeam === "__BYE__") continue;
      // Alternate home side so nobody plays one side all split.
      const [blue, red] = (round + i) % 2 === 0 ? [a, bTeam] : [bTeam, a];
      fixtures.push({ id: `fx-${counter++}`, week: round + 1, blueId: blue, redId: red });
      fixtures.push({
        id: `fx-${counter++}`,
        week: round + 1 + rounds,
        blueId: red,
        redId: blue,
      });
    }
    // Rotate all but the first element.
    rotation.splice(1, 0, rotation.pop() as string);
  }

  return fixtures.sort((x, y) => x.week - y.week);
}

export function regularSeasonWeeks(teamCount: number): number {
  const n = teamCount % 2 === 0 ? teamCount : teamCount + 1;
  return 2 * (n - 1);
}

export interface StandingsRow {
  teamId: string;
  wins: number;
  losses: number;
  /** Head-to-head wins keyed by opponent, for tiebreaks. */
  streak: number;
}

/** Standings sorted by wins, then head-to-head, then game-time luck (stable). */
export function computeStandings(teams: Team[], fixtures: Fixture[]): StandingsRow[] {
  const rows = new Map<string, StandingsRow>();
  for (const t of teams) rows.set(t.id, { teamId: t.id, wins: 0, losses: 0, streak: 0 });

  const h2h = new Map<string, number>();
  const played = fixtures
    .filter((f) => f.result)
    .sort((a, b) => a.week - b.week);

  for (const f of played) {
    const winnerId = f.result!.winner === "blue" ? f.blueId : f.redId;
    const loserId = f.result!.winner === "blue" ? f.redId : f.blueId;
    const w = rows.get(winnerId);
    const l = rows.get(loserId);
    if (w) {
      w.wins++;
      w.streak = w.streak >= 0 ? w.streak + 1 : 1;
    }
    if (l) {
      l.losses++;
      l.streak = l.streak <= 0 ? l.streak - 1 : -1;
    }
    h2h.set(`${winnerId}|${loserId}`, (h2h.get(`${winnerId}|${loserId}`) ?? 0) + 1);
  }

  return [...rows.values()].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const aOverB = h2h.get(`${a.teamId}|${b.teamId}`) ?? 0;
    const bOverA = h2h.get(`${b.teamId}|${a.teamId}`) ?? 0;
    if (aOverB !== bOverA) return bOverA - aOverB;
    return a.teamId.localeCompare(b.teamId);
  });
}

/** Top-4 seeding: 1v4 and 2v3 semifinals. */
export function playoffSeeds(standings: StandingsRow[]): [string, string, string, string] {
  const top = standings.slice(0, 4).map((r) => r.teamId);
  return [top[0], top[1], top[2], top[3]];
}
