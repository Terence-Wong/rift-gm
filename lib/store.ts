/**
 * The RIFT GM game store: one Zustand store (immer + persist) holding the
 * whole game state. All simulation goes through the pure engine in
 * lib/engine; this file owns sequencing, persistence, and bookkeeping.
 */

"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { computeOvr, round1 } from "./attributes";
import { DATA_META, freshLeague } from "./data";
import { aiTactics, buildTeamContext, resolveBid, salaryDemand } from "./engine/ai";
import {
  applyMatchFatigue,
  applyOffseasonAging,
  applyResultMorale,
  applyTraining,
  applyWeeklyRecovery,
  updateFormAfterMatch,
} from "./engine/development";
import { createRng, hashSeed } from "./engine/rng";
import {
  computeStandings,
  generateDoubleRoundRobin,
  playoffSeeds,
  regularSeasonWeeks,
  type StandingsRow,
} from "./engine/schedule";
import { simulateMatch } from "./engine/simulateMatch";
import type {
  AttributeKey,
  Attributes,
  BoardState,
  Fixture,
  InboxMessage,
  MatchResult,
  Player,
  PlayoffSeries,
  Role,
  SeasonHistoryEntry,
  SeasonPhase,
  Team,
  TeamTactics,
} from "./types";
import { ROLES } from "./types";

export interface LastMatch {
  result: MatchResult;
  label: string;
  isUserMatch: boolean;
  weekFinished: boolean;
  elimination: boolean;
}

export interface OffseasonFlags {
  agingApplied: boolean;
  newsSent: boolean;
}

interface GameData {
  initialized: boolean;
  saveName: string;
  playerTeamId: string;
  season: number;
  week: number;
  phase: SeasonPhase;
  teams: Record<string, Team>;
  players: Record<string, Player>;
  fixtures: Fixture[];
  playoffs: PlayoffSeries[];
  inbox: InboxMessage[];
  scouting: Record<string, number>;
  trainingFocus: Record<string, AttributeKey>;
  scoutTargetId: string | null;
  board: BoardState;
  history: SeasonHistoryEntry[];
  baseSeed: number;
  seedCounter: number;
  usingSampleData: boolean;
  pendingTactics: TeamTactics;
  lastMatch: LastMatch | null;
  jobOffers: string[];
  freeAgents: string[];
  offseason: OffseasonFlags;
  prospectCounter: number;
  userPlayedThisWeek: boolean;
  msgCounter: number;
}

interface GameActions {
  newGame(teamId: string, saveName: string): void;
  resetGame(): void;
  setStarter(role: Role, playerId: string): void;
  setTrainingFocus(playerId: string, attr: AttributeKey): void;
  setScoutTarget(teamId: string | null): void;
  setPendingTactics(tactics: TeamTactics): void;
  playUserMatch(tactics: TeamTactics): void;
  finishWeek(): void;
  quickSimWeek(): void;
  markInboxRead(): void;
  renewContract(playerId: string, years: number): boolean;
  releasePlayer(playerId: string): void;
  bidFreeAgent(playerId: string, offer: number, years: number): void;
  startNextSeason(): void;
  acceptJobOffer(teamId: string): void;
  loadSnapshot(data: GameData): void;
  setHasHydrated(): void;
}

export type GameStore = GameData & GameActions & { _hasHydrated: boolean };
export type { GameData };

const DEFAULT_TACTICS: TeamTactics = {
  playstyle: "BALANCED",
  objective: "DRAGON",
  archetype: "TEAMFIGHT",
};

const EMPTY_BOARD: BoardState = {
  expectedFinish: 4,
  confidence: 50,
  strikes: 0,
  fired: false,
};

const ZERO_STATS = {
  games: 0,
  wins: 0,
  kills: 0,
  deaths: 0,
  assists: 0,
  cs: 0,
  damage: 0,
  mvps: 0,
  ratingSum: 0,
};

export const DATA_KEYS: (keyof GameData)[] = [
  "initialized",
  "saveName",
  "playerTeamId",
  "season",
  "week",
  "phase",
  "teams",
  "players",
  "fixtures",
  "playoffs",
  "inbox",
  "scouting",
  "trainingFocus",
  "scoutTargetId",
  "board",
  "history",
  "baseSeed",
  "seedCounter",
  "usingSampleData",
  "pendingTactics",
  "lastMatch",
  "jobOffers",
  "freeAgents",
  "offseason",
  "prospectCounter",
  "userPlayedThisWeek",
  "msgCounter",
];

const initialData: GameData = {
  initialized: false,
  saveName: "",
  playerTeamId: "",
  season: 1,
  week: 1,
  phase: "REGULAR",
  teams: {},
  players: {},
  fixtures: [],
  playoffs: [],
  inbox: [],
  scouting: {},
  trainingFocus: {},
  scoutTargetId: null,
  board: { ...EMPTY_BOARD },
  history: [],
  baseSeed: 1,
  seedCounter: 0,
  usingSampleData: DATA_META.usingSampleData,
  pendingTactics: { ...DEFAULT_TACTICS },
  lastMatch: null,
  jobOffers: [],
  freeAgents: [],
  offseason: { agingApplied: false, newsSent: false },
  prospectCounter: 0,
  userPlayedThisWeek: false,
  msgCounter: 0,
};

/* ── Pure helpers over draft state ─────────────────────────────── */

function nextSeed(s: GameData): number {
  s.seedCounter += 1;
  return hashSeed(`${s.baseSeed}:${s.seedCounter}`);
}

function post(s: GameData, title: string, body: string, tone: InboxMessage["tone"] = "info") {
  s.msgCounter += 1;
  s.inbox.unshift({
    id: `msg-${s.msgCounter}`,
    week: s.week,
    season: s.season,
    title,
    body,
    tone,
    read: false,
  });
  if (s.inbox.length > 80) s.inbox.length = 80;
}

function teamAvgOvr(team: Team, players: Record<string, Player>): number {
  let sum = 0;
  for (const role of ROLES) sum += players[team.starters[role]]?.ovr ?? 0;
  return sum / 5;
}

function preseasonRank(s: GameData, teamId: string): number {
  const ranked = Object.values(s.teams)
    .map((t) => ({ id: t.id, ovr: teamAvgOvr(t, s.players) }))
    .sort((a, b) => b.ovr - a.ovr);
  return ranked.findIndex((r) => r.id === teamId) + 1;
}

function expectationFor(rank: number, teamCount: number): number {
  if (rank <= 2) return 2;
  if (rank <= 4) return 4;
  return Math.min(teamCount, 6);
}

export function standingsOf(s: Pick<GameData, "teams" | "fixtures">): StandingsRow[] {
  return computeStandings(Object.values(s.teams), s.fixtures);
}

function applyResultToState(s: GameData, result: MatchResult, isPlayoff: boolean) {
  const winnerId = result.winner === "blue" ? result.blueTeamId : result.redTeamId;
  const loserId = result.winner === "blue" ? result.redTeamId : result.blueTeamId;
  if (!isPlayoff) {
    s.teams[winnerId].record.wins += 1;
    s.teams[loserId].record.losses += 1;
  }
  for (const [pid, line] of Object.entries(result.playerLines)) {
    const p = s.players[pid];
    if (!p) continue;
    const team = Object.values(s.teams).find((t) => t.roster.includes(pid));
    const won = team?.id === winnerId;
    p.seasonStats.games += 1;
    if (won) p.seasonStats.wins += 1;
    p.seasonStats.kills += line.k;
    p.seasonStats.deaths += line.d;
    p.seasonStats.assists += line.a;
    p.seasonStats.cs += line.cs;
    p.seasonStats.damage += line.dmg;
    p.seasonStats.ratingSum += line.rating;
    if (result.mvpPlayerId === pid) p.seasonStats.mvps += 1;
    updateFormAfterMatch(p, line.rating);
    applyMatchFatigue(p);
    applyResultMorale(p, won);
  }
}

function simFixture(s: GameData, fixture: Fixture, userTactics?: TeamTactics): MatchResult {
  const blue = s.teams[fixture.blueId];
  const red = s.teams[fixture.redId];
  const seedKey = `${s.season}-${fixture.id}`;
  const blueTactics =
    fixture.blueId === s.playerTeamId && userTactics
      ? userTactics
      : aiTactics(blue, red, s.players, seedKey);
  const redTactics =
    fixture.redId === s.playerTeamId && userTactics
      ? userTactics
      : aiTactics(red, blue, s.players, seedKey);
  const result = simulateMatch(
    buildTeamContext(blue, s.players, blueTactics),
    buildTeamContext(red, s.players, redTactics),
    nextSeed(s),
  );
  fixture.result = result;
  applyResultToState(s, result, false);
  return result;
}

function simSeriesGame(s: GameData, series: PlayoffSeries, userTactics?: TeamTactics): MatchResult {
  const gameNo = series.games.length + 1;
  const blue = s.teams[series.blueId];
  const red = s.teams[series.redId];
  const seedKey = `${s.season}-${series.id}-g${gameNo}`;
  const blueTactics =
    series.blueId === s.playerTeamId && userTactics
      ? userTactics
      : aiTactics(blue, red, s.players, seedKey);
  const redTactics =
    series.redId === s.playerTeamId && userTactics
      ? userTactics
      : aiTactics(red, blue, s.players, seedKey);
  const result = simulateMatch(
    buildTeamContext(blue, s.players, blueTactics),
    buildTeamContext(red, s.players, redTactics),
    nextSeed(s),
    { elimination: true },
  );
  series.games.push(result);
  if (result.winner === "blue") series.blueWins += 1;
  else series.redWins += 1;
  if (series.blueWins === 3) series.winnerId = series.blueId;
  if (series.redWins === 3) series.winnerId = series.redId;
  applyResultToState(s, result, true);
  return result;
}

export function userSeries(s: Pick<GameData, "playoffs" | "playerTeamId">): PlayoffSeries | null {
  return (
    s.playoffs.find(
      (series) =>
        !series.winnerId &&
        (series.blueId === s.playerTeamId || series.redId === s.playerTeamId),
    ) ?? null
  );
}

export function userFixtureThisWeek(
  s: Pick<GameData, "fixtures" | "week" | "playerTeamId" | "phase" | "playoffs">,
): Fixture | null {
  if (s.phase !== "REGULAR") return null;
  return (
    s.fixtures.find(
      (f) =>
        f.week === s.week &&
        !f.result &&
        (f.blueId === s.playerTeamId || f.redId === s.playerTeamId),
    ) ?? null
  );
}

function maybeStartPlayoffs(s: GameData) {
  const weeks = regularSeasonWeeks(Object.keys(s.teams).length);
  const allPlayed = s.fixtures.every((f) => f.result);
  if (s.week <= weeks && !allPlayed) return;
  if (s.phase !== "REGULAR") return;
  s.phase = "PLAYOFFS";
  const [s1, s2, s3, s4] = playoffSeeds(standingsOf(s));
  s.playoffs = [
    { id: "semi-1", round: "SEMI", blueId: s1, redId: s4, blueWins: 0, redWins: 0, games: [] },
    { id: "semi-2", round: "SEMI", blueId: s2, redId: s3, blueWins: 0, redWins: 0, games: [] },
  ];
  const inPlayoffs = [s1, s2, s3, s4].includes(s.playerTeamId);
  post(
    s,
    "Playoffs are set",
    inPlayoffs
      ? `You're in. Semifinals: ${s.teams[s1].shortName} vs ${s.teams[s4].shortName}, ${s.teams[s2].shortName} vs ${s.teams[s3].shortName}. Best of five — clutch players show up now.`
      : `Season over — you missed the cut. Semifinals: ${s.teams[s1].shortName} vs ${s.teams[s4].shortName}, ${s.teams[s2].shortName} vs ${s.teams[s3].shortName}.`,
    inPlayoffs ? "good" : "bad",
  );
}

function maybeAdvancePlayoffs(s: GameData) {
  const semis = s.playoffs.filter((p) => p.round === "SEMI");
  const final = s.playoffs.find((p) => p.round === "FINAL");
  if (semis.length === 2 && semis.every((x) => x.winnerId) && !final) {
    const [a, b] = semis;
    s.playoffs.push({
      id: "final",
      round: "FINAL",
      blueId: a.winnerId!,
      redId: b.winnerId!,
      blueWins: 0,
      redWins: 0,
      games: [],
    });
    post(
      s,
      "Grand final set",
      `${s.teams[a.winnerId!].name} vs ${s.teams[b.winnerId!].name}. Best of five for the title.`,
      "info",
    );
  }
  const finalNow = s.playoffs.find((p) => p.round === "FINAL");
  if (finalNow?.winnerId) concludeSeason(s, finalNow);
}

function finishLabel(s: GameData): string {
  const finalS = s.playoffs.find((p) => p.round === "FINAL");
  const semis = s.playoffs.filter((p) => p.round === "SEMI");
  if (finalS?.winnerId === s.playerTeamId) return "Champions";
  if (finalS && (finalS.blueId === s.playerTeamId || finalS.redId === s.playerTeamId))
    return "Runner-up";
  if (semis.some((x) => x.blueId === s.playerTeamId || x.redId === s.playerTeamId))
    return "Semifinalist";
  const rank = standingsOf(s).findIndex((r) => r.teamId === s.playerTeamId) + 1;
  return `${rank}th in regular season`;
}

function finishRank(s: GameData): number {
  const finalS = s.playoffs.find((p) => p.round === "FINAL");
  if (finalS?.winnerId === s.playerTeamId) return 1;
  if (finalS && (finalS.blueId === s.playerTeamId || finalS.redId === s.playerTeamId)) return 2;
  const semis = s.playoffs.filter((p) => p.round === "SEMI");
  if (semis.some((x) => x.blueId === s.playerTeamId || x.redId === s.playerTeamId)) return 3;
  return standingsOf(s).findIndex((r) => r.teamId === s.playerTeamId) + 1;
}

function seasonMvp(s: GameData): Player | null {
  let best: Player | null = null;
  let bestAvg = 0;
  for (const p of Object.values(s.players)) {
    if (p.seasonStats.games < 6) continue;
    const avg = p.seasonStats.ratingSum / p.seasonStats.games;
    if (avg > bestAvg) {
      bestAvg = avg;
      best = p;
    }
  }
  return best;
}

function concludeSeason(s: GameData, finalSeries: PlayoffSeries) {
  const championId = finalSeries.winnerId!;
  const runnerUpId =
    finalSeries.blueId === championId ? finalSeries.redId : finalSeries.blueId;
  const mvp = seasonMvp(s);
  const userTeam = s.teams[s.playerTeamId];

  s.history.push({
    season: s.season,
    champion: s.teams[championId].name,
    runnerUp: s.teams[runnerUpId].name,
    playerTeamFinish: finishLabel(s),
    playerTeamRecord: `${userTeam.record.wins}–${userTeam.record.losses}`,
    mvpHandle: mvp?.handle ?? "—",
  });

  post(
    s,
    championId === s.playerTeamId ? "YOU ARE CHAMPIONS" : `${s.teams[championId].name} take the title`,
    championId === s.playerTeamId
      ? `The nexus falls and the trophy is yours. ${mvp ? `${mvp.handle} named season MVP.` : ""}`
      : `${s.teams[championId].name} close out ${s.teams[runnerUpId].name} in the final.${mvp ? ` ${mvp.handle} named season MVP.` : ""}`,
    championId === s.playerTeamId ? "good" : "info",
  );

  // Board evaluation.
  const rank = finishRank(s);
  if (rank <= Math.min(2, s.board.expectedFinish)) {
    s.board.confidence = Math.min(100, s.board.confidence + 25);
    post(s, "Board: delighted", `A ${finishLabel(s).toLowerCase()} finish exceeds the mandate. Budget secured.`, "good");
  } else if (rank <= s.board.expectedFinish) {
    s.board.confidence = Math.min(100, s.board.confidence + 10);
    post(s, "Board: satisfied", "Expectations met. Keep building.", "good");
  } else {
    s.board.strikes += 1;
    s.board.confidence = Math.max(0, s.board.confidence - 18);
    post(
      s,
      "Board: displeased",
      `They expected top ${s.board.expectedFinish}; you finished ${rank}th. ${
        s.board.strikes >= 2 ? "Your seat is burning." : "One more season like this and it's over."
      }`,
      "bad",
    );
  }
  if (s.board.strikes >= 2 || s.board.confidence <= 5) {
    s.board.fired = true;
    const offers = Object.values(s.teams)
      .filter((t) => t.id !== s.playerTeamId)
      .sort((a, b) => teamAvgOvr(a, s.players) - teamAvgOvr(b, s.players))
      .slice(0, 2)
      .map((t) => t.id);
    s.jobOffers = offers;
    post(
      s,
      "The board has ended your tenure",
      `Results fell short two seasons running. ${offers.length} offers are on the table — or walk away.`,
      "bad",
    );
  }

  // Archive careers, decrement contracts.
  for (const p of Object.values(s.players)) {
    const team = Object.values(s.teams).find((t) => t.roster.includes(p.id));
    if (p.seasonStats.games > 0) {
      p.careerHistory.push({
        season: s.season,
        teamId: team?.id ?? "fa",
        teamName: team?.name ?? "Free agent",
        games: p.seasonStats.games,
        wins: p.seasonStats.wins,
        kda: round1(
          (p.seasonStats.kills + p.seasonStats.assists) / Math.max(1, p.seasonStats.deaths),
        ),
        avgRating: round1(p.seasonStats.ratingSum / p.seasonStats.games),
        mvps: p.seasonStats.mvps,
        ovrAtEnd: p.ovr,
        finish: team?.id === championId ? "Champion" : "",
      });
    }
    if (team) p.contract.years = Math.max(0, p.contract.years - 1);
  }

  s.phase = "OFFSEASON";
  s.offseason = { agingApplied: false, newsSent: false };
  applyOffseason(s);
}

function applyOffseason(s: GameData) {
  if (s.offseason.agingApplied) return;
  s.offseason.agingApplied = true;
  const rng = createRng(nextSeed(s));
  const retirees: string[] = [];

  for (const p of Object.values(s.players)) {
    if (p.retired) continue;
    const { retired } = applyOffseasonAging(p, rng);
    if (retired) {
      p.retired = true;
      retirees.push(p.handle);
      for (const t of Object.values(s.teams)) {
        t.roster = t.roster.filter((id) => id !== p.id);
        for (const role of ROLES) {
          if (t.starters[role] === p.id) t.starters[role] = "";
        }
      }
      s.freeAgents = s.freeAgents.filter((id) => id !== p.id);
    }
  }
  if (retirees.length > 0) {
    post(s, "Retirements", `Hanging it up this offseason: ${retirees.join(", ")}.`, "info");
  }

  // Fresh prospect intake keeps the market alive.
  const intake = generateProspects(s, 6);
  s.freeAgents.push(...intake.map((p) => p.id));
  post(
    s,
    "Free agency opens",
    `${s.freeAgents.length} players on the market, including ${intake.length} new trainee prospects. Expiring contracts must be renewed or those players walk.`,
    "info",
  );
}

const PROSPECT_POOL = [
  "Haru", "Bitmap", "Cricket", "Dawnfall", "Ember", "Fjord", "Glacier", "Halcyon",
  "Ion", "Juniper", "Kestrel", "Lumen", "Mistral", "Nadir", "Onyx", "Pylon",
  "Quartz", "Riptide", "Sable", "Tundra", "Umbra", "Vantage", "Wisp", "Zephyr",
];

function generateProspects(s: GameData, count: number): Player[] {
  const rng = createRng(nextSeed(s));
  const created: Player[] = [];
  for (let i = 0; i < count; i++) {
    s.prospectCounter += 1;
    const handle = `${PROSPECT_POOL[rng.int(0, PROSPECT_POOL.length - 1)]}${s.prospectCounter}`;
    const role = ROLES[rng.int(0, 4)];
    const base = () => round1(7 + rng.next() * 6);
    const attributes: Attributes = {
      laning: base(),
      mechanics: base(),
      macro: base(),
      teamfight: base(),
      aggression: base(),
      consistency: round1(7 + rng.next() * 5),
      clutch: round1(7 + rng.next() * 5),
      potential: round1(11 + rng.next() * 8),
    };
    const player: Player = {
      id: `fa-s${s.season}-${s.prospectCounter}`,
      handle,
      role,
      age: 17 + rng.int(0, 2),
      nationality: "KR",
      attributes,
      provenance: {
        laning: "modeled",
        mechanics: "modeled",
        macro: "modeled",
        teamfight: "modeled",
        aggression: "modeled",
        consistency: "modeled",
        clutch: "modeled",
        potential: "modeled",
      },
      ovr: computeOvr(role, attributes),
      form: 0,
      morale: 60,
      fatigue: 0,
      contract: { years: 0, salary: 120 + rng.int(0, 120) },
      seasonStats: { ...ZERO_STATS },
      careerHistory: [],
    };
    s.players[player.id] = player;
    created.push(player);
  }
  return created;
}

function aiFillRosters(s: GameData) {
  const rng = createRng(nextSeed(s));
  for (const team of Object.values(s.teams)) {
    if (team.id === s.playerTeamId) continue;
    // Renew expiring contracts for AI teams (they keep cores together).
    for (const pid of team.roster) {
      const p = s.players[pid];
      if (p && !p.retired && p.contract.years === 0) {
        if (rng.chance(0.8)) {
          p.contract = { years: 1 + rng.int(0, 1), salary: salaryDemand(p) };
        } else {
          team.roster = team.roster.filter((id) => id !== pid);
          for (const role of ROLES) if (team.starters[role] === pid) team.starters[role] = "";
          s.freeAgents.push(pid);
          post(s, "Transfer news", `${p.handle} leaves ${team.name} as contract talks collapse.`, "info");
        }
      }
    }
    // Fill any empty starter slots from free agency, best OVR first.
    for (const role of ROLES) {
      if (team.starters[role] && !s.players[team.starters[role]]?.retired) continue;
      const candidates = s.freeAgents
        .map((id) => s.players[id])
        .filter((p) => p && !p.retired && p.role === role)
        .sort((a, b) => b.ovr - a.ovr);
      const pick = candidates[0];
      if (pick) {
        s.freeAgents = s.freeAgents.filter((id) => id !== pick.id);
        team.roster.push(pick.id);
        team.starters[role] = pick.id;
        pick.contract = { years: 1 + rng.int(0, 2), salary: salaryDemand(pick) };
        post(s, "Transfer news", `${team.name} sign ${pick.handle} (${role}) from free agency.`, "info");
      }
    }
  }
}

/* ── Store ─────────────────────────────────────────────────────── */

export const useGameStore = create<GameStore>()(
  persist(
    immer((set, get) => ({
      ...initialData,
      _hasHydrated: false,

      newGame(teamId, saveName) {
        const league = freshLeague();
        const rostered = new Set(Object.values(league.teams).flatMap((t) => t.roster));
        const freeAgents = Object.keys(league.players).filter((id) => !rostered.has(id));
        set((s) => {
          Object.assign(s, structuredClone(initialData));
          s.initialized = true;
          s.saveName = saveName || "Head Coach";
          s.playerTeamId = teamId;
          s.teams = league.teams;
          s.players = league.players;
          s.freeAgents = freeAgents;
          s.baseSeed = hashSeed(`${saveName}-${teamId}-${Date.now()}`);
          s.fixtures = generateDoubleRoundRobin(Object.keys(league.teams));
          s.scouting = { [teamId]: 5 };
          const rank = preseasonRank(s, teamId);
          s.board = {
            expectedFinish: expectationFor(rank, Object.keys(league.teams).length),
            confidence: 50,
            strikes: 0,
            fired: false,
          };
          const firstFx = userFixtureThisWeek(s);
          const opp = firstFx
            ? s.teams[firstFx.blueId === teamId ? firstFx.redId : firstFx.blueId]
            : null;
          post(
            s,
            `Welcome to ${s.teams[teamId].name}`,
            `Preseason rank #${rank}. The board expects a top-${s.board.expectedFinish} finish.${
              opp ? ` Your first game is week 1 against ${opp.name}.` : ""
            }`,
            "info",
          );
        });
      },

      resetGame() {
        set((s) => {
          Object.assign(s, structuredClone(initialData));
        });
      },

      setStarter(role, playerId) {
        set((s) => {
          const team = s.teams[s.playerTeamId];
          const player = s.players[playerId];
          if (!team || !player || player.role !== role || !team.roster.includes(playerId)) return;
          team.starters[role] = playerId;
        });
      },

      setTrainingFocus(playerId, attr) {
        set((s) => {
          s.trainingFocus[playerId] = attr;
        });
      },

      setScoutTarget(teamId) {
        set((s) => {
          s.scoutTargetId = teamId;
        });
      },

      setPendingTactics(tactics) {
        set((s) => {
          s.pendingTactics = tactics;
        });
      },

      playUserMatch(tactics) {
        set((s) => {
          s.pendingTactics = tactics;
          if (s.phase === "REGULAR") {
            const fixture = userFixtureThisWeek(s);
            if (!fixture) return;
            const result = simFixture(s, fixture, tactics);
            const opp =
              fixture.blueId === s.playerTeamId ? s.teams[fixture.redId] : s.teams[fixture.blueId];
            s.lastMatch = {
              result,
              label: `Week ${s.week} · vs ${opp.shortName}`,
              isUserMatch: true,
              weekFinished: false,
              elimination: false,
            };
            const oppId = fixture.blueId === s.playerTeamId ? fixture.redId : fixture.blueId;
            s.scouting[oppId] = Math.min(5, (s.scouting[oppId] ?? 0) + 1);
            s.userPlayedThisWeek = true;
          } else if (s.phase === "PLAYOFFS") {
            const series = userSeries(s);
            if (!series) return;
            const result = simSeriesGame(s, series, tactics);
            const oppId = series.blueId === s.playerTeamId ? series.redId : series.blueId;
            s.lastMatch = {
              result,
              label: `${series.round === "FINAL" ? "Grand Final" : "Semifinal"} · Game ${series.games.length} · vs ${s.teams[oppId].shortName}`,
              isUserMatch: true,
              weekFinished: false,
              elimination: true,
            };
            s.scouting[oppId] = Math.min(5, (s.scouting[oppId] ?? 0) + 1);
            s.userPlayedThisWeek = true;
          }
        });
      },

      finishWeek() {
        set((s) => {
          if (s.phase === "REGULAR") {
            // User match must be done (or absent). Sim the rest of the week.
            const pending = userFixtureThisWeek(s);
            if (pending) simFixture(s, pending, s.pendingTactics);
            for (const f of s.fixtures.filter((x) => x.week === s.week && !x.result)) {
              simFixture(s, f);
            }
            weeklyUpkeep(s);
            s.week += 1;
            maybeStartPlayoffs(s);
          } else if (s.phase === "PLAYOFFS") {
            const mine = userSeries(s);
            if (mine && !s.userPlayedThisWeek) {
              // User hasn't played this round; sim their game to keep pace.
              simSeriesGame(s, mine, s.pendingTactics);
            }
            for (const series of s.playoffs.filter((x) => !x.winnerId)) {
              const isUsers =
                series.blueId === s.playerTeamId || series.redId === s.playerTeamId;
              if (!isUsers) simSeriesGame(s, series);
            }
            weeklyUpkeep(s);
            s.week += 1;
            maybeAdvancePlayoffs(s);
          }
          if (s.lastMatch) s.lastMatch.weekFinished = true;
          s.userPlayedThisWeek = false;
        });
      },

      quickSimWeek() {
        const state = get();
        if (state.phase === "REGULAR") {
          const fx = userFixtureThisWeek(state);
          if (fx) get().playUserMatch(state.pendingTactics);
        } else if (state.phase === "PLAYOFFS") {
          const series = userSeries(state);
          if (series) get().playUserMatch(state.pendingTactics);
        }
        get().finishWeek();
      },

      markInboxRead() {
        set((s) => {
          for (const m of s.inbox) m.read = true;
        });
      },

      renewContract(playerId, years) {
        let ok = false;
        set((s) => {
          const p = s.players[playerId];
          const team = s.teams[s.playerTeamId];
          if (!p || !team.roster.includes(playerId)) return;
          const demand = salaryDemand(p);
          const payroll = team.roster.reduce(
            (sum, id) => sum + (s.players[id]?.contract.salary ?? 0),
            0,
          );
          if (payroll - p.contract.salary + demand > team.budget) {
            post(s, "Renewal blocked", `${p.handle} wants ${demand} — that busts the ${team.budget} budget.`, "bad");
            return;
          }
          p.contract = { years, salary: demand };
          p.morale = Math.min(100, p.morale + 8);
          post(s, "Contract renewed", `${p.handle} re-signs for ${years} year${years > 1 ? "s" : ""} at ${demand}/yr.`, "good");
          ok = true;
        });
        return ok;
      },

      releasePlayer(playerId) {
        set((s) => {
          const team = s.teams[s.playerTeamId];
          const p = s.players[playerId];
          if (!p || !team.roster.includes(playerId)) return;
          const isStarter = ROLES.some((r) => team.starters[r] === playerId);
          const replacements = team.roster.filter(
            (id) => id !== playerId && s.players[id]?.role === p.role,
          );
          if (isStarter && replacements.length === 0 && s.phase !== "OFFSEASON") {
            post(s, "Release blocked", `${p.handle} is your only ${p.role}. Sign a replacement first.`, "bad");
            return;
          }
          team.roster = team.roster.filter((id) => id !== playerId);
          for (const role of ROLES) {
            if (team.starters[role] === playerId) team.starters[role] = replacements[0] ?? "";
          }
          s.freeAgents.push(playerId);
          p.contract.years = 0;
          post(s, "Player released", `${p.handle} hits free agency.`, "info");
        });
      },

      bidFreeAgent(playerId, offer, years) {
        set((s) => {
          const p = s.players[playerId];
          const team = s.teams[s.playerTeamId];
          if (!p || !s.freeAgents.includes(playerId) || p.retired) return;
          const payroll = team.roster.reduce(
            (sum, id) => sum + (s.players[id]?.contract.salary ?? 0),
            0,
          );
          if (payroll + offer > team.budget) {
            post(s, "Bid blocked", `That offer busts your budget (${payroll} + ${offer} > ${team.budget}).`, "bad");
            return;
          }
          const resolution = resolveBid(
            p,
            offer,
            s.playerTeamId,
            s.teams,
            `${s.season}-${s.seedCounter}`,
          );
          s.seedCounter += 1;
          if (resolution.accepted) {
            s.freeAgents = s.freeAgents.filter((id) => id !== playerId);
            team.roster.push(playerId);
            p.contract = { years, salary: offer };
            if (!team.starters[p.role] || !s.players[team.starters[p.role]]) {
              team.starters[p.role] = playerId;
            }
            post(s, "Signing complete", `${p.handle} (${p.role}) joins for ${offer}/yr × ${years}. ${resolution.reason}`, "good");
          } else if (resolution.rivalTeamId) {
            const rival = s.teams[resolution.rivalTeamId];
            s.freeAgents = s.freeAgents.filter((id) => id !== playerId);
            rival.roster.push(playerId);
            p.contract = { years: 1, salary: salaryDemand(p) };
            const emptyRole = !rival.starters[p.role] || !s.players[rival.starters[p.role]];
            if (emptyRole) rival.starters[p.role] = playerId;
            post(s, "Outbid", `${p.handle} signs with ${rival.name} instead. ${resolution.reason}`, "bad");
          } else {
            post(s, "Bid rejected", `${p.handle} turned it down. ${resolution.reason}`, "bad");
          }
        });
      },

      startNextSeason() {
        set((s) => {
          if (s.phase !== "OFFSEASON" || s.board.fired) return;
          // Unrenewed expiring players on the user team walk.
          const team = s.teams[s.playerTeamId];
          for (const pid of [...team.roster]) {
            const p = s.players[pid];
            if (p && p.contract.years === 0) {
              team.roster = team.roster.filter((id) => id !== pid);
              for (const role of ROLES) if (team.starters[role] === pid) team.starters[role] = "";
              s.freeAgents.push(pid);
              post(s, "Contract expired", `${p.handle} walks in free agency.`, "bad");
            }
          }
          aiFillRosters(s);
          // The user must field five starters; auto-fill from cheapest FAs if not.
          for (const role of ROLES) {
            if (team.starters[role] && s.players[team.starters[role]]) continue;
            const fromRoster = team.roster.find((id) => s.players[id]?.role === role);
            if (fromRoster) {
              team.starters[role] = fromRoster;
              continue;
            }
            const cheapest = s.freeAgents
              .map((id) => s.players[id])
              .filter((p) => p && !p.retired && p.role === role)
              .sort((a, b) => salaryDemand(a) - salaryDemand(b))[0];
            if (cheapest) {
              s.freeAgents = s.freeAgents.filter((id) => id !== cheapest.id);
              team.roster.push(cheapest.id);
              team.starters[role] = cheapest.id;
              cheapest.contract = { years: 1, salary: salaryDemand(cheapest) };
              post(s, "Emergency signing", `${cheapest.handle} fills the empty ${role} slot.`, "info");
            }
          }

          s.season += 1;
          s.week = 1;
          s.phase = "REGULAR";
          s.playoffs = [];
          s.fixtures = generateDoubleRoundRobin(Object.keys(s.teams));
          s.lastMatch = null;
          for (const t of Object.values(s.teams)) t.record = { wins: 0, losses: 0 };
          for (const p of Object.values(s.players)) {
            p.seasonStats = { ...ZERO_STATS };
            p.fatigue = 0;
            p.form = 0;
          }
          for (const key of Object.keys(s.scouting)) {
            if (key !== s.playerTeamId) s.scouting[key] = Math.max(0, s.scouting[key] - 3);
          }
          const rank = preseasonRank(s, s.playerTeamId);
          s.board.expectedFinish = expectationFor(rank, Object.keys(s.teams).length);
          post(
            s,
            `Season ${s.season} begins`,
            `Preseason rank #${rank}. The board expects top ${s.board.expectedFinish}. Confidence: ${s.board.confidence}/100.`,
            "info",
          );
        });
      },

      acceptJobOffer(teamId) {
        set((s) => {
          if (!s.board.fired || !s.jobOffers.includes(teamId)) return;
          const old = s.teams[s.playerTeamId].name;
          s.playerTeamId = teamId;
          s.board = { ...EMPTY_BOARD, confidence: 40 };
          s.jobOffers = [];
          s.scouting[teamId] = 5;
          const rank = preseasonRank(s, teamId);
          s.board.expectedFinish = expectationFor(rank, Object.keys(s.teams).length);
          post(
            s,
            `A new chapter at ${s.teams[teamId].name}`,
            `You leave ${old} behind. The ${s.teams[teamId].name} board expects top ${s.board.expectedFinish}.`,
            "info",
          );
        });
      },

      loadSnapshot(data) {
        set((s) => {
          Object.assign(s, structuredClone(initialData), structuredClone(data));
        });
      },

      setHasHydrated() {
        set((s) => {
          s._hasHydrated = true;
        });
      },
    })),
    {
      name: "riftgm-active",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            },
      ),
      partialize: (state) =>
        Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]])) as unknown as GameStore,
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated?.();
      },
    },
  ),
);

/** Weekly training, recovery, scouting, and board-confidence upkeep. */
function weeklyUpkeep(s: GameData) {
  const rng = createRng(nextSeed(s));
  const userTeam = s.teams[s.playerTeamId];

  // Training: user-team players use assigned focus, AI players train weakest.
  for (const team of Object.values(s.teams)) {
    for (const pid of team.roster) {
      const p = s.players[pid];
      if (!p || p.retired) continue;
      let focus = s.trainingFocus[pid];
      if (team.id !== s.playerTeamId || !focus) {
        const visible: AttributeKey[] = ["laning", "mechanics", "macro", "teamfight"];
        focus = visible.reduce((worst, k) =>
          p.attributes[k] < p.attributes[worst] ? k : worst,
        );
      }
      applyTraining(p, focus, rng);
      const isStarter = ROLES.some((r) => team.starters[r] === pid);
      applyWeeklyRecovery(p, !isStarter);
    }
  }

  // Scouting target gains a level.
  if (s.scoutTargetId && s.scoutTargetId !== s.playerTeamId) {
    s.scouting[s.scoutTargetId] = Math.min(5, (s.scouting[s.scoutTargetId] ?? 0) + 1);
  }

  // Board confidence drifts toward a target set by position vs expectation.
  // Slow drift: one rough season stings but doesn't fire you on its own.
  const standings = standingsOf(s);
  const rank = standings.findIndex((r) => r.teamId === s.playerTeamId) + 1;
  if (rank > 0) {
    const gap = rank - s.board.expectedFinish;
    const target = gap <= 0 ? 78 : gap <= 2 ? 42 : 25;
    s.board.confidence = Math.round(
      Math.max(0, Math.min(100, s.board.confidence + (target - s.board.confidence) * 0.12)),
    );
  }

  // Weekly results digest for the user's match.
  const userFx = s.fixtures.find(
    (f) =>
      f.week === s.week &&
      f.result &&
      (f.blueId === s.playerTeamId || f.redId === s.playerTeamId),
  );
  if (userFx?.result) {
    const won =
      (userFx.result.winner === "blue" ? userFx.blueId : userFx.redId) === s.playerTeamId;
    const opp = s.teams[userFx.blueId === s.playerTeamId ? userFx.redId : userFx.blueId];
    const mvp = s.players[userFx.result.mvpPlayerId];
    const throwEvent = userFx.result.events.find((e) => e.type === "THROW");
    post(
      s,
      won ? `Win over ${opp.shortName}` : `Loss to ${opp.shortName}`,
      won
        ? `Closed it in ${userFx.result.durationMin} minutes. ${mvp?.handle ?? "—"} took MVP. ${userTeam.record.wins}–${userTeam.record.losses} on the season.`
        : throwEvent
          ? `Dropped it on a ${throwEvent.minute}-minute throw. ${mvp?.handle ?? "—"} still topped the server. ${userTeam.record.wins}–${userTeam.record.losses}.`
          : `${opp.shortName} were sharper at ${userFx.result.durationMin} minutes. ${userTeam.record.wins}–${userTeam.record.losses}.`,
      won ? "good" : "bad",
    );
  }
}
