/**
 * The RIFT GM game store: one Zustand store (immer + persist) holding the
 * whole game state. All simulation goes through the pure engine in
 * lib/engine; this file owns sequencing, persistence, and bookkeeping.
 */

"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";
import { round1 } from "./attributes";
import { DATA_META, freshLeague, listPlayers } from "./data";
import { aiTactics, buildTeamContext, neediestRole, resolveBid, salaryDemand } from "./engine/ai";
import {
  applyMatchFatigue,
  applyOffseasonAging,
  applyResultMorale,
  applyTraining,
  applyWeeklyRecovery,
  updateFormAfterMatch,
} from "./engine/development";
import { generateLeague, generatePlayer } from "./engine/generate";
import { matchFatigueCost } from "./engine/personality";
import { computePowerRankings, type PowerRankEntry } from "./engine/rankings";
import { createRng, hashSeed } from "./engine/rng";
import {
  computeStandings,
  generateDoubleRoundRobin,
  playoffSeeds,
  regularSeasonWeeks,
  type StandingsRow,
} from "./engine/schedule";
import { simulateMatch } from "./engine/simulateMatch";
import { simulateSpatialMatch, type SpatialInputs } from "./engine/spatial";
import {
  advanceTutorial,
  TUTORIAL_STEP_INFO,
  type TutorialEvent,
  type TutorialStep,
} from "./tutorial";
import type {
  AttributeKey,
  BoardState,
  Fixture,
  InboxMessage,
  MatchOptions,
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

/** Save schema version — bump alongside migrateSave. */
export const SAVE_VERSION = 3;

export interface TrainingRecapEntry {
  playerId: string;
  handle: string;
  attr: AttributeKey;
  delta: number;
}

/** Last week's training gains for the user's roster — the visible artifact. */
export interface TrainingRecap {
  season: number;
  week: number;
  entries: TrainingRecapEntry[];
}

/** The annual Academy Showcase: hyped in advance, revealed on the day. */
export interface IntakeState {
  /** 1–5 class strength, seeded at season start so the preview is honest. */
  quality: number;
  previewWeek: number;
  revealWeek: number;
  previewSent: boolean;
  done: boolean;
}

export interface DevEvent {
  week: number;
  playerId: string;
  kind: "breakout" | "slump";
  fired: boolean;
}

export interface LastMatch {
  result: MatchResult;
  label: string;
  isUserMatch: boolean;
  weekFinished: boolean;
  elimination: boolean;
  /** Inputs to regenerate the spatial log deterministically (watched games only). */
  spatial?: SpatialInputs | null;
  /** Both drafts, so the post-match can attribute your prep decisions. */
  userTactics?: TeamTactics;
  oppTactics?: TeamTactics;
}

export interface OffseasonFlags {
  agingApplied: boolean;
  newsSent: boolean;
}

export type DataMode = "real" | "fictional";

export type Difficulty = "relaxed" | "standard" | "brutal";

export const DIFFICULTY_INFO: Record<
  Difficulty,
  { label: string; blurb: string; budgetMult: number; strikeLimit: number; confidenceFloor: number }
> = {
  relaxed: {
    label: "Relaxed",
    blurb: "Patient board, deeper pockets. Three bad seasons before the axe.",
    budgetMult: 1.15,
    strikeLimit: 3,
    confidenceFloor: 2,
  },
  standard: {
    label: "Standard",
    blurb: "The intended experience. Two strikes and you're out.",
    budgetMult: 1,
    strikeLimit: 2,
    confidenceFloor: 5,
  },
  brutal: {
    label: "Brutal",
    blurb: "Tight budget, itchy trigger finger. Miss the mandate once at low confidence and you're gone.",
    budgetMult: 0.88,
    strikeLimit: 2,
    confidenceFloor: 15,
  },
};

export type RosterMode = "draft" | "academy";

export interface CreateTeamConfig {
  name: string;
  /** 2–5 characters. */
  tag: string;
  region: string;
  primaryColor: string;
  secondaryColor: string;
  rosterMode: RosterMode;
}

export interface ExpansionDraftState {
  /** Free agents eligible to be drafted. */
  poolIds: string[];
  /** Salary cap across all drafted contracts. */
  cap: number;
  pickedIds: string[];
}

/** Created teams take this id; it never collides with data/generated ids. */
export const CUSTOM_TEAM_ID = "usr";

export interface NewGameOptions {
  saveName: string;
  /** Real rosters (derived data) or a fully generated fictional world. Never mixed. */
  dataMode: DataMode;
  /** Fictional mode only: the shareable world seed. */
  worldSeed?: number;
  /** Take over an existing team by id… */
  teamId?: string;
  /** …or found a brand-new franchise (replaces the weakest team). */
  createTeam?: CreateTeamConfig;
  difficulty?: Difficulty;
  /** Run the "first week as head coach" onboarding for this save. */
  tutorial?: boolean;
}

interface GameData {
  /** Save schema version — bump alongside migrateSave. */
  saveVersion: number;
  initialized: boolean;
  saveName: string;
  dataMode: DataMode;
  /** Set (and shareable) in fictional mode; null for real-data saves. */
  worldSeed: number | null;
  difficulty: Difficulty;
  /** Pending expansion draft for a created team; null once complete. */
  expansionDraft: ExpansionDraftState | null;
  /** "First week as head coach" onboarding state (machine lives in lib/tutorial.ts). */
  tutorial: { active: boolean; step: string };
  /** This week's power rankings board (with movement vs. last week). */
  powerRankings: PowerRankEntry[];
  /** Playoff-meeting counts per team pair ("idA|idB", ids sorted). */
  rivalries: Record<string, number>;
  /** Last advance's training gains (dashboard recap panel). */
  trainingRecap: TrainingRecap | null;
  intake: IntakeState;
  /** Seeded per season for the user's roster: breakouts and slumps. */
  devEvents: DevEvent[];
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
  newGame(opts: NewGameOptions): void;
  draftPick(playerId: string): void;
  undraftPick(playerId: string): void;
  finishDraft(): boolean;
  tutorialEvent(event: TutorialEvent): void;
  skipTutorial(): void;
  startTutorial(): void;
  resetGame(): void;
  setStarter(role: Role, playerId: string): void;
  setTrainingFocus(playerId: string, attr: AttributeKey): void;
  setScoutTarget(teamId: string | null): void;
  setPendingTactics(tactics: TeamTactics): void;
  playUserMatch(tactics: TeamTactics, watch?: boolean): void;
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
  "saveVersion",
  "initialized",
  "saveName",
  "dataMode",
  "worldSeed",
  "difficulty",
  "expansionDraft",
  "tutorial",
  "powerRankings",
  "rivalries",
  "trainingRecap",
  "intake",
  "devEvents",
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
  saveVersion: SAVE_VERSION,
  initialized: false,
  saveName: "",
  dataMode: "real",
  worldSeed: null,
  difficulty: "standard",
  expansionDraft: null,
  tutorial: { active: false, step: "SQUAD" },
  powerRankings: [],
  rivalries: {},
  trainingRecap: null,
  intake: { quality: 3, previewWeek: 5, revealWeek: 8, previewSent: false, done: false },
  devEvents: [],
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

/* ── Save-schema migration ─────────────────────────────────────── */

/**
 * Migrate a loaded save to the current schema. v1 saves (no saveVersion)
 * become Real-mode, standard-difficulty saves with no created team and the
 * tutorial marked complete. Idempotent; unknown newer versions pass through.
 */
export function migrateSave(data: Partial<GameData>): Partial<GameData> {
  const d = { ...data };
  if ((d.saveVersion ?? 1) < 2) {
    d.dataMode = d.dataMode ?? "real";
    d.worldSeed = d.worldSeed ?? null;
    d.difficulty = d.difficulty ?? "standard";
    d.expansionDraft = d.expansionDraft ?? null;
    d.tutorial = d.tutorial ?? { active: false, step: "DONE" };
    d.powerRankings = d.powerRankings ?? [];
    d.rivalries = d.rivalries ?? {};
  }
  if ((d.saveVersion ?? 1) < 3) {
    d.trainingRecap = d.trainingRecap ?? null;
    d.devEvents = d.devEvents ?? [];
    // Pre-v3 saves skip the current season's showcase; next season reseeds.
    d.intake = d.intake ?? {
      quality: 3,
      previewWeek: 5,
      revealWeek: 8,
      previewSent: true,
      done: true,
    };
  }
  if ((d.saveVersion ?? 1) < SAVE_VERSION) d.saveVersion = SAVE_VERSION;
  return d;
}

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

/** Sorted pair key for the rivalry map. */
function rivalKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Extra match variance from rivalry intensity (playoff-history driven). */
function rivalryBoost(s: GameData, a: string, b: string): number {
  const level = s.rivalries[rivalKey(a, b)] ?? 0;
  return 1 + 0.05 * Math.min(4, level);
}

/** Advance the tutorial machine inside a draft; posts the next coach memo. */
function tutorialAdvanceIn(s: GameData, event: TutorialEvent) {
  const before = s.tutorial.step;
  const next = advanceTutorial(s.tutorial, event);
  if (next.step !== before) {
    s.tutorial = next;
    const info = TUTORIAL_STEP_INFO[next.step as TutorialStep];
    if (info) post(s, info.memoTitle, info.memoBody, "info");
  }
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

/**
 * Board mandate scales to roster strength (preseason rank), not league
 * average — a bottom-of-the-table project (e.g. an academy start) is judged
 * as one, so a created team isn't an instant firing.
 */
function expectationFor(rank: number, teamCount: number): number {
  if (rank <= 2) return 2;
  if (rank <= 4) return 4;
  if (rank <= 6) return Math.min(teamCount, 6);
  return Math.min(teamCount, 8);
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
    applyMatchFatigue(p, matchFatigueCost(p.id));
    applyResultMorale(p, won);
  }
}

interface SimOut {
  result: MatchResult;
  spatial: SpatialInputs | null;
  blueTactics?: TeamTactics;
  redTactics?: TeamTactics;
}

/**
 * Sim one game. `watch` runs the full spatial engine (KDA from the map) and
 * captures the inputs so the viewer can regenerate the position log; quick
 * sims skip spatial generation entirely and use fast sampled attribution.
 */
function simGame(
  blueCtx: ReturnType<typeof buildTeamContext>,
  redCtx: ReturnType<typeof buildTeamContext>,
  seed: number,
  options: MatchOptions,
  watch: boolean,
): SimOut {
  if (watch) {
    const { result } = simulateSpatialMatch(blueCtx, redCtx, seed, options);
    return {
      result,
      spatial: {
        blue: blueCtx,
        red: redCtx,
        seed,
        elimination: options.elimination ?? false,
        varianceBoost: options.varianceBoost,
      },
    };
  }
  return { result: simulateMatch(blueCtx, redCtx, seed, options), spatial: null };
}

function simFixture(
  s: GameData,
  fixture: Fixture,
  userTactics?: TeamTactics,
  watch = false,
): SimOut {
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
  const out = simGame(
    buildTeamContext(blue, s.players, blueTactics, s.week),
    buildTeamContext(red, s.players, redTactics, s.week),
    nextSeed(s),
    { varianceBoost: rivalryBoost(s, blue.id, red.id) },
    watch,
  );
  out.blueTactics = blueTactics;
  out.redTactics = redTactics;
  fixture.result = out.result;
  applyResultToState(s, out.result, false);
  return out;
}

function simSeriesGame(
  s: GameData,
  series: PlayoffSeries,
  userTactics?: TeamTactics,
  watch = false,
): SimOut {
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
  const { result, spatial } = simGame(
    buildTeamContext(blue, s.players, blueTactics),
    buildTeamContext(red, s.players, redTactics),
    nextSeed(s),
    { elimination: true, varianceBoost: rivalryBoost(s, blue.id, red.id) },
    watch,
  );
  series.games.push(result);
  if (result.winner === "blue") series.blueWins += 1;
  else series.redWins += 1;
  if (series.blueWins === 3) series.winnerId = series.blueId;
  if (series.redWins === 3) series.winnerId = series.redId;
  if (series.winnerId) {
    // A finished playoff series deepens (or founds) the rivalry.
    const key = rivalKey(series.blueId, series.redId);
    s.rivalries[key] = (s.rivalries[key] ?? 0) + 1;
  }
  applyResultToState(s, result, true);
  return { result, spatial, blueTactics, redTactics };
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
  for (const series of s.playoffs) announceRivalry(s, series);
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
    announceRivalry(s, s.playoffs[s.playoffs.length - 1]);
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

/** Repeat playoff meetings are news — and play swingier (see rivalryBoost). */
function announceRivalry(s: GameData, series: PlayoffSeries) {
  const level = s.rivalries[rivalKey(series.blueId, series.redId)] ?? 0;
  if (level < 1) return;
  const blue = s.teams[series.blueId];
  const red = s.teams[series.redId];
  post(
    s,
    "Rivalry renewed",
    `${blue.name} vs ${red.name} — playoff meeting #${level + 1}. History like that raises the stakes: expect a swingier, nastier series.`,
    "info",
  );
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

/** Season awards: MVP, All-Pro five, Rookie of the Split. */
function computeAwards(s: GameData, mvp: Player | null) {
  const MIN_GAMES = 6;
  const avgOf = (p: Player) => p.seasonStats.ratingSum / Math.max(1, p.seasonStats.games);
  const teamNameOf = (p: Player) =>
    Object.values(s.teams).find((t) => t.roster.includes(p.id))?.name ?? "Free agent";

  const allPro: { role: Role; handle: string; teamName: string }[] = [];
  for (const role of ROLES) {
    let best: Player | null = null;
    for (const p of Object.values(s.players)) {
      if (p.role !== role || p.seasonStats.games < MIN_GAMES) continue;
      if (!best || avgOf(p) > avgOf(best)) best = p;
    }
    if (best) allPro.push({ role, handle: best.handle, teamName: teamNameOf(best) });
  }

  // Rookie of the Split: first pro season, young, enough games.
  let rookie: Player | null = null;
  for (const p of Object.values(s.players)) {
    if (p.careerHistory.length > 0 || p.age > 20 || p.seasonStats.games < MIN_GAMES) continue;
    if (!rookie || avgOf(p) > avgOf(rookie)) rookie = p;
  }

  return { mvpHandle: mvp?.handle ?? "—", allPro, rookieHandle: rookie?.handle ?? null };
}

function concludeSeason(s: GameData, finalSeries: PlayoffSeries) {
  const championId = finalSeries.winnerId!;
  const runnerUpId =
    finalSeries.blueId === championId ? finalSeries.redId : finalSeries.blueId;
  const mvp = seasonMvp(s);
  const userTeam = s.teams[s.playerTeamId];
  const awards = computeAwards(s, mvp);

  s.history.push({
    season: s.season,
    champion: s.teams[championId].name,
    runnerUp: s.teams[runnerUpId].name,
    playerTeamFinish: finishLabel(s),
    playerTeamRecord: `${userTeam.record.wins}–${userTeam.record.losses}`,
    mvpHandle: mvp?.handle ?? "—",
    awards,
  });

  post(
    s,
    `Season ${s.season} awards ceremony`,
    `MVP: ${awards.mvpHandle}. All-Pro team — ${awards.allPro
      .map((a) => `${a.role} ${a.handle}`)
      .join(", ")}.${awards.rookieHandle ? ` Rookie of the Split: ${awards.rookieHandle}.` : ""} The full hall of fame lives on the League screen.`,
    "info",
  );

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
  const firing = DIFFICULTY_INFO[s.difficulty] ?? DIFFICULTY_INFO.standard;
  if (s.board.strikes >= firing.strikeLimit || s.board.confidence <= firing.confidenceFloor) {
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

  // Transfer rumors: name real AI needs so the market threatens to move —
  // dawdle on a target and the rumor comes true at season roll.
  const rumors: string[] = [];
  const claimed = new Set<string>();
  for (const team of Object.values(s.teams)) {
    if (team.id === s.playerTeamId || rumors.length >= 3) continue;
    const need = neediestRole(team, s.players);
    if (!need) continue;
    const target = s.freeAgents
      .map((id) => s.players[id])
      .filter((p) => p && !p.retired && p.role === need && !claimed.has(p.id))
      .sort((a, b) => b.ovr - a.ovr)[0];
    if (!target) continue;
    claimed.add(target.id);
    rumors.push(`${team.shortName} are circling ${target.handle} (${need})`);
  }
  if (rumors.length > 0) {
    post(
      s,
      "Transfer rumors",
      `${rumors.join("; ")}. Rumored moves tend to happen when rosters lock — if you want one of these players, don't wait.`,
      "info",
    );
  }
}

function generateProspects(
  s: GameData,
  count: number,
  opts: { qualityCenter?: number; minPotential?: number } = {},
): Player[] {
  const rng = createRng(nextSeed(s));
  const created: Player[] = [];
  // Reserve every handle in the save AND every real pro handle, so trainee
  // prospects can't collide with either world.
  const reserved = new Set<string>([
    ...Object.values(s.players).map((p) => p.handle.toLowerCase()),
    ...listPlayers().map((p) => p.handle.toLowerCase()),
  ]);
  for (let i = 0; i < count; i++) {
    s.prospectCounter += 1;
    const player = generatePlayer(rng, {
      id: `fa-s${s.season}-${s.prospectCounter}`,
      role: ROLES[rng.int(0, 4)],
      quality: (opts.qualityCenter ?? 9.5) + rng.normal(0, 0.7),
      reservedHandles: reserved,
      age: 17 + rng.int(0, 2),
      minPotential: opts.minPotential ?? 11.5,
    });
    if (s.dataMode !== "fictional") player.nationality = "KR";
    player.contract = { years: 0, salary: 120 + rng.int(0, 120) };
    s.players[player.id] = player;
    created.push(player);
  }
  return created;
}

/* ── Season narrative: intake hype + development events ────────── */

const INTAKE_PREVIEW_COPY: Record<number, string> = {
  1: "I watched the academy circuit tapes. Thin year — mostly filler, honestly. Don't clear cap space for it.",
  2: "The academy class looks workmanlike. A body or two worth a trial, nothing that changes our plans.",
  3: "Solid academy class this year. One or two names keep coming up in scrim chatter — worth a look on reveal day.",
  4: "Scouts are genuinely excited about this academy class. Real talent in the group. Keep a roster slot warm.",
  5: "I'll say it quietly: there are whispers of a golden generation. Best amateur class anyone's seen in years. Be ready on reveal day.",
};

/** Seed breakout/slump beats for the user's roster — delivered as news later. */
function seedDevEvents(s: GameData) {
  const rng = createRng(nextSeed(s));
  s.devEvents = [];
  const team = s.teams[s.playerTeamId];
  if (!team) return;
  for (const pid of team.roster) {
    const p = s.players[pid];
    if (!p || p.retired) continue;
    const headroom = Math.max(0, p.attributes.potential - p.ovr);
    const pBreakout = (p.age <= 21 ? 0.16 : 0.05) + headroom * 0.012;
    if (rng.chance(pBreakout)) {
      s.devEvents.push({ week: rng.int(2, 15), playerId: pid, kind: "breakout", fired: false });
    } else if (rng.chance(0.1)) {
      s.devEvents.push({ week: rng.int(2, 15), playerId: pid, kind: "slump", fired: false });
    }
  }
}

/** Seed the season's pre-committed reveals (honest hype, no save-scumming). */
function seedSeasonNarrative(s: GameData) {
  const rng = createRng(nextSeed(s));
  s.intake = {
    quality: rng.weightedPick([1, 2, 3, 4, 5], [1, 2, 3, 2, 1]),
    previewWeek: 5,
    revealWeek: 8,
    previewSent: false,
    done: false,
  };
  s.trainingRecap = null;
  seedDevEvents(s);
}

/**
 * Found a created franchise: it replaces the weakest (preseason last-place)
 * team so the schedule generator is untouched; that team's players hit free
 * agency. Roster comes from an expansion draft or an academy intake.
 */
function foundCustomTeam(s: GameData, config: CreateTeamConfig) {
  const ranked = Object.values(s.teams)
    .map((t) => ({ team: t, ovr: teamAvgOvr(t, s.players) }))
    .sort((a, b) => a.ovr - b.ovr);
  const folded = ranked[0].team;
  delete s.teams[folded.id];
  for (const pid of folded.roster) {
    const p = s.players[pid];
    if (p) p.contract.years = 0;
    s.freeAgents.push(pid);
  }

  const team: Team = {
    id: CUSTOM_TEAM_ID,
    name: config.name,
    shortName: config.tag.toUpperCase(),
    region: config.region,
    color: config.primaryColor,
    secondaryColor: config.secondaryColor,
    custom: true,
    roster: [],
    starters: { TOP: "", JGL: "", MID: "", ADC: "", SUP: "" },
    budget: 6200,
    record: { wins: 0, losses: 0 },
  };
  s.teams[team.id] = team;

  const rng = createRng(hashSeed(`${s.baseSeed}:create-team`));
  const reserved = new Set<string>([
    ...Object.values(s.players).map((p) => p.handle.toLowerCase()),
    ...listPlayers().map((p) => p.handle.toLowerCase()),
  ]);

  if (config.rosterMode === "academy") {
    // Young, raw, high-ceiling roster: a development project.
    const roles: Role[] = [...ROLES, ROLES[rng.int(0, 4)]];
    roles.forEach((role, i) => {
      const p = generatePlayer(rng, {
        id: `usrp-a${i}`,
        role,
        quality: 9.2 + rng.normal(0, 0.7),
        reservedHandles: reserved,
        age: 17 + rng.int(0, 2),
        minPotential: 14.5 + rng.next() * 3.5,
      });
      p.nationality = s.dataMode === "fictional" ? p.nationality : "KR";
      p.contract = { years: 3, salary: salaryDemand(p) };
      s.players[p.id] = p;
      team.roster.push(p.id);
      if (!team.starters[role]) team.starters[role] = p.id;
    });
  } else {
    // Expansion draft: pool = free agents (incl. the folded team's players)
    // topped up with generated prospects until every role has ≥5 options.
    let counter = 0;
    for (const role of ROLES) {
      const inPool = s.freeAgents.filter(
        (id) => s.players[id] && !s.players[id].retired && s.players[id].role === role,
      ).length;
      for (let i = inPool; i < 5; i++) {
        const p = generatePlayer(rng, {
          id: `usrp-d${counter++}`,
          role,
          quality: 10.4 + rng.normal(0, 1.1),
          reservedHandles: reserved,
        });
        p.nationality = s.dataMode === "fictional" ? p.nationality : "KR";
        p.contract.years = 0;
        s.players[p.id] = p;
        s.freeAgents.push(p.id);
      }
    }
    s.expansionDraft = {
      poolIds: s.freeAgents.filter((id) => !s.players[id]?.retired),
      cap: team.budget,
      pickedIds: [],
    };
  }

  post(
    s,
    "League expansion",
    `${config.name} join the league as an expansion franchise, replacing ${folded.name}. ${folded.name}'s players enter free agency.`,
    "info",
  );
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

      newGame(opts) {
        const { saveName } = opts;
        const worldSeed =
          opts.dataMode === "fictional"
            ? (opts.worldSeed ?? hashSeed(`${saveName}-${Date.now()}`))
            : null;
        const league =
          opts.dataMode === "fictional"
            ? generateLeague(worldSeed!, listPlayers().map((p) => p.handle))
            : freshLeague();
        const teamId = opts.createTeam ? CUSTOM_TEAM_ID : opts.teamId!;
        const rostered = new Set(Object.values(league.teams).flatMap((t) => t.roster));
        const freeAgents = Object.keys(league.players).filter((id) => !rostered.has(id));
        set((s) => {
          Object.assign(s, structuredClone(initialData));
          s.initialized = true;
          s.saveName = saveName || "Head Coach";
          s.dataMode = opts.dataMode;
          s.worldSeed = worldSeed;
          s.difficulty = opts.difficulty ?? "standard";
          s.tutorial = { active: opts.tutorial ?? false, step: "SQUAD" };
          s.usingSampleData = opts.dataMode === "real" && DATA_META.usingSampleData;
          s.playerTeamId = teamId;
          s.teams = league.teams;
          s.players = league.players;
          s.freeAgents = freeAgents;
          s.baseSeed = hashSeed(`${saveName}-${teamId}-${Date.now()}`);

          if (opts.createTeam) {
            foundCustomTeam(s, opts.createTeam);
          }

          const diff = DIFFICULTY_INFO[s.difficulty];
          s.teams[teamId].budget = Math.round(s.teams[teamId].budget * diff.budgetMult);

          s.fixtures = generateDoubleRoundRobin(Object.keys(s.teams));
          s.scouting = { [teamId]: 5 };
          const rank = preseasonRank(s, teamId);
          s.board = {
            expectedFinish: expectationFor(rank, Object.keys(s.teams).length),
            confidence: 50,
            strikes: 0,
            fired: false,
          };
          seedSeasonNarrative(s);
          const firstFx = userFixtureThisWeek(s);
          const opp = firstFx
            ? s.teams[firstFx.blueId === teamId ? firstFx.redId : firstFx.blueId]
            : null;
          post(
            s,
            `Welcome to ${s.teams[teamId].name}`,
            s.expansionDraft
              ? `The franchise is founded — now build it. Draft five starters (and up to three subs) from the expansion pool before week 1.`
              : `Preseason rank #${rank}. The board expects a top-${s.board.expectedFinish} finish.${
                  opp ? ` Your first game is week 1 against ${opp.name}.` : ""
                }`,
            "info",
          );
          if (s.tutorial.active) {
            const info = TUTORIAL_STEP_INFO.SQUAD;
            post(s, info.memoTitle, info.memoBody, "info");
          }
        });
      },

      draftPick(playerId) {
        set((s) => {
          const draft = s.expansionDraft;
          const p = s.players[playerId];
          if (!draft || !p || !draft.poolIds.includes(playerId)) return;
          if (draft.pickedIds.includes(playerId) || draft.pickedIds.length >= 8) return;
          const spent = draft.pickedIds.reduce(
            (sum, id) => sum + salaryDemand(s.players[id]),
            0,
          );
          if (spent + salaryDemand(p) > draft.cap) return;
          draft.pickedIds.push(playerId);
        });
      },

      undraftPick(playerId) {
        set((s) => {
          if (!s.expansionDraft) return;
          s.expansionDraft.pickedIds = s.expansionDraft.pickedIds.filter(
            (id) => id !== playerId,
          );
        });
      },

      finishDraft() {
        let ok = false;
        set((s) => {
          const draft = s.expansionDraft;
          const team = s.teams[s.playerTeamId];
          if (!draft || !team) return;
          const picked = draft.pickedIds.map((id) => s.players[id]).filter(Boolean);
          const coveredRoles = new Set(picked.map((p) => p.role));
          if (coveredRoles.size < 5 || picked.length > 8) return;
          for (const p of picked) {
            p.contract = { years: 2, salary: salaryDemand(p) };
            team.roster.push(p.id);
            s.freeAgents = s.freeAgents.filter((id) => id !== p.id);
          }
          for (const role of ROLES) {
            const best = picked
              .filter((p) => p.role === role)
              .sort((a, b) => b.ovr - a.ovr)[0];
            if (best) team.starters[role] = best.id;
          }
          s.expansionDraft = null;
          seedDevEvents(s);
          const rank = preseasonRank(s, s.playerTeamId);
          s.board.expectedFinish = expectationFor(rank, Object.keys(s.teams).length);
          post(
            s,
            "Expansion draft complete",
            `${picked.length} players signed. Preseason rank #${rank} — the board expects a top-${s.board.expectedFinish} finish. Week 1 awaits.`,
            "good",
          );
          ok = true;
        });
        return ok;
      },

      tutorialEvent(event) {
        set((s) => {
          tutorialAdvanceIn(s, event);
        });
      },

      skipTutorial() {
        set((s) => {
          if (!s.tutorial.active) return;
          s.tutorial = { active: false, step: "DONE" };
          post(s, "Coach — no problem", "Skipping the guided week. Everything I'd have shown you lives in the ? glossary marks around the app. You can re-run the tutorial from Settings.", "info");
        });
      },

      startTutorial() {
        set((s) => {
          s.tutorial = { active: true, step: "SQUAD" };
          const info = TUTORIAL_STEP_INFO.SQUAD;
          post(s, info.memoTitle, info.memoBody, "info");
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
          tutorialAdvanceIn(s, "starter-set");
        });
      },

      setTrainingFocus(playerId, attr) {
        set((s) => {
          s.trainingFocus[playerId] = attr;
          tutorialAdvanceIn(s, "training-focus-set");
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

      playUserMatch(tactics, watch = false) {
        set((s) => {
          if (s.expansionDraft) return;
          s.pendingTactics = tactics;
          if (s.phase === "REGULAR") {
            const fixture = userFixtureThisWeek(s);
            if (!fixture) return;
            const userIsBlue = fixture.blueId === s.playerTeamId;
            const { result, spatial, blueTactics, redTactics } = simFixture(s, fixture, tactics, watch);
            const opp = userIsBlue ? s.teams[fixture.redId] : s.teams[fixture.blueId];
            s.lastMatch = {
              result,
              label: `Week ${s.week} · vs ${opp.shortName}`,
              isUserMatch: true,
              weekFinished: false,
              elimination: false,
              spatial,
              userTactics: userIsBlue ? blueTactics : redTactics,
              oppTactics: userIsBlue ? redTactics : blueTactics,
            };
            const oppId = fixture.blueId === s.playerTeamId ? fixture.redId : fixture.blueId;
            s.scouting[oppId] = Math.min(5, (s.scouting[oppId] ?? 0) + 1);
            s.userPlayedThisWeek = true;
          } else if (s.phase === "PLAYOFFS") {
            const series = userSeries(s);
            if (!series) return;
            const userIsBlue = series.blueId === s.playerTeamId;
            const { result, spatial, blueTactics, redTactics } = simSeriesGame(s, series, tactics, watch);
            const oppId = userIsBlue ? series.redId : series.blueId;
            s.lastMatch = {
              result,
              label: `${series.round === "FINAL" ? "Grand Final" : "Semifinal"} · Game ${series.games.length} · vs ${s.teams[oppId].shortName}`,
              isUserMatch: true,
              weekFinished: false,
              elimination: true,
              spatial,
              userTactics: userIsBlue ? blueTactics : redTactics,
              oppTactics: userIsBlue ? redTactics : blueTactics,
            };
            s.scouting[oppId] = Math.min(5, (s.scouting[oppId] ?? 0) + 1);
            s.userPlayedThisWeek = true;
          }
        });
      },

      finishWeek() {
        set((s) => {
          if (s.expansionDraft) return;
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
        if (state.expansionDraft) return;
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
          s.powerRankings = [];
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
          seedSeasonNarrative(s);
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
          Object.assign(s, structuredClone(initialData), migrateSave(structuredClone(data)));
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
      version: SAVE_VERSION,
      migrate: (persisted) => migrateSave(persisted as Partial<GameData>) as GameStore,
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
  // The user's gains are captured for the weekly recap — invisible sim ticks
  // become a visible artifact every advance.
  const recapEntries: TrainingRecapEntry[] = [];
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
      const gain = applyTraining(p, focus, rng);
      if (team.id === s.playerTeamId && gain > 0) {
        recapEntries.push({ playerId: pid, handle: p.handle, attr: focus, delta: gain });
      }
      const isStarter = ROLES.some((r) => team.starters[r] === pid);
      applyWeeklyRecovery(p, !isStarter);
    }
  }
  recapEntries.sort((a, b) => b.delta - a.delta);
  s.trainingRecap = { season: s.season, week: s.week, entries: recapEntries };

  // Development beats: pre-seeded breakouts and slumps land as news.
  for (const event of s.devEvents) {
    if (event.fired || event.week > s.week) continue;
    event.fired = true;
    const p = s.players[event.playerId];
    const team = s.teams[s.playerTeamId];
    if (!p || p.retired || !team.roster.includes(p.id)) continue;
    if (event.kind === "breakout") {
      p.attributes.potential = Math.min(20, round1(p.attributes.potential + 1.5));
      p.form = Math.min(3, p.form + 1);
      p.morale = Math.min(100, p.morale + 8);
      post(
        s,
        `${p.handle} is leveling up`,
        `Something clicked for ${p.handle} in scrims — the coaches can't miss it. His ceiling just moved. Feed him training weeks while it's hot.`,
        "good",
      );
    } else {
      p.form = Math.max(-3, p.form - 1.5);
      p.morale = Math.max(0, p.morale - 8);
      post(
        s,
        `${p.handle} looks burnt out`,
        `${p.handle} is off the pace in scrims — sloppy waves, late rotations. Could be fatigue, could be his head. A rest week or a big game might reset him.`,
        "bad",
      );
    }
  }

  // Academy Showcase: hype at the preview week, reveal on the day.
  if (!s.intake.previewSent && s.week >= s.intake.previewWeek) {
    s.intake.previewSent = true;
    post(s, "Coach — academy preview", INTAKE_PREVIEW_COPY[s.intake.quality] ?? INTAKE_PREVIEW_COPY[3], "info");
  }
  if (!s.intake.done && s.week >= s.intake.revealWeek) {
    s.intake.done = true;
    const classSize = 4 + (s.intake.quality >= 4 ? 2 : s.intake.quality >= 2 ? 1 : 0);
    const rookies = generateProspects(s, classSize, {
      qualityCenter: 7.4 + s.intake.quality * 0.9,
      minPotential: 10.5 + s.intake.quality * 1.1,
    });
    s.freeAgents.push(...rookies.map((p) => p.id));
    post(
      s,
      `Academy Showcase — the class of season ${s.season}`,
      `${rookies.length} prospects declared: ${rookies
        .map((p) => `${p.handle} (${p.role})`)
        .join(", ")}. All are on the free-agent market now — scouting reports are wide open, so trust your eye. ${
        s.intake.quality >= 4 ? "This is the class everyone will remember. Move fast." : ""
      }`,
      s.intake.quality >= 4 ? "good" : "info",
    );
  }

  // Scouting target gains a level.
  if (s.scoutTargetId && s.scoutTargetId !== s.playerTeamId) {
    s.scouting[s.scoutTargetId] = Math.min(5, (s.scouting[s.scoutTargetId] ?? 0) + 1);
  }

  // Weekly power rankings (analyst desk). Movement drives the blurbs; big
  // moves for the user's team make the inbox.
  const standings = standingsOf(s);
  if (s.phase === "REGULAR") {
    const prev = s.powerRankings.length > 0 ? s.powerRankings : null;
    s.powerRankings = computePowerRankings(
      s.teams,
      s.players,
      standings,
      prev,
      `${s.season}-${s.week}`,
    );
    const mine = s.powerRankings.find((e) => e.teamId === s.playerTeamId);
    if (mine?.prevRank && mine.prevRank - mine.rank >= 2) {
      post(s, `Power rankings: up to #${mine.rank}`, mine.blurb, "good");
    } else if (mine?.prevRank && mine.rank - mine.prevRank >= 2) {
      post(s, `Power rankings: down to #${mine.rank}`, mine.blurb, "bad");
    }
  }

  // Board confidence drifts toward a target set by position vs expectation.
  // Slow drift: one rough season stings but doesn't fire you on its own.
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
