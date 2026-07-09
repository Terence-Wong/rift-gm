/**
 * Fictional-world generator: teams, players, handles — everything a
 * "Fictional league" save needs, procedurally generated from one seed.
 * Pure and deterministic: same seed → the same world, so seeds can be
 * shared and replayed. No real pro names ever appear here; generated
 * handles are checked against the real-player handle list and rerolled.
 */

import { computeOvr, ROLE_WEIGHTS, round1 } from "../attributes";
import { TEAM_PALETTE } from "../palette";
import type { AttributeKey, Attributes, Player, Provenance, Role, Team } from "../types";
import { ROLES } from "../types";
import { salaryDemand } from "./ai";
import { createRng, hashSeed, type Rng } from "./rng";

/* ── Hand-authored word banks (no real pro names) ─────────────── */

const HANDLE_WORDS = [
  "Aftermath", "Anvil", "Apogee", "Arclight", "Ashfall", "Bastion", "Blackout",
  "Bramble", "Cascade", "Cinder", "Comet", "Crescent", "Crowfall", "Dawnbreak",
  "Drift", "Duskline", "Eclipse", "Embercore", "Falter", "Flicker", "Foxglove",
  "Gale", "Gloom", "Gravity", "Grimoire", "Harrow", "Hollow", "Icevein",
  "Ironquill", "Lattice", "Lodestar", "Marrow", "Midnight", "Mirage", "Monsoon",
  "Nightjar", "Nocturne", "Obelisk", "Outlast", "Overcast", "Paradox", "Pinnacle",
  "Quiver", "Rainfall", "Rampart", "Ravel", "Redline", "Requiem", "Riftwalk",
  "Rook", "Seismic", "Shatter", "Sidewind", "Silhouette", "Skyfall", "Sleet",
  "Solstice", "Sparrow", "Static", "Stonewall", "Sundial", "Tempest", "Thistle",
  "Tidal", "Torrent", "Trickshot", "Twilight", "Undertow", "Vandal", "Vellum",
  "Verdict", "Vesper", "Voidling", "Warden", "Wavelength", "Whisper", "Wildcard",
  "Windrow", "Wraithe", "Zenith",
];

const HANDLE_PREFIX = [
  "Ka", "Ve", "So", "Ry", "Ael", "Ny", "Tor", "Za", "Mor", "Fen",
  "Lu", "Cro", "Hal", "Ori", "Sky", "Vor", "Bel", "Dra", "Isk", "Quo",
];
const HANDLE_SUFFIX = [
  "el", "ix", "on", "ar", "eth", "us", "ien", "ova", "yn", "ith",
  "or", "as", "iel", "ux", "an", "is",
];

const TEAM_ADJECTIVES = [
  "Obsidian", "Ashen", "Crimson", "Gilded", "Hollow", "Iron", "Lunar", "Midnight",
  "Northern", "Radiant", "Silent", "Solar", "Sterling", "Umbral", "Verdant", "Wild",
];
const TEAM_NOUNS = [
  "Wolves", "Ravens", "Sentinels", "Monarchs", "Drakes", "Wardens", "Phantoms",
  "Vipers", "Griffins", "Titans", "Heralds", "Reapers", "Foxes", "Lynxes",
  "Serpents", "Falcons",
];

/** Fictional nationality codes — invented, not real countries. */
const FICTIONAL_NATIONS = ["AVL", "KHA", "NYX", "SOL", "VEL", "ORR"];

export const FICTIONAL_REGION = "RIFT";

/* ── Handles ──────────────────────────────────────────────────── */

/**
 * Generate a gamer handle that collides with nothing in `reserved`
 * (case-insensitive — this is how real pro names are kept out).
 */
export function generateHandle(rng: Rng, reserved: Set<string>): string {
  for (let attempt = 0; attempt < 60; attempt++) {
    const style = rng.next();
    let handle: string;
    if (style < 0.55) {
      handle = rng.pick(HANDLE_WORDS);
    } else if (style < 0.85) {
      handle = rng.pick(HANDLE_PREFIX) + rng.pick(HANDLE_SUFFIX);
    } else {
      handle = rng.pick(HANDLE_PREFIX) + rng.pick(HANDLE_SUFFIX) + rng.pick(HANDLE_SUFFIX);
    }
    // Occasional stylization, in moderation.
    if (rng.chance(0.12)) handle = handle.toUpperCase();
    if (!reserved.has(handle.toLowerCase())) {
      reserved.add(handle.toLowerCase());
      return handle;
    }
  }
  // Word bank exhausted (only possible in enormous leagues): number it.
  let n = 2;
  let handle = `${rng.pick(HANDLE_WORDS)}${n}`;
  while (reserved.has(handle.toLowerCase())) handle = `${rng.pick(HANDLE_WORDS)}${++n}`;
  reserved.add(handle.toLowerCase());
  return handle;
}

/* ── Players ──────────────────────────────────────────────────── */

/** Age curve 17–29, peaked at 19–24 like a real pro league. */
const AGE_WEIGHTS: [number, number][] = [
  [17, 5], [18, 8], [19, 11], [20, 12], [21, 12], [22, 11], [23, 10],
  [24, 9], [25, 7], [26, 6], [27, 4], [28, 3], [29, 2],
];

function rollAge(rng: Rng): number {
  return rng.weightedPick(
    AGE_WEIGHTS.map(([age]) => age),
    AGE_WEIGHTS.map(([, w]) => w),
  );
}

const ALL_MODELED: Record<AttributeKey, Provenance> = {
  laning: "modeled",
  mechanics: "modeled",
  macro: "modeled",
  teamfight: "modeled",
  aggression: "modeled",
  consistency: "modeled",
  clutch: "modeled",
  potential: "modeled",
};

function clampAttr(v: number): number {
  return round1(Math.min(19.7, Math.max(3, v)));
}

export interface GeneratePlayerOpts {
  id: string;
  role: Role;
  /** Center of the player's quality distribution (1–20 scale). */
  quality: number;
  reservedHandles: Set<string>;
  age?: number;
  /** Floor on POTENTIAL — academy prospects are raw but have runway. */
  minPotential?: number;
}

/**
 * Role-appropriate attribute distributions, reusing the OVR role-weight
 * matrix as the skew source: supports skew MACRO, ADCs skew MECHANICS, etc.
 * Younger + better players carry higher POTENTIAL.
 */
export function generatePlayer(rng: Rng, opts: GeneratePlayerOpts): Player {
  const role = opts.role;
  const age = opts.age ?? rollAge(rng);
  const q = opts.quality + rng.normal(0, 0.9);
  const weights = ROLE_WEIGHTS[role];

  const visible = {} as Record<keyof typeof weights, number>;
  for (const key of Object.keys(weights) as (keyof typeof weights)[]) {
    const skew = (weights[key] - 0.2) * 7.5;
    visible[key] = clampAttr(q + skew + rng.normal(0, 1.5));
  }

  const attributes: Attributes = {
    ...visible,
    // Veterans play steadier; the young are volatile but have runway.
    consistency: clampAttr(10.5 + (age - 21) * 0.35 + rng.normal(0, 2.2)),
    clutch: clampAttr(rng.normal(11, 2.4)),
    potential: clampAttr(
      Math.max(opts.minPotential ?? 1, q, q + (23 - age) * 0.55 + rng.normal(0, 1.2)),
    ),
  };

  const player: Player = {
    id: opts.id,
    handle: generateHandle(rng, opts.reservedHandles),
    role,
    age,
    nationality: rng.pick(FICTIONAL_NATIONS),
    attributes,
    provenance: { ...ALL_MODELED },
    ovr: computeOvr(role, attributes),
    form: 0,
    morale: 60,
    fatigue: 0,
    contract: { years: 1 + rng.int(0, 2), salary: 0 },
    seasonStats: {
      games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, cs: 0,
      damage: 0, mvps: 0, ratingSum: 0,
    },
    careerHistory: [],
  };
  player.contract.salary = salaryDemand(player);
  return player;
}

/* ── Teams & league ───────────────────────────────────────────── */

const TEAM_COUNT = 10;
/** Team-quality anchors match the real league's spread (~10.9–14.6 avg OVR). */
const ANCHOR_MIN = 10.9;
const ANCHOR_MAX = 14.6;

export interface GeneratedLeague {
  teams: Record<string, Team>;
  players: Record<string, Player>;
}

/**
 * Generate a full fictional league: 10 teams with unique names/colors,
 * role-complete rosters, and a free-agent pool. `reservedHandles` should
 * contain every real pro handle so none can leak into the fictional world.
 */
export function generateLeague(
  worldSeed: number,
  reservedHandles: Iterable<string> = [],
): GeneratedLeague {
  const rng = createRng(hashSeed(`world-${worldSeed}`));
  const reserved = new Set<string>([...reservedHandles].map((h) => h.toLowerCase()));

  const teams: Record<string, Team> = {};
  const players: Record<string, Player> = {};
  let playerCounter = 0;

  // Quality anchors spread across the band, then shuffled so the "best"
  // team isn't always the first name generated.
  const anchors = Array.from({ length: TEAM_COUNT }, (_, i) =>
    ANCHOR_MIN + ((ANCHOR_MAX - ANCHOR_MIN) * i) / (TEAM_COUNT - 1) + rng.normal(0, 0.2),
  );
  for (let i = anchors.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [anchors[i], anchors[j]] = [anchors[j], anchors[i]];
  }

  const usedNames = new Set<string>();
  const usedTags = new Set<string>();
  const colors = [...TEAM_PALETTE];

  for (let t = 0; t < TEAM_COUNT; t++) {
    let name = "";
    for (let tries = 0; tries < 40 && (name === "" || usedNames.has(name)); tries++) {
      name = `${rng.pick(TEAM_ADJECTIVES)} ${rng.pick(TEAM_NOUNS)}`;
    }
    usedNames.add(name);
    const [adj, noun] = name.split(" ");
    let shortName = (adj[0] + noun.slice(0, 2)).toUpperCase();
    let bump = 0;
    while (usedTags.has(shortName)) {
      shortName = (adj[0] + noun[0] + String.fromCharCode(88 + bump)).toUpperCase();
      bump++;
    }
    usedTags.add(shortName);

    const colorIdx = rng.int(0, colors.length - 1);
    const color = colors.splice(colorIdx, 1)[0]?.hex ?? "#c8aa6e";
    const anchor = anchors[t];
    const id = `fic-${t}`;

    const roster: string[] = [];
    const starters = {} as Record<Role, string>;
    for (const role of ROLES) {
      const p = generatePlayer(rng, {
        id: `ficp-${playerCounter++}`,
        role,
        quality: anchor,
        reservedHandles: reserved,
      });
      players[p.id] = p;
      roster.push(p.id);
      starters[role] = p.id;
    }
    // Some orgs keep a young sub.
    if (rng.chance(0.35)) {
      const p = generatePlayer(rng, {
        id: `ficp-${playerCounter++}`,
        role: rng.pick([...ROLES]),
        quality: anchor - 1.6,
        reservedHandles: reserved,
        age: 17 + rng.int(0, 2),
      });
      players[p.id] = p;
      roster.push(p.id);
    }

    teams[id] = {
      id,
      name,
      shortName,
      region: FICTIONAL_REGION,
      color,
      roster,
      starters,
      budget: Math.round(5200 + (anchor - ANCHOR_MIN) * 560 + rng.int(-150, 150)),
      record: { wins: 0, losses: 0 },
    };
  }

  // Free-agent pool: two per role, journeyman quality.
  for (const role of ROLES) {
    for (let i = 0; i < 2; i++) {
      const p = generatePlayer(rng, {
        id: `ficp-${playerCounter++}`,
        role,
        quality: 10.6 + rng.normal(0, 1),
        reservedHandles: reserved,
      });
      p.contract.years = 0;
      players[p.id] = p;
    }
  }

  return { teams, players };
}

/** Average starter OVR for a team — shared by tests and board expectations. */
export function teamAvgOvr(team: Team, players: Record<string, Player>): number {
  let sum = 0;
  for (const role of ROLES) sum += players[team.starters[role]]?.ovr ?? 0;
  return sum / 5;
}
