/**
 * Procedural crest specs for created teams: 3 layers (shape × glyph ×
 * pattern) seeded from the team name, so the same name always yields the
 * same crest. Rendering lives in components/TeamCrest.tsx; this module is
 * pure data so it can be unit-tested.
 */

import { hashSeed } from "./engine/rng";

export const CREST_SHAPE_COUNT = 5; // shield | hex | diamond | pennant | badge
export const CREST_GLYPH_COUNT = 8; // star | bolt | blade | wing | crown | fang | orb | arrow
export const CREST_PATTERN_COUNT = 5; // none | stripes | chevron | dots | split

export interface CrestSpec {
  shape: number;
  glyph: number;
  pattern: number;
}

/** Deterministic: the crest is a pure function of the team name. */
export function crestSpecFor(name: string): CrestSpec {
  const h = hashSeed(`crest:${name.trim().toLowerCase()}`);
  return {
    shape: h % CREST_SHAPE_COUNT,
    glyph: Math.floor(h / 7) % CREST_GLYPH_COUNT,
    pattern: Math.floor(h / 61) % CREST_PATTERN_COUNT,
  };
}
