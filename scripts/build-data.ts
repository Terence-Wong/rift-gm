/**
 * RIFT GM data pipeline. Run with `npm run data`.
 *
 * 1. Tries to download Oracle's Elixir match data for the configured
 *    league/year and derives 1–20 attributes from role-normalized
 *    percentiles of real per-game metrics (provenance: "derived").
 * 2. Tries to fetch champion metadata from Riot Data Dragon.
 * 3. On any failure it falls back to the bundled curated dataset
 *    (provenance: "modeled", flagged usingSampleData in meta.json).
 *
 * The deployed app has NO runtime dependency on these sources — it reads
 * the JSON this script writes into /data.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeOvr, percentileRank, round1 } from "../lib/attributes";
import { createRng, hashSeed } from "../lib/engine/rng";
import type {
  AttributeKey,
  Attributes,
  ChampionInfo,
  DataMeta,
  Player,
  Provenance,
  Role,
  Team,
} from "../lib/types";
import {
  CURATED_CHAMPIONS,
  CURATED_TEAMS,
  LEAGUE,
  PROSPECT_HANDLES,
  SEASON_LABEL,
  TEAM_META,
  type CuratedPlayer,
} from "./curated";

/* ── Config: change league/year/teams here ─────────────────────── */
const OE_YEAR = 2025;
const OE_LEAGUE = LEAGUE; // "LCK"
const MIN_GAMES = 8;
/** Oracle's Elixir hosts yearly CSVs in a public Google Drive folder. */
const OE_DRIVE_FILE_IDS: Record<number, string> = {
  2024: "1XXk2LO0CsNADBB1LRGOV5rUpyZdEZ8s2",
  2025: "1v6LRphp2kYciU4SXp0PCjEMuev1bDejc",
  2026: "1hnpbrUpBMS1TZI7IovfpKeZfWJH1Aptm",
};
const OE_URLS = [
  `https://drive.usercontent.google.com/download?id=${OE_DRIVE_FILE_IDS[OE_YEAR]}&export=download&confirm=t`,
  `https://oracleselixir-downloadable-match-data.s3-us-west-2.amazonaws.com/${OE_YEAR}_LoL_esports_match_data_from_OraclesElixir.csv`,
];
const DDRAGON_VERSIONS = "https://ddragon.leagueoflegends.com/api/versions.json";

const DATA_DIR = join(process.cwd(), "data");

const SOURCES = [
  {
    name: "Oracle's Elixir",
    url: "https://oracleselixir.com/tools/downloads",
    license: "Free for non-commercial use with attribution",
  },
  {
    name: "Leaguepedia",
    url: "https://lol.fandom.com",
    license: "CC BY-SA 3.0",
  },
  {
    name: "Riot Data Dragon",
    url: "https://developer.riotgames.com/docs/lol#data-dragon",
    license: "Riot Games developer assets",
  },
];

/* ── Curated → domain objects ──────────────────────────────────── */

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

function curatedToPlayer(teamId: string, c: CuratedPlayer): Player {
  const [laning, mechanics, macro, teamfight, aggression, consistency, clutch, potential] =
    c.attrs;
  const attributes: Attributes = {
    laning,
    mechanics,
    macro,
    teamfight,
    aggression,
    consistency,
    clutch,
    potential,
  };
  const provenance = Object.fromEntries(
    (Object.keys(attributes) as AttributeKey[]).map((k) => [k, "modeled" as Provenance]),
  ) as Record<AttributeKey, Provenance>;
  return {
    id: `${teamId}-${c.handle.toLowerCase()}`,
    handle: c.handle,
    role: c.role,
    age: c.age,
    nationality: c.nationality,
    attributes,
    provenance,
    ovr: computeOvr(c.role, attributes),
    form: 0,
    morale: 60,
    fatigue: 0,
    contract: { years: c.years, salary: c.salary },
    seasonStats: { ...ZERO_STATS },
    careerHistory: [],
  };
}

function generateProspects(count: number): Player[] {
  const rng = createRng(hashSeed("rift-gm-prospects-v1"));
  const roles: Role[] = ["TOP", "JGL", "MID", "ADC", "SUP"];
  const players: Player[] = [];
  for (let i = 0; i < count; i++) {
    const handle = PROSPECT_HANDLES[i % PROSPECT_HANDLES.length];
    const role = roles[i % roles.length];
    const base = () => round1(8 + rng.next() * 5);
    const attributes: Attributes = {
      laning: base(),
      mechanics: base(),
      macro: base(),
      teamfight: base(),
      aggression: base(),
      consistency: round1(7 + rng.next() * 5),
      clutch: round1(7 + rng.next() * 5),
      potential: round1(12 + rng.next() * 7),
    };
    const provenance = Object.fromEntries(
      (Object.keys(attributes) as AttributeKey[]).map((k) => [k, "modeled" as Provenance]),
    ) as Record<AttributeKey, Provenance>;
    players.push({
      id: `fa-${handle.toLowerCase()}`,
      handle,
      role,
      age: 17 + rng.int(0, 2),
      nationality: "KR",
      attributes,
      provenance,
      ovr: computeOvr(role, attributes),
      form: 0,
      morale: 60,
      fatigue: 0,
      contract: { years: 0, salary: 120 + rng.int(0, 130) },
      seasonStats: { ...ZERO_STATS },
      careerHistory: [],
    });
  }
  return players;
}

function buildCurated(): { players: Player[]; teams: Team[] } {
  const players: Player[] = [];
  const teams: Team[] = [];
  for (const t of CURATED_TEAMS) {
    const roster = t.players.map((c) => curatedToPlayer(t.id, c));
    players.push(...roster);
    const starters = Object.fromEntries(roster.map((p) => [p.role, p.id])) as Record<
      Role,
      string
    >;
    teams.push({
      id: t.id,
      name: t.name,
      shortName: t.shortName,
      region: LEAGUE,
      color: t.color,
      roster: roster.map((p) => p.id),
      starters,
      budget: t.budget,
      record: { wins: 0, losses: 0 },
    });
  }
  players.push(...generateProspects(10));
  return { players, teams };
}

/* ── Oracle's Elixir derivation ────────────────────────────────── */

/**
 * LCK players are all elite, so within-league percentiles map onto a
 * compressed 6–19.5 band rather than the raw 1–20 scale — the league's
 * worst starter is still far above an amateur.
 */
function leagueAttr(p: number): number {
  const clamped = Math.min(1, Math.max(0, p));
  return round1(6 + Math.pow(clamped, 1.15) * 13.5);
}

interface OeRow {
  playername: string;
  teamname: string;
  position: string;
  playoffs: number;
  kills: number;
  deaths: number;
  assists: number;
  teamkills: number;
  dpm: number;
  damageshare: number;
  vspm: number;
  "earned gpm": number;
  csdiffat15: number;
  golddiffat15: number;
  xpdiffat15: number;
  killsat15: number;
  assistsat15: number;
  deathsat15: number;
  firstbloodkill: number;
  firstbloodassist: number;
  doublekills: number;
  triplekills: number;
  quadrakills: number;
  pentakills: number;
  result: number;
}

const NUM_FIELDS: (keyof OeRow)[] = [
  "kills",
  "deaths",
  "assists",
  "teamkills",
  "dpm",
  "damageshare",
  "vspm",
  "earned gpm",
  "csdiffat15",
  "golddiffat15",
  "xpdiffat15",
  "killsat15",
  "assistsat15",
  "deathsat15",
  "firstbloodkill",
  "firstbloodassist",
  "doublekills",
  "triplekills",
  "quadrakills",
  "pentakills",
  "result",
  "playoffs",
];

function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let header: string[] | null = null;
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    record.push(field);
    field = "";
  };
  const pushRecord = () => {
    if (record.length === 1 && record[0] === "") {
      record = [];
      return;
    }
    if (!header) {
      header = record;
    } else {
      const obj: Record<string, string> = {};
      for (let i = 0; i < header.length; i++) obj[header[i]] = record[i] ?? "";
      rows.push(obj);
    }
    record = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") pushField();
    else if (ch === "\n") {
      pushField();
      pushRecord();
    } else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || record.length > 0) {
    pushField();
    pushRecord();
  }
  return rows;
}

const POSITION_MAP: Record<string, Role> = {
  top: "TOP",
  jng: "JGL",
  jungle: "JGL",
  mid: "MID",
  bot: "ADC",
  adc: "ADC",
  sup: "SUP",
  support: "SUP",
};

function normalizeTeamName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function deriveFromOraclesElixir(): Promise<{ players: Player[]; teams: Team[] }> {
  console.log(`Fetching Oracle's Elixir ${OE_YEAR} data (this file is large)...`);
  let text: string | null = null;
  let lastError = "no source";
  for (const url of OE_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      if (!body.startsWith("gameid,")) throw new Error("unexpected payload (not the OE CSV)");
      text = body;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  if (!text) throw new Error(`OE fetch failed: ${lastError}`);
  console.log(`Downloaded ${(text.length / 1e6).toFixed(1)} MB. Parsing...`);
  const raw = parseCsv(text);

  const rows: OeRow[] = [];
  for (const r of raw) {
    if (r.league !== OE_LEAGUE) continue;
    const role = POSITION_MAP[r.position];
    if (!role || !r.playername) continue;
    const row = {
      playername: r.playername,
      teamname: r.teamname,
      position: r.position,
    } as OeRow;
    for (const f of NUM_FIELDS) {
      (row as unknown as Record<string, number>)[f] = Number(r[f as string]) || 0;
    }
    rows.push(row);
  }
  if (rows.length < 100) throw new Error(`Too few ${OE_LEAGUE} rows: ${rows.length}`);
  console.log(`${rows.length} ${OE_LEAGUE} player-game rows.`);

  // Aggregate per player.
  interface Agg {
    handle: string;
    teamCounts: Map<string, number>;
    role: Role;
    games: number;
    sums: Map<string, number>;
    composites: number[];
    playoffComposites: number[];
  }
  const aggs = new Map<string, Agg>();
  for (const r of rows) {
    const key = `${r.playername}|${POSITION_MAP[r.position]}`;
    let a = aggs.get(key);
    if (!a) {
      a = {
        handle: r.playername,
        teamCounts: new Map(),
        role: POSITION_MAP[r.position],
        games: 0,
        sums: new Map(),
        composites: [],
        playoffComposites: [],
      };
      aggs.set(key, a);
    }
    a.games++;
    a.teamCounts.set(r.teamname, (a.teamCounts.get(r.teamname) ?? 0) + 1);
    const add = (k: string, v: number) => a!.sums.set(k, (a!.sums.get(k) ?? 0) + v);
    add("kda", (r.kills + r.assists) / Math.max(1, r.deaths));
    add("kp", (r.kills + r.assists) / Math.max(1, r.teamkills));
    add("dpm", r.dpm);
    add("damageshare", r.damageshare);
    add("vspm", r.vspm);
    add("egpm", r["earned gpm"]);
    add("csd15", r.csdiffat15);
    add("gd15", r.golddiffat15);
    add("xpd15", r.xpdiffat15);
    add("early15", r.killsat15 + r.assistsat15);
    add("deaths15", r.deathsat15);
    add("fb", r.firstbloodkill + r.firstbloodassist);
    add("multi", r.doublekills + r.triplekills * 2 + r.quadrakills * 3 + r.pentakills * 5);
    const composite = r.kills + 0.7 * r.assists - r.deaths + r.dpm / 300;
    if (r.playoffs > 0) a.playoffComposites.push(composite);
    else a.composites.push(composite);
  }

  const qualified = [...aggs.values()].filter((a) => a.games >= MIN_GAMES);
  const avg = (a: Agg, k: string) => (a.sums.get(k) ?? 0) / a.games;
  const stdev = (xs: number[]) => {
    const m = xs.reduce((s, v) => s + v, 0) / xs.length;
    return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
  };

  // Role-normalized percentile for a metric.
  const rolePct = (a: Agg, metric: (x: Agg) => number) => {
    const peers = qualified.filter((q) => q.role === a.role).map(metric);
    return percentileRank(metric(a), peers);
  };

  const curatedByHandle = new Map(
    CURATED_TEAMS.flatMap((t) => t.players.map((p) => [p.handle.toLowerCase(), p] as const)),
  );

  const players: Player[] = [];
  const byTeam = new Map<string, Player[]>();

  for (const a of qualified) {
    const laningP =
      (rolePct(a, (x) => avg(x, "csd15")) +
        rolePct(a, (x) => avg(x, "gd15")) +
        rolePct(a, (x) => avg(x, "xpd15"))) /
      3;
    const mechP =
      (rolePct(a, (x) => avg(x, "dpm")) +
        rolePct(a, (x) => avg(x, "damageshare")) +
        rolePct(a, (x) => avg(x, "kda"))) /
      3;
    const macroP =
      (rolePct(a, (x) => avg(x, "vspm")) +
        rolePct(a, (x) => avg(x, "kp")) +
        rolePct(a, (x) => avg(x, "egpm"))) /
      3;
    const tfP =
      (rolePct(a, (x) => avg(x, "kp")) +
        rolePct(a, (x) => avg(x, "damageshare")) +
        rolePct(a, (x) => avg(x, "multi"))) /
      3;
    const aggrP =
      (rolePct(a, (x) => avg(x, "fb")) +
        rolePct(a, (x) => avg(x, "early15")) +
        rolePct(a, (x) => avg(x, "deaths15"))) /
      3;
    // Consistency: inverse coefficient of variation of the per-game
    // composite (CV, not raw stdev, so high-output carries aren't punished
    // for having bigger absolute swings).
    const cv = (x: Agg) => {
      const xs = [...x.composites, ...x.playoffComposites];
      const mean = xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
      return stdev(xs) / (Math.abs(mean) + 8);
    };
    const consP = 1 - rolePct(a, cv);

    const rng = createRng(hashSeed(`oe-${a.handle}-${a.role}`));
    const curated = curatedByHandle.get(a.handle.toLowerCase());
    const age = curated?.age ?? 20 + rng.int(0, 6);

    // Clutch: playoff-vs-regular composite delta when the sample allows;
    // otherwise modeled from teamfight/mechanics plus noise.
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / Math.max(1, xs.length);
    const clutchDerivable = a.playoffComposites.length >= 8;
    let clutch: number;
    if (clutchDerivable) {
      const delta = (x: Agg) =>
        x.playoffComposites.length >= 8
          ? mean(x.playoffComposites) - mean(x.composites)
          : 0;
      const peers = qualified.filter(
        (q) => q.role === a.role && q.playoffComposites.length >= 8,
      );
      clutch = leagueAttr(
        percentileRank(
          delta(a),
          peers.map((q) => delta(q)),
        ),
      );
    } else {
      clutch = round1(
        Math.min(20, Math.max(4, (leagueAttr(mechP) + leagueAttr(tfP)) / 2 + rng.normal(0, 2))),
      );
    }

    const attributes: Attributes = {
      laning: leagueAttr(laningP),
      mechanics: leagueAttr(mechP),
      macro: leagueAttr(macroP),
      teamfight: leagueAttr(tfP),
      aggression: leagueAttr(aggrP),
      consistency: leagueAttr(consP),
      clutch,
      potential: round1(Math.min(20, Math.max(4, 21 - (age - 17) * 1.3 + rng.normal(0, 1.5)))),
    };
    const provenance: Record<AttributeKey, Provenance> = {
      laning: "derived",
      mechanics: "derived",
      macro: "derived",
      teamfight: "derived",
      aggression: "derived",
      consistency: "derived",
      clutch: clutchDerivable ? "derived" : "modeled",
      potential: "modeled",
    };

    const teamName = [...a.teamCounts.entries()].sort((x, y) => y[1] - x[1])[0][0];
    const ovr = computeOvr(a.role, attributes);
    const player: Player = {
      id: `oe-${a.handle.toLowerCase().replace(/[^a-z0-9]/g, "")}-${a.role.toLowerCase()}`,
      handle: a.handle,
      role: a.role,
      age,
      nationality: curated?.nationality ?? "KR",
      attributes,
      provenance,
      rawMetrics: {
        games: a.games,
        csd15: round1(avg(a, "csd15")),
        gd15: round1(avg(a, "gd15")),
        xpd15: round1(avg(a, "xpd15")),
        dpm: round1(avg(a, "dpm")),
        dmgShare: round1(avg(a, "damageshare") * 100),
        kda: round1(avg(a, "kda")),
        kp: round1(avg(a, "kp") * 100),
        vspm: round1(avg(a, "vspm")),
      },
      ovr,
      form: 0,
      morale: 60,
      fatigue: 0,
      contract: {
        years: 1 + rng.int(0, 2),
        salary: Math.round(150 + Math.max(0, ovr - 8) ** 2 * 17),
      },
      seasonStats: { ...ZERO_STATS },
      careerHistory: [],
    };
    players.push(player);
    const list = byTeam.get(normalizeTeamName(teamName)) ?? [];
    list.push(player);
    byTeam.set(normalizeTeamName(teamName), list);
  }

  // Build the configured teams from curated metadata, rosters from OE.
  const teams: Team[] = [];
  const rostered = new Set<string>();
  for (const ct of TEAM_META) {
    let candidates: Player[] | undefined;
    for (const alias of ct.aliases) {
      candidates = byTeam.get(normalizeTeamName(alias));
      if (candidates) break;
    }
    if (!candidates) throw new Error(`No OE roster matched team "${ct.name}"`);
    const starters = {} as Record<Role, string>;
    const roster: string[] = [];
    for (const role of ["TOP", "JGL", "MID", "ADC", "SUP"] as Role[]) {
      const best = candidates
        .filter((p) => p.role === role)
        .sort((x, y) => (y.rawMetrics?.games ?? 0) - (x.rawMetrics?.games ?? 0))[0];
      if (!best) throw new Error(`Team "${ct.name}" missing a qualified ${role}`);
      starters[role] = best.id;
      roster.push(best.id);
      rostered.add(best.id);
    }
    teams.push({
      id: ct.id,
      name: ct.name,
      shortName: ct.shortName,
      region: LEAGUE,
      color: ct.color,
      roster,
      starters,
      budget: ct.budget,
      record: { wins: 0, losses: 0 },
    });
  }

  // Keep rostered players + generated prospects; drop unattached OE players
  // so the free-agent pool stays clearly fictional.
  const finalPlayers = players.filter((p) => rostered.has(p.id));
  finalPlayers.push(...generateProspects(10));
  return { players: finalPlayers, teams };
}

/* ── Champions from Data Dragon ────────────────────────────────── */

async function fetchChampions(): Promise<ChampionInfo[]> {
  const versions = (await (
    await fetch(DDRAGON_VERSIONS, { signal: AbortSignal.timeout(20_000) })
  ).json()) as string[];
  const version = versions[0];
  const data = (await (
    await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      { signal: AbortSignal.timeout(30_000) },
    )
  ).json()) as { data: Record<string, { id: string; name: string; tags: string[] }> };
  return Object.values(data.data).map((c) => ({
    id: c.id,
    name: c.name,
    roles: c.tags,
    icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.id}.png`,
  }));
}

/* ── Main ──────────────────────────────────────────────────────── */

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  // Fallback is always written so the app can run offline.
  const curated = buildCurated();
  writeFileSync(
    join(DATA_DIR, "fallback.json"),
    JSON.stringify({ players: curated.players, teams: curated.teams }, null, 2),
  );

  let players = curated.players;
  let teams = curated.teams;
  let usingSampleData = true;
  let notes =
    "Curated sample dataset. Rosters are real LCK 2025 lineups; ratings are approximate estimates, not derived from match data.";

  try {
    const derived = await deriveFromOraclesElixir();
    players = derived.players;
    teams = derived.teams;
    usingSampleData = false;
    notes = `Attributes derived from Oracle's Elixir ${OE_YEAR} ${OE_LEAGUE} match data (role-normalized percentiles). Consistency is derived from game-to-game variance; Clutch and Potential are modeled.`;
    console.log(`Derived ${players.length} players across ${teams.length} teams from real data.`);
  } catch (err) {
    console.warn(
      `Live derivation unavailable (${err instanceof Error ? err.message : err}). Using curated fallback.`,
    );
  }

  let champions: ChampionInfo[] = CURATED_CHAMPIONS;
  try {
    champions = await fetchChampions();
    console.log(`Fetched ${champions.length} champions from Data Dragon.`);
  } catch {
    console.warn("Data Dragon unavailable; using curated champion list.");
  }

  const meta: DataMeta = {
    dataVersion: "1.0.0",
    fetchedAt: new Date().toISOString(),
    league: OE_LEAGUE,
    seasonLabel: SEASON_LABEL,
    sources: SOURCES,
    usingSampleData,
    notes,
  };

  writeFileSync(join(DATA_DIR, "players.json"), JSON.stringify(players, null, 2));
  writeFileSync(join(DATA_DIR, "teams.json"), JSON.stringify(teams, null, 2));
  writeFileSync(join(DATA_DIR, "champions.json"), JSON.stringify(champions, null, 2));
  writeFileSync(join(DATA_DIR, "meta.json"), JSON.stringify(meta, null, 2));
  console.log(`Wrote /data (usingSampleData=${usingSampleData}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
