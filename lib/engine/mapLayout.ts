/**
 * Shared map geometry for the spatial simulation and the canvas renderer —
 * one source of truth so the engine and the view never disagree about where
 * a lane, pit, or turret sits. Normalized 0–100 × 0–100, screen coordinates
 * (y grows downward): blue base bottom-left, red base top-right.
 *
 * This is an original stylized abstraction, not a copy of Riot's minimap.
 */

export interface Pt {
  x: number;
  y: number;
}

export type MapSide = "blue" | "red";
export type LaneId = "top" | "mid" | "bot";

export const MAP_SIZE = 100;

export const BASES: Record<MapSide, Pt> = {
  blue: { x: 8, y: 92 },
  red: { x: 92, y: 8 },
};

/** Lane waypoint polylines, always ordered blue base → red base. */
export const LANE_PATHS: Record<LaneId, Pt[]> = {
  top: [
    { x: 8, y: 92 },
    { x: 7.5, y: 72 },
    { x: 7.5, y: 30 },
    { x: 9, y: 12 },
    { x: 12, y: 9 },
    { x: 30, y: 7.5 },
    { x: 72, y: 7.5 },
    { x: 92, y: 8 },
  ],
  mid: [
    { x: 8, y: 92 },
    { x: 24, y: 76 },
    { x: 50, y: 50 },
    { x: 76, y: 24 },
    { x: 92, y: 8 },
  ],
  bot: [
    { x: 8, y: 92 },
    { x: 28, y: 92.5 },
    { x: 70, y: 92.5 },
    { x: 88, y: 91 },
    { x: 91, y: 88 },
    { x: 92.5, y: 70 },
    { x: 92.5, y: 28 },
    { x: 92, y: 8 },
  ],
};

/** The river crosses the mid diagonal perpendicular, top-left → bottom-right. */
export const RIVER_PATH: Pt[] = [
  { x: 24, y: 24 },
  { x: 38, y: 40 },
  { x: 50, y: 50 },
  { x: 62, y: 60 },
  { x: 76, y: 76 },
];

/** Baron pit sits in the top half of the river, dragon in the bot half. */
export const BARON_PIT: Pt = { x: 40, y: 41 };
export const DRAGON_PIT: Pt = { x: 60, y: 59 };

/** Seeded roam spots per side (stylized jungle camps). */
export const JUNGLE_CAMPS: Record<MapSide, Pt[]> = {
  blue: [
    { x: 21, y: 60 },
    { x: 32, y: 70 },
    { x: 54, y: 78 },
    { x: 68, y: 84 },
  ],
  red: [
    { x: 79, y: 40 },
    { x: 68, y: 30 },
    { x: 46, y: 22 },
    { x: 32, y: 16 },
  ],
};

export interface TurretSpot {
  side: MapSide;
  lane: LaneId | "nexus";
  /** 1 = outer, 2 = inner, 3 = inhibitor, 4 = nexus twin. */
  tier: 1 | 2 | 3 | 4;
  pos: Pt;
}

export function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function pathLength(path: Pt[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += dist(path[i - 1], path[i]);
  return len;
}

/** Point at arc-length fraction t (0 = blue base end, 1 = red base end). */
export function pathPoint(path: Pt[], t: number): Pt {
  const clamped = Math.min(1, Math.max(0, t));
  const target = pathLength(path) * clamped;
  let walked = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = dist(path[i - 1], path[i]);
    if (walked + seg >= target) {
      return lerpPt(path[i - 1], path[i], seg === 0 ? 0 : (target - walked) / seg);
    }
    walked += seg;
  }
  return path[path.length - 1];
}

/** Lane-path fractions per turret tier, from each side's own base. */
const TURRET_FRACTIONS: Record<1 | 2 | 3, number> = { 1: 0.42, 2: 0.3, 3: 0.19 };

function laneTurrets(side: MapSide, lane: LaneId): TurretSpot[] {
  const spots: TurretSpot[] = [];
  for (const tier of [1, 2, 3] as const) {
    const f = TURRET_FRACTIONS[tier];
    const t = side === "blue" ? f : 1 - f;
    spots.push({ side, lane, tier, pos: pathPoint(LANE_PATHS[lane], t) });
  }
  return spots;
}

/** All 22 turrets: 3 per lane per side + 2 nexus turrets per side. */
export const TURRETS: TurretSpot[] = [
  ...(["top", "mid", "bot"] as LaneId[]).flatMap((lane) => [
    ...laneTurrets("blue", lane),
    ...laneTurrets("red", lane),
  ]),
  { side: "blue", lane: "nexus", tier: 4, pos: { x: 13, y: 84 } },
  { side: "blue", lane: "nexus", tier: 4, pos: { x: 16, y: 87 } },
  { side: "red", lane: "nexus", tier: 4, pos: { x: 87, y: 16 } },
  { side: "red", lane: "nexus", tier: 4, pos: { x: 84, y: 13 } },
];

/** Where a lane's front sits given a normalized pressure value (−1…+1, + = blue pushing). */
export function laneFront(lane: LaneId, pressure: number): Pt {
  const t = 0.5 + Math.min(0.24, Math.max(-0.24, pressure * 0.22));
  return pathPoint(LANE_PATHS[lane], t);
}
