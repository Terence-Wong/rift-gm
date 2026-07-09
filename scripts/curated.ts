/**
 * Hand-curated LCK 2025 dataset used when the live Oracle's Elixir fetch is
 * unavailable. Rosters are real; attribute ratings are approximate expert
 * estimates on the 1–20 scale (provenance: "modeled"), NOT scraped stats.
 * Free agents are clearly fictional prospects generated with a fixed seed.
 */

import type { Role } from "../lib/types";

export interface CuratedPlayer {
  handle: string;
  role: Role;
  age: number;
  nationality: string;
  // laning, mechanics, macro, teamfight, aggression, consistency, clutch, potential
  attrs: [number, number, number, number, number, number, number, number];
  salary: number; // thousands / year
  years: number;
}

export interface CuratedTeam {
  id: string;
  name: string;
  shortName: string;
  color: string;
  budget: number;
  players: CuratedPlayer[];
}

export const LEAGUE = "LCK";
export const SEASON_LABEL = "LCK 2025";

/**
 * Team metadata for the pipeline path, covering the full league. `aliases`
 * match the team-name strings that appear in Oracle's Elixir exports
 * (sponsor renames included). Rosters come from the data itself.
 */
export interface TeamMeta {
  id: string;
  name: string;
  shortName: string;
  color: string;
  budget: number;
  aliases: string[];
}

export const TEAM_META: TeamMeta[] = [
  { id: "gen", name: "Gen.G", shortName: "GEN", color: "#AA8B56", budget: 7200, aliases: ["Gen.G"] },
  { id: "hle", name: "Hanwha Life Esports", shortName: "HLE", color: "#F07C28", budget: 7000, aliases: ["Hanwha Life Esports"] },
  { id: "t1", name: "T1", shortName: "T1", color: "#E2012D", budget: 7400, aliases: ["T1"] },
  { id: "dk", name: "Dplus KIA", shortName: "DK", color: "#00E5BE", budget: 6200, aliases: ["Dplus Kia", "Dplus KIA"] },
  { id: "kt", name: "KT Rolster", shortName: "KT", color: "#FF0A07", budget: 5800, aliases: ["KT Rolster", "kt Rolster"] },
  { id: "drx", name: "DRX", shortName: "DRX", color: "#5A8DFF", budget: 5200, aliases: ["DRX", "Kiwoom DRX"] },
  { id: "ns", name: "Nongshim RedForce", shortName: "NS", color: "#DE2027", budget: 5400, aliases: ["Nongshim RedForce"] },
  { id: "bfx", name: "BNK FEARX", shortName: "BFX", color: "#FFC900", budget: 4800, aliases: ["BNK FEARX", "BNK FearX"] },
  { id: "bro", name: "HANJIN BRION", shortName: "BRO", color: "#2FBF71", budget: 4600, aliases: ["HANJIN BRION", "OKSavingsBank BRION", "BRION"] },
  { id: "dns", name: "DN SOOPers", shortName: "DNS", color: "#4C6EF5", budget: 4600, aliases: ["DN SOOPers", "DN Freecs", "Kwangdong Freecs"] },
];

export const CURATED_TEAMS: CuratedTeam[] = [
  {
    id: "gen",
    name: "Gen.G",
    shortName: "GEN",
    color: "#AA8B56",
    budget: 7200,
    players: [
      { handle: "Kiin", role: "TOP", age: 26, nationality: "KR", attrs: [17, 16, 17, 16, 12, 17, 16, 12], salary: 1100, years: 2 },
      { handle: "Canyon", role: "JGL", age: 24, nationality: "KR", attrs: [15, 18, 19, 18, 15, 17, 17, 14], salary: 1400, years: 2 },
      { handle: "Chovy", role: "MID", age: 24, nationality: "KR", attrs: [20, 19, 17, 16, 11, 19, 14, 14], salary: 1500, years: 3 },
      { handle: "Ruler", role: "ADC", age: 26, nationality: "KR", attrs: [18, 19, 16, 19, 12, 18, 18, 11], salary: 1400, years: 2 },
      { handle: "Duro", role: "SUP", age: 21, nationality: "KR", attrs: [13, 14, 14, 15, 14, 12, 12, 16], salary: 350, years: 2 },
    ],
  },
  {
    id: "hle",
    name: "Hanwha Life Esports",
    shortName: "HLE",
    color: "#F07C28",
    budget: 7000,
    players: [
      { handle: "Zeus", role: "TOP", age: 21, nationality: "KR", attrs: [18, 19, 14, 17, 16, 14, 15, 18], salary: 1300, years: 2 },
      { handle: "Peanut", role: "JGL", age: 27, nationality: "KR", attrs: [13, 15, 18, 16, 14, 16, 15, 10], salary: 900, years: 1 },
      { handle: "Zeka", role: "MID", age: 24, nationality: "KR", attrs: [16, 18, 15, 18, 15, 14, 19, 13], salary: 1200, years: 2 },
      { handle: "Viper", role: "ADC", age: 24, nationality: "KR", attrs: [18, 19, 16, 19, 13, 18, 17, 13], salary: 1400, years: 3 },
      { handle: "Delight", role: "SUP", age: 24, nationality: "KR", attrs: [12, 13, 16, 16, 13, 15, 13, 12], salary: 500, years: 2 },
    ],
  },
  {
    id: "t1",
    name: "T1",
    shortName: "T1",
    color: "#E2012D",
    budget: 7400,
    players: [
      { handle: "Doran", role: "TOP", age: 25, nationality: "KR", attrs: [15, 15, 14, 15, 14, 11, 14, 12], salary: 800, years: 1 },
      { handle: "Oner", role: "JGL", age: 22, nationality: "KR", attrs: [14, 17, 17, 17, 16, 15, 17, 15], salary: 1100, years: 2 },
      { handle: "Faker", role: "MID", age: 29, nationality: "KR", attrs: [15, 16, 20, 18, 10, 17, 20, 8], salary: 1500, years: 3 },
      { handle: "Gumayusi", role: "ADC", age: 23, nationality: "KR", attrs: [17, 18, 15, 17, 12, 15, 17, 14], salary: 1100, years: 2 },
      { handle: "Keria", role: "SUP", age: 23, nationality: "KR", attrs: [14, 18, 19, 18, 16, 15, 18, 15], salary: 1300, years: 2 },
    ],
  },
  {
    id: "dk",
    name: "Dplus KIA",
    shortName: "DK",
    color: "#00E5BE",
    budget: 6200,
    players: [
      { handle: "Siwoo", role: "TOP", age: 19, nationality: "KR", attrs: [14, 15, 11, 13, 15, 10, 11, 18], salary: 300, years: 3 },
      { handle: "Lucid", role: "JGL", age: 20, nationality: "KR", attrs: [13, 15, 15, 15, 13, 13, 12, 17], salary: 500, years: 3 },
      { handle: "ShowMaker", role: "MID", age: 25, nationality: "KR", attrs: [15, 16, 17, 16, 11, 15, 15, 11], salary: 1000, years: 2 },
      { handle: "Aiming", role: "ADC", age: 25, nationality: "KR", attrs: [15, 17, 13, 16, 14, 12, 13, 11], salary: 800, years: 1 },
      { handle: "BeryL", role: "SUP", age: 28, nationality: "KR", attrs: [10, 12, 18, 15, 12, 14, 15, 8], salary: 700, years: 1 },
    ],
  },
  {
    id: "kt",
    name: "KT Rolster",
    shortName: "KT",
    color: "#FF0A07",
    budget: 5800,
    players: [
      { handle: "PerfecT", role: "TOP", age: 21, nationality: "KR", attrs: [14, 15, 13, 14, 13, 12, 12, 16], salary: 400, years: 2 },
      { handle: "Cuzz", role: "JGL", age: 26, nationality: "KR", attrs: [13, 14, 16, 15, 12, 14, 12, 10], salary: 700, years: 1 },
      { handle: "Bdd", role: "MID", age: 26, nationality: "KR", attrs: [16, 16, 16, 16, 10, 16, 14, 10], salary: 900, years: 2 },
      { handle: "deokdam", role: "ADC", age: 25, nationality: "KR", attrs: [14, 15, 13, 15, 12, 13, 12, 11], salary: 600, years: 1 },
      { handle: "Way", role: "SUP", age: 22, nationality: "KR", attrs: [11, 12, 13, 13, 12, 11, 11, 14], salary: 250, years: 2 },
    ],
  },
  {
    id: "drx",
    name: "DRX",
    shortName: "DRX",
    color: "#5A8DFF",
    budget: 5200,
    players: [
      { handle: "Rich", role: "TOP", age: 27, nationality: "KR", attrs: [12, 13, 13, 13, 12, 12, 12, 9], salary: 450, years: 1 },
      { handle: "Sponge", role: "JGL", age: 21, nationality: "KR", attrs: [12, 13, 13, 13, 14, 11, 11, 15], salary: 300, years: 2 },
      { handle: "Ucal", role: "MID", age: 25, nationality: "KR", attrs: [14, 14, 13, 14, 12, 11, 12, 10], salary: 500, years: 1 },
      { handle: "Teddy", role: "ADC", age: 27, nationality: "KR", attrs: [14, 15, 12, 14, 10, 14, 13, 9], salary: 600, years: 1 },
      { handle: "Andil", role: "SUP", age: 22, nationality: "KR", attrs: [10, 12, 12, 13, 13, 10, 11, 14], salary: 250, years: 2 },
    ],
  },
  {
    id: "ns",
    name: "Nongshim RedForce",
    shortName: "NS",
    color: "#DE2027",
    budget: 5400,
    players: [
      { handle: "Kingen", role: "TOP", age: 25, nationality: "KR", attrs: [13, 14, 13, 15, 12, 12, 16, 10], salary: 550, years: 1 },
      { handle: "GIDEON", role: "JGL", age: 22, nationality: "KR", attrs: [12, 14, 13, 14, 15, 11, 12, 15], salary: 350, years: 2 },
      { handle: "Fisher", role: "MID", age: 21, nationality: "KR", attrs: [13, 15, 12, 13, 14, 10, 11, 16], salary: 300, years: 2 },
      { handle: "Jiwoo", role: "ADC", age: 21, nationality: "KR", attrs: [14, 16, 12, 15, 14, 12, 12, 16], salary: 450, years: 2 },
      { handle: "Lehends", role: "SUP", age: 27, nationality: "KR", attrs: [11, 13, 17, 16, 14, 14, 14, 9], salary: 700, years: 1 },
    ],
  },
  {
    id: "bfx",
    name: "BNK FEARX",
    shortName: "BFX",
    color: "#FFC900",
    budget: 4800,
    players: [
      { handle: "Clear", role: "TOP", age: 22, nationality: "KR", attrs: [12, 13, 12, 13, 12, 11, 11, 14], salary: 250, years: 2 },
      { handle: "Raptor", role: "JGL", age: 23, nationality: "KR", attrs: [12, 13, 13, 13, 14, 11, 11, 13], salary: 250, years: 1 },
      { handle: "VicLa", role: "MID", age: 23, nationality: "KR", attrs: [13, 14, 13, 13, 13, 11, 12, 13], salary: 400, years: 1 },
      { handle: "Diable", role: "ADC", age: 21, nationality: "KR", attrs: [12, 14, 11, 13, 13, 10, 11, 15], salary: 250, years: 2 },
      { handle: "Kellin", role: "SUP", age: 25, nationality: "KR", attrs: [11, 12, 14, 14, 11, 13, 12, 10], salary: 300, years: 1 },
    ],
  },
];

/** Fictional prospect name pool for free agents / youth intake. */
export const PROSPECT_HANDLES = [
  "Haru",
  "Bitmap",
  "Cricket",
  "Dawnfall",
  "Ember",
  "Fjord",
  "Glacier",
  "Halcyon",
  "Ion",
  "Juniper",
  "Kestrel",
  "Lumen",
  "Mistral",
  "Nadir",
  "Onyx",
  "Pylon",
  "Quartz",
  "Riptide",
  "Sable",
  "Tundra",
  "Umbra",
  "Vantage",
  "Wisp",
  "Zephyr",
];

export const CURATED_CHAMPIONS: { id: string; name: string; roles: string[] }[] = [
  { id: "Aatrox", name: "Aatrox", roles: ["TOP"] },
  { id: "Ahri", name: "Ahri", roles: ["MID"] },
  { id: "Ashe", name: "Ashe", roles: ["ADC", "SUP"] },
  { id: "Azir", name: "Azir", roles: ["MID"] },
  { id: "Corki", name: "Corki", roles: ["MID", "ADC"] },
  { id: "Ezreal", name: "Ezreal", roles: ["ADC"] },
  { id: "Gnar", name: "Gnar", roles: ["TOP"] },
  { id: "Jax", name: "Jax", roles: ["TOP", "JGL"] },
  { id: "KSante", name: "K'Sante", roles: ["TOP"] },
  { id: "Kaisa", name: "Kai'Sa", roles: ["ADC"] },
  { id: "Leesin", name: "Lee Sin", roles: ["JGL"] },
  { id: "Nautilus", name: "Nautilus", roles: ["SUP"] },
  { id: "Orianna", name: "Orianna", roles: ["MID"] },
  { id: "Rakan", name: "Rakan", roles: ["SUP"] },
  { id: "Sejuani", name: "Sejuani", roles: ["JGL"] },
  { id: "Varus", name: "Varus", roles: ["ADC"] },
  { id: "Vi", name: "Vi", roles: ["JGL"] },
  { id: "Viktor", name: "Viktor", roles: ["MID"] },
  { id: "Renataglasc", name: "Renata Glasc", roles: ["SUP"] },
  { id: "Rumble", name: "Rumble", roles: ["TOP", "MID"] },
];
