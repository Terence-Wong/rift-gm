/**
 * Bundled data access. The deployed app reads only these local JSON files —
 * no runtime calls to external stat APIs. If the pipeline never ran (or
 * failed), meta.usingSampleData is true and the UI shows an honest notice.
 */

import championsJson from "@/data/champions.json";
import metaJson from "@/data/meta.json";
import playersJson from "@/data/players.json";
import teamsJson from "@/data/teams.json";
import type { ChampionInfo, DataMeta, Player, Team } from "./types";

export const DATA_META = metaJson as DataMeta;
export const CHAMPIONS = championsJson as ChampionInfo[];

const BASE_PLAYERS = playersJson as unknown as Player[];
const BASE_TEAMS = teamsJson as unknown as Team[];

export interface LeagueData {
  players: Record<string, Player>;
  teams: Record<string, Team>;
}

/** Deep-cloned league snapshot for starting a new game. */
export function freshLeague(): LeagueData {
  const players: Record<string, Player> = {};
  for (const p of BASE_PLAYERS) players[p.id] = structuredClone(p);
  const teams: Record<string, Team> = {};
  for (const t of BASE_TEAMS) teams[t.id] = structuredClone(t);
  return { players, teams };
}

export function listTeams(): Team[] {
  return BASE_TEAMS;
}

export function listPlayers(): Player[] {
  return BASE_PLAYERS;
}
