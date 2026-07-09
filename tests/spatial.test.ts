import { describe, expect, it } from "vitest";
import { LANE_PATHS, TURRETS, laneFront, pathPoint } from "../lib/engine/mapLayout";
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

  it("laners rotate: the bot duo doesn't camp one spot all game", () => {
    // In most games the ADC should, at some mid-game point, be far from the
    // bot-lane front (rotation, recall, or objective setup).
    let rotatedGames = 0;
    const seeds = 20;
    for (let seed = 200; seed < 200 + seeds; seed++) {
      const { result, log } = simulateSpatialMatch(blue, red, seed);
      const adcIdx = log.roles.findIndex((r, i) => r === "ADC" && i < 5);
      let rotated = false;
      const from = 8 * TICKS_PER_MINUTE;
      const to = Math.min(log.frames.length, 24 * TICKS_PER_MINUTE);
      for (let t = from; t < to; t += 10) {
        const frame = log.frames[t];
        if (frame.state[adcIdx] === "dead") continue;
        const minute = Math.floor(t / TICKS_PER_MINUTE);
        const gold = result.goldTimeline[Math.min(minute, result.goldTimeline.length - 1)];
        const front = laneFront("bot", Math.max(-1, Math.min(1, gold / 12000)));
        if (Math.hypot(frame.x[adcIdx] - front.x, frame.y[adcIdx] - front.y) > 18) {
          rotated = true;
          break;
        }
      }
      if (rotated) rotatedGames++;
    }
    expect(rotatedGames).toBeGreaterThanOrEqual(seeds * 0.6);
  });

  it("higher team MACRO puts more bodies at objective fights", () => {
    const sharpe = syntheticTeam("sharpe", 13, { macro: 17 });
    const loose = syntheticTeam("loose", 13, { macro: 7 });
    let sharpeAttendance = 0;
    let looseAttendance = 0;
    let contests = 0;
    for (let seed = 0; seed < 40; seed++) {
      const { log } = simulateSpatialMatch(sharpe, loose, seed);
      for (const tag of log.tags) {
        if (tag.kind !== "dragon" && tag.kind !== "baron" && tag.kind !== "herald") continue;
        const frame = log.frames[Math.min(tag.tick + 2, log.frames.length - 1)];
        for (let i = 0; i < 10; i++) {
          if (frame.state[i] === "dead") continue;
          const near = Math.hypot(frame.x[i] - tag.x, frame.y[i] - tag.y) <= 16;
          if (!near) continue;
          if (i < 5) sharpeAttendance++;
          else looseAttendance++;
        }
        contests++;
      }
    }
    expect(contests).toBeGreaterThan(50);
    expect(sharpeAttendance).toBeGreaterThan(looseAttendance * 1.15);
  });

  it("the losing side falls back to defend its nexus at the end", () => {
    let defendedGames = 0;
    const seeds = 20;
    for (let seed = 500; seed < 500 + seeds; seed++) {
      const { result, log } = simulateSpatialMatch(blue, red, seed);
      const losingOffset = result.winner === "blue" ? 5 : 0;
      const base = result.winner === "blue" ? { x: 92, y: 8 } : { x: 8, y: 92 };
      const lastFrame = log.frames[log.frames.length - 1];
      let home = 0;
      let aliveCount = 0;
      for (let i = losingOffset; i < losingOffset + 5; i++) {
        if (lastFrame.state[i] === "dead") continue;
        aliveCount++;
        if (Math.hypot(lastFrame.x[i] - base.x, lastFrame.y[i] - base.y) <= 30) home++;
      }
      if (aliveCount === 0 || home >= Math.min(2, aliveCount)) defendedGames++;
    }
    expect(defendedGames).toBeGreaterThanOrEqual(seeds * 0.7);
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
