/** Core domain types for RIFT GM. Framework-agnostic — no React imports. */

export type Role = "TOP" | "JGL" | "MID" | "ADC" | "SUP";

export const ROLES: Role[] = ["TOP", "JGL", "MID", "ADC", "SUP"];

/** All attributes on a 1–20 scale (stored as floats, displayed rounded). */
export interface Attributes {
  laning: number;
  mechanics: number;
  macro: number;
  teamfight: number;
  aggression: number;
  /** Hidden: inverse of game-to-game variance. */
  consistency: number;
  /** Hidden, modeled: elimination-game performance delta. */
  clutch: number;
  /** Hidden, modeled: development ceiling. */
  potential: number;
}

export type AttributeKey = keyof Attributes;

export const VISIBLE_ATTRIBUTES: AttributeKey[] = [
  "laning",
  "mechanics",
  "macro",
  "teamfight",
  "aggression",
];

export const HIDDEN_ATTRIBUTES: AttributeKey[] = [
  "consistency",
  "clutch",
  "potential",
];

export type Provenance = "derived" | "modeled";

export interface PlayerSeasonStats {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  damage: number;
  mvps: number;
  ratingSum: number;
}

export interface SeasonRecord {
  season: number;
  teamId: string;
  teamName: string;
  games: number;
  wins: number;
  kda: number;
  avgRating: number;
  mvps: number;
  ovrAtEnd: number;
  finish: string;
}

export interface Contract {
  years: number;
  salary: number;
}

export interface Player {
  id: string;
  handle: string;
  name?: string;
  role: Role;
  age: number;
  nationality?: string;
  attributes: Attributes;
  provenance: Record<AttributeKey, Provenance>;
  rawMetrics?: Record<string, number>;
  ovr: number;
  /** Rolling recent-performance modifier, −3…+3. */
  form: number;
  /** 0–100. */
  morale: number;
  /** 0–100. Higher = more tired. */
  fatigue: number;
  contract: Contract;
  seasonStats: PlayerSeasonStats;
  careerHistory: SeasonRecord[];
  retired?: boolean;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  region: string;
  color: string;
  logoRef?: string;
  roster: string[];
  starters: Record<Role, string>;
  budget: number;
  record: { wins: number; losses: number };
}

export type MatchEventType =
  | "FIRST_BLOOD"
  | "KILL"
  | "DRAGON"
  | "HERALD"
  | "BARON"
  | "TOWER"
  | "ACE"
  | "THROW"
  | "NEXUS";

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  team: "blue" | "red";
  /** Broadcast-style line. */
  detail: string;
  goldSwing?: number;
  /** Minor events count on the scoreboard but stay out of the feed. */
  minor?: boolean;
}

export interface PlayerLine {
  k: number;
  d: number;
  a: number;
  cs: number;
  dmg: number;
  rating: number;
}

export interface MatchResult {
  blueTeamId: string;
  redTeamId: string;
  winner: "blue" | "red";
  durationMin: number;
  /** Per-minute blue-minus-red gold diff; index 0 = minute 0. */
  goldTimeline: number[];
  events: MatchEvent[];
  playerLines: Record<string, PlayerLine>;
  mvpPlayerId: string;
  seed: number;
}

/* ── Tactics & draft ──────────────────────────────────────────── */

export type Playstyle = "AGGRESSIVE" | "BALANCED" | "SCALING";
export type ObjectiveFocus = "DRAGON" | "HERALD" | "BARON";
export type CompArchetype =
  | "POKE"
  | "PICK"
  | "TEAMFIGHT"
  | "SPLITPUSH"
  | "CHEESE";

export interface TeamTactics {
  playstyle: Playstyle;
  objective: ObjectiveFocus;
  archetype: CompArchetype;
  /** Opponent player id whose champion pool is target-banned. */
  targetBan?: string;
}

/** Everything the engine needs to know about one side. */
export interface PlayerMatchInput {
  id: string;
  handle: string;
  role: Role;
  attributes: Attributes;
  form: number;
  morale: number;
  fatigue: number;
}

export interface TeamContext {
  teamId: string;
  name: string;
  players: PlayerMatchInput[]; // exactly 5, one per role
  tactics: TeamTactics;
}

export interface MatchOptions {
  /** Elimination games weight CLUTCH. */
  elimination?: boolean;
}

/* ── Season structures ────────────────────────────────────────── */

export interface Fixture {
  id: string;
  week: number;
  blueId: string;
  redId: string;
  result?: MatchResult;
}

export type PlayoffRound = "SEMI" | "FINAL" | "THIRD";

export interface PlayoffSeries {
  id: string;
  round: PlayoffRound;
  blueId: string;
  redId: string;
  blueWins: number;
  redWins: number;
  games: MatchResult[];
  winnerId?: string;
}

export interface InboxMessage {
  id: string;
  week: number;
  season: number;
  title: string;
  body: string;
  tone: "info" | "good" | "bad";
  read: boolean;
}

export interface SeasonHistoryEntry {
  season: number;
  champion: string;
  runnerUp: string;
  playerTeamFinish: string;
  playerTeamRecord: string;
  mvpHandle: string;
}

export type SeasonPhase = "REGULAR" | "PLAYOFFS" | "OFFSEASON";

export interface BoardState {
  /** Standing the board expects at minimum (1-indexed). */
  expectedFinish: number;
  confidence: number; // 0–100
  strikes: number;
  fired: boolean;
}

export interface TransferBid {
  id: string;
  playerId: string;
  fromTeamId: string; // bidding team
  amount: number; // salary offered
  years: number;
  /** Weeks until the bid resolves. */
  resolvesIn: number;
}

/* ── Data files ───────────────────────────────────────────────── */

export interface ChampionInfo {
  id: string;
  name: string;
  roles: string[];
  icon?: string;
}

export interface DataMeta {
  dataVersion: string;
  fetchedAt: string;
  league: string;
  seasonLabel: string;
  sources: { name: string; url: string; license: string }[];
  usingSampleData: boolean;
  notes?: string;
}
