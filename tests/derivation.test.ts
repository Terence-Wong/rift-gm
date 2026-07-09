import { describe, expect, it } from "vitest";
import {
  computeOvr,
  percentileRank,
  percentileToAttribute,
  ROLE_WEIGHTS,
} from "../lib/attributes";
import { flatAttributes } from "./helpers";

describe("attribute derivation", () => {
  it("percentileToAttribute stays within 1–20", () => {
    for (let p = -0.5; p <= 1.5; p += 0.01) {
      const v = percentileToAttribute(p);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
    }
    expect(percentileToAttribute(0)).toBeCloseTo(1, 5);
    expect(percentileToAttribute(1)).toBeGreaterThan(18);
  });

  it("percentileRank is role-relative and monotonic", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentileRank(1, values)).toBeLessThan(percentileRank(10, values));
    expect(percentileRank(10, values)).toBe(1);
    expect(percentileRank(1, values)).toBe(0);
    // Midrank for ties.
    expect(percentileRank(5, [5, 5, 5])).toBeCloseTo(0.5, 5);
  });

  it("role weights sum to 1 for every role", () => {
    for (const weights of Object.values(ROLE_WEIGHTS)) {
      const sum = Object.values(weights).reduce((a, v) => a + v, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it("OVR equals the flat attribute value for uniform players", () => {
    expect(computeOvr("MID", flatAttributes(14))).toBeCloseTo(14, 1);
  });
});

describe("bundled data", () => {
  it("players.json attributes are within 1–20 and OVR is consistent", async () => {
    const players = (await import("../data/players.json")).default;
    expect(players.length).toBeGreaterThanOrEqual(40);
    for (const p of players) {
      for (const v of Object.values(p.attributes)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(20);
      }
      expect(p.ovr).toBeGreaterThanOrEqual(1);
      expect(p.ovr).toBeLessThanOrEqual(20);
    }
  });

  it("teams.json rosters reference real players with all five roles", async () => {
    const players = (await import("../data/players.json")).default;
    const teams = (await import("../data/teams.json")).default;
    const ids = new Set(players.map((p) => p.id));
    expect(teams.length).toBeGreaterThanOrEqual(8);
    for (const t of teams) {
      expect(t.roster.length).toBeGreaterThanOrEqual(5);
      for (const pid of t.roster) expect(ids.has(pid)).toBe(true);
      for (const role of ["TOP", "JGL", "MID", "ADC", "SUP"] as const) {
        expect(ids.has(t.starters[role])).toBe(true);
      }
    }
  });
});
