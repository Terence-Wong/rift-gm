import { describe, expect, it } from "vitest";
import { LANE_PATHS, TURRETS, pathPoint } from "../lib/engine/mapLayout";
import {
  TICKS_PER_MINUTE,
  respawnTicks,
  simulateSpatialMatch,
} from "../lib/engine/spatial";
import { simulateMatch } from "../lib/engine/simulateMatch";
import { syntheticTeam } from "./helpers";

describe("map layout", () => {
  it("defines 22 turrets (3 per lane per side + 2 nexus per side)", () => {
    expect(TURRETS).toHaveLength(22);
    expect(TURRETS.filter((t) => t.side === "blue")).toHaveLength(11);
    expect(TURRETS.filter((t) => t.lane === "nexus")).toHaveLength(4);
  });

  it("lane paths run blue base → red base and stay in bounds", () => {
    for (const path of Object.values(LANE_PATHS)) {
      expect(path[0]).toEqual({ x: 8, y: 92 });
      expect(path[path.length - 1]).toEqual({ x: 92, y: 8 });
      for (const p of path) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(100);
      }
    }
    const mid = pathPoint(LANE_PATHS.mid, 0.5);
    expect(mid.x).toBeCloseTo(50, 0);
    expect(mid.y).toBeCloseTo(50, 0);
  });
});

describe("spatial simulation", () => {
  const blue = syntheticTeam("blue", 13);
  const red = syntheticTeam("red", 12);

  it("is deterministic: same seed → identical result AND identical position log", () => {
    const a = simulateSpatialMatch(blue, red, 987654);
    const b = simulateSpatialMatch(blue, red, 987654);
    expect(a.result).toEqual(b.result);
    expect(a.log).toEqual(b.log);
  });

  it("strategic outcome matches quick-sim exactly for the same seed", () => {
    for (let seed = 100; seed < 130; seed++) {
      const spatial = simulateSpatialMatch(blue, red, seed);
      const quick = simulateMatch(blue, red, seed);
      expect(spatial.result.winner).toBe(quick.winner);
      expect(spatial.result.durationMin).toBe(quick.durationMin);
      expect(spatial.result.goldTimeline).toEqual(quick.goldTimeline);
      // Team-level kill totals also agree (attribution differs, counts don't).
      const teamKills = (r: typeof quick, ids: string[]) =>
        ids.reduce((sum, id) => sum + r.playerLines[id].k, 0);
      const blueIds = blue.players.map((p) => p.id);
      expect(teamKills(spatial.result, blueIds)).toBe(teamKills(quick, blueIds));
    }
  });

  it("KDA is consistent: team kills equal opposing team deaths", () => {
    for (let seed = 0; seed < 60; seed++) {
      const { result, log } = simulateSpatialMatch(blue, red, seed);
      const sum = (ids: string[], key: "k" | "d" | "a") =>
        ids.reduce((total, id) => total + result.playerLines[id][key], 0);
      const blueIds = blue.players.map((p) => p.id);
      const redIds = red.players.map((p) => p.id);
      expect(sum(blueIds, "k")).toBe(sum(redIds, "d"));
      expect(sum(redIds, "k")).toBe(sum(blueIds, "d"));
      // Assists never exceed 4 per kill.
      expect(sum(blueIds, "a")).toBeLessThanOrEqual(sum(blueIds, "k") * 4);
      // Spatially recorded kills are a subset of (usually equal to) the totals.
      expect(log.kills.length).toBeLessThanOrEqual(sum(blueIds, "k") + sum(redIds, "k"));
    }
  });

  it("kills come from spatial events: killer/victim were present and alive", () => {
    for (let seed = 7; seed < 27; seed++) {
      const { log } = simulateSpatialMatch(blue, red, seed);
      for (const kill of log.kills) {
        const frame = log.frames[kill.tick];
        expect(frame).toBeTruthy();
        // Victim is dead in the frame recorded at the kill tick…
        expect(frame.state[kill.victim]).toBe("dead");
        // …and the killer is not (unless they traded — died to a same-tick kill).
        const traded = log.kills.some(
          (k2) => k2.victim === kill.killer && k2.tick <= kill.tick && k2.respawnTick > kill.tick,
        );
        if (!traded) expect(frame.state[kill.killer]).not.toBe("dead");
        // Killer and victim are on opposite sides.
        expect(kill.killer < 5).not.toBe(kill.victim < 5);
        // Killer stood near the victim when it happened.
        const dx = frame.x[kill.killer] - frame.x[kill.victim];
        const dy = frame.y[kill.killer] - frame.y[kill.victim];
        expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(24);
      }
    }
  });

  it("respawn timers are sane and scale with game time", () => {
    expect(respawnTicks(2)).toBeGreaterThanOrEqual(4);
    expect(respawnTicks(35)).toBeLessThanOrEqual(27);
    expect(respawnTicks(30)).toBeGreaterThan(respawnTicks(5));
    for (let seed = 40; seed < 55; seed++) {
      const { log } = simulateSpatialMatch(blue, red, seed);
      for (const kill of log.kills) {
        const waited = kill.respawnTick - kill.tick;
        expect(waited).toBeGreaterThanOrEqual(4);
        expect(waited).toBeLessThanOrEqual(27);
        // Dead the whole time, alive again after (when the game is still going).
        const mid = log.frames[Math.min(kill.respawnTick - 1, log.frames.length - 1)];
        if (kill.respawnTick - 1 < log.frames.length) {
          expect(mid.state[kill.victim]).toBe("dead");
        }
        const after = log.frames[kill.respawnTick + 1];
        if (after) {
          // May have died again only if another kill claims them later.
          const diedAgain = log.kills.some(
            (k2) => k2.victim === kill.victim && k2.tick > kill.tick && k2.tick <= kill.respawnTick + 1,
          );
          if (!diedAgain) expect(after.state[kill.victim]).not.toBe("dead");
        }
      }
    }
  });

  it("produces a full-length in-bounds position log", () => {
    const { result, log } = simulateSpatialMatch(blue, red, 31337);
    expect(log.durationTicks).toBe(result.durationMin * TICKS_PER_MINUTE);
    expect(log.frames).toHaveLength(log.durationTicks);
    expect(log.unitIds).toHaveLength(10);
    for (const frame of log.frames) {
      for (let i = 0; i < 10; i++) {
        expect(frame.x[i]).toBeGreaterThanOrEqual(0);
        expect(frame.x[i]).toBeLessThanOrEqual(100);
        expect(frame.y[i]).toBeGreaterThanOrEqual(0);
        expect(frame.y[i]).toBeLessThanOrEqual(100);
      }
    }
    // Units actually move around the map.
    const first = log.frames[0];
    const later = log.frames[Math.floor(log.frames.length / 2)];
    const moved = log.unitIds.filter(
      (_, i) => Math.hypot(later.x[i] - first.x[i], later.y[i] - first.y[i]) > 10,
    );
    expect(moved.length).toBeGreaterThanOrEqual(6);
  });

  it("CS accrues from time spent farming (carries > supports)", () => {
    const { result } = simulateSpatialMatch(blue, red, 4242);
    const byRole = (team: typeof blue, role: string) =>
      team.players.find((p) => p.role === role)!.id;
    for (const team of [blue, red]) {
      const adc = result.playerLines[byRole(team, "ADC")].cs;
      const sup = result.playerLines[byRole(team, "SUP")].cs;
      expect(adc).toBeGreaterThan(sup * 2);
      expect(adc).toBeGreaterThan(80);
    }
  });
});
