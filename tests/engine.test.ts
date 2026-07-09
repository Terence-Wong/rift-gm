import { describe, expect, it } from "vitest";
import { simulateMatch, TUNING } from "../lib/engine/simulateMatch";
import { syntheticTeam } from "./helpers";

describe("simulateMatch", () => {
  it("is deterministic: same seed → identical result", () => {
    const blue = syntheticTeam("blue", 13);
    const red = syntheticTeam("red", 12);
    const a = simulateMatch(blue, red, 424242);
    const b = simulateMatch(blue, red, 424242);
    expect(a).toEqual(b);
  });

  it("different seeds produce different games", () => {
    const blue = syntheticTeam("blue", 13);
    const red = syntheticTeam("red", 13);
    const a = simulateMatch(blue, red, 1);
    const b = simulateMatch(blue, red, 2);
    expect(a.goldTimeline).not.toEqual(b.goldTimeline);
  });

  it("produces sane, finite output across many seeds", () => {
    const blue = syntheticTeam("blue", 14);
    const red = syntheticTeam("red", 11);
    for (let seed = 0; seed < 500; seed++) {
      const result = simulateMatch(blue, red, seed);
      expect(result.durationMin).toBeGreaterThanOrEqual(10);
      expect(result.durationMin).toBeLessThanOrEqual(TUNING.hardCapMin);
      expect(result.goldTimeline.length).toBe(result.durationMin + 1);
      for (const g of result.goldTimeline) {
        expect(Number.isFinite(g)).toBe(true);
        expect(Number.isNaN(g)).toBe(false);
      }
      for (const line of Object.values(result.playerLines)) {
        for (const v of [line.k, line.d, line.a, line.cs, line.dmg, line.rating]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(line.rating).toBeGreaterThanOrEqual(0);
        expect(line.rating).toBeLessThanOrEqual(10);
      }
      expect(result.events[result.events.length - 1].type).toBe("NEXUS");
      expect(result.mvpPlayerId).toBeTruthy();
      expect(Object.keys(result.playerLines)).toHaveLength(10);
    }
  });

  it("a +2 OVR edge wins ~62–68% of games", () => {
    const strong = syntheticTeam("strong", 14);
    const weak = syntheticTeam("weak", 12);
    const N = 3000;
    let strongWins = 0;
    for (let seed = 0; seed < N; seed++) {
      // Alternate sides so any side bias cancels out.
      const result =
        seed % 2 === 0
          ? simulateMatch(strong, weak, seed)
          : simulateMatch(weak, strong, seed);
      const strongSide = seed % 2 === 0 ? "blue" : "red";
      if (result.winner === strongSide) strongWins++;
    }
    const winRate = strongWins / N;
    expect(winRate).toBeGreaterThanOrEqual(0.62);
    expect(winRate).toBeLessThanOrEqual(0.68);
  });

  it("evenly matched teams are a coin flip (±4%)", () => {
    const a = syntheticTeam("a", 13);
    const b = syntheticTeam("b", 13);
    const N = 2000;
    let aWins = 0;
    for (let seed = 0; seed < N; seed++) {
      const result = seed % 2 === 0 ? simulateMatch(a, b, seed) : simulateMatch(b, a, seed);
      const aSide = seed % 2 === 0 ? "blue" : "red";
      if (result.winner === aSide) aWins++;
    }
    expect(aWins / N).toBeGreaterThanOrEqual(0.46);
    expect(aWins / N).toBeLessThanOrEqual(0.54);
  });

  it("upsets still happen with a large (+5 OVR) gap", () => {
    const strong = syntheticTeam("strong", 17);
    const weak = syntheticTeam("weak", 12);
    let weakWins = 0;
    for (let seed = 0; seed < 1000; seed++) {
      if (simulateMatch(strong, weak, seed).winner === "red") weakWins++;
    }
    expect(weakWins).toBeGreaterThan(10); // upsets exist
    expect(weakWins / 1000).toBeLessThan(0.3); // but skill dominates
  });

  it("low-consistency teams with big leads can throw", () => {
    const shaky = syntheticTeam("shaky", 15, { consistency: 4, macro: 9 });
    const steady = syntheticTeam("steady", 11, { consistency: 16 });
    let throws = 0;
    for (let seed = 0; seed < 800; seed++) {
      const result = simulateMatch(shaky, steady, seed);
      if (result.events.some((e) => e.type === "THROW")) throws++;
    }
    expect(throws).toBeGreaterThan(10);
  });
});
