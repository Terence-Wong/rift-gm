import { describe, expect, it } from "vitest";
import realPlayers from "../data/players.json";
import realTeams from "../data/teams.json";
import { generateHandle, generateLeague, teamAvgOvr } from "../lib/engine/generate";
import { createRng } from "../lib/engine/rng";
import { contrastsWithVoid, TEAM_PALETTE } from "../lib/palette";
import { ROLES, type Player, type Team } from "../lib/types";

const REAL_HANDLES = (realPlayers as unknown as Player[]).map((p) => p.handle);

describe("team palette", () => {
  it("every curated color clears 3:1 contrast against the void background", () => {
    for (const c of TEAM_PALETTE) {
      expect(contrastsWithVoid(c.hex), `${c.name} ${c.hex}`).toBe(true);
    }
  });
});

describe("handle generator", () => {
  it("never produces a reserved (real pro) handle, case-insensitively", () => {
    const rng = createRng(7);
    const reserved = new Set(REAL_HANDLES.map((h) => h.toLowerCase()));
    const before = new Set(reserved);
    for (let i = 0; i < 500; i++) {
      const handle = generateHandle(rng, reserved);
      expect(before.has(handle.toLowerCase())).toBe(false);
      expect(handle.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("is unique within a run", () => {
    const rng = createRng(9);
    const reserved = new Set<string>();
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const handle = generateHandle(rng, reserved);
      expect(seen.has(handle.toLowerCase())).toBe(false);
      seen.add(handle.toLowerCase());
    }
  });
});

describe("league generator", () => {
  it("is deterministic per world seed", () => {
    const a = generateLeague(12345, REAL_HANDLES);
    const b = generateLeague(12345, REAL_HANDLES);
    expect(a).toEqual(b);
    const c = generateLeague(54321, REAL_HANDLES);
    expect(Object.values(c.teams).map((t) => t.name)).not.toEqual(
      Object.values(a.teams).map((t) => t.name),
    );
  });

  it("generates a complete, bounded league (10 teams, all roles staffed)", () => {
    for (const seed of [1, 999, 424242]) {
      const league = generateLeague(seed, REAL_HANDLES);
      const teams = Object.values(league.teams);
      expect(teams).toHaveLength(10);
      const names = new Set(teams.map((t) => t.name));
      const tags = new Set(teams.map((t) => t.shortName));
      expect(names.size).toBe(10);
      expect(tags.size).toBe(10);
      for (const team of teams) {
        expect(team.shortName.length).toBeGreaterThanOrEqual(2);
        expect(team.shortName.length).toBeLessThanOrEqual(5);
        for (const role of ROLES) {
          const starter = league.players[team.starters[role]];
          expect(starter, `${team.name} missing ${role}`).toBeTruthy();
          expect(starter.role).toBe(role);
        }
      }
      for (const p of Object.values(league.players)) {
        expect(p.age).toBeGreaterThanOrEqual(17);
        expect(p.age).toBeLessThanOrEqual(29);
        for (const v of Object.values(p.attributes)) {
          expect(v).toBeGreaterThanOrEqual(1);
          expect(v).toBeLessThanOrEqual(20);
        }
        expect(p.ovr).toBeGreaterThanOrEqual(1);
        expect(p.ovr).toBeLessThanOrEqual(20);
        // Fictional players carry no real-data provenance at all.
        expect(Object.values(p.provenance).every((prov) => prov === "modeled")).toBe(true);
        expect(p.rawMetrics).toBeUndefined();
      }
      // Free agents exist for roster building.
      const rostered = new Set(teams.flatMap((t) => t.roster));
      const fa = Object.keys(league.players).filter((id) => !rostered.has(id));
      expect(fa.length).toBeGreaterThanOrEqual(8);
    }
  });

  it("no real pro handle leaks into any generated world", () => {
    const real = new Set(REAL_HANDLES.map((h) => h.toLowerCase()));
    for (const seed of [3, 77, 20260709]) {
      const league = generateLeague(seed, REAL_HANDLES);
      for (const p of Object.values(league.players)) {
        expect(real.has(p.handle.toLowerCase()), p.handle).toBe(false);
      }
    }
  });

  it("balance guard: generated OVR spread roughly matches the real league", () => {
    const realById = Object.fromEntries((realPlayers as unknown as Player[]).map((p) => [p.id, p]));
    const realAvgs = (realTeams as unknown as Team[]).map((t) =>
      ROLES.reduce((sum, r) => sum + realById[t.starters[r]].ovr, 0) / 5,
    );
    const stats = (avgs: number[]) => {
      const mean = avgs.reduce((a, v) => a + v, 0) / avgs.length;
      const sd = Math.sqrt(avgs.reduce((a, v) => a + (v - mean) ** 2, 0) / avgs.length);
      return { mean, sd, range: Math.max(...avgs) - Math.min(...avgs) };
    };
    const real = stats(realAvgs);

    for (const seed of [11, 222, 3333, 44444]) {
      const league = generateLeague(seed, REAL_HANDLES);
      const gen = stats(
        Object.values(league.teams).map((t) => teamAvgOvr(t, league.players)),
      );
      expect(Math.abs(gen.mean - real.mean)).toBeLessThanOrEqual(1.0);
      expect(gen.sd).toBeGreaterThanOrEqual(real.sd * 0.5);
      expect(gen.sd).toBeLessThanOrEqual(real.sd * 1.6);
      expect(gen.range).toBeGreaterThanOrEqual(real.range * 0.55);
      expect(gen.range).toBeLessThanOrEqual(real.range * 1.6);
    }
  });
});
