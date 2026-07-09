import { beforeEach, describe, expect, it } from "vitest";
import v1Fixture from "./fixtures/v1-save.json";
import { migrateSave, SAVE_VERSION, useGameStore, type GameData } from "../lib/store";

describe("save migration (v1 → v2)", () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it("migrateSave fills v2 defaults on a v1 payload and is idempotent", () => {
    const v1 = v1Fixture.data as unknown as Partial<GameData>;
    expect(v1.saveVersion).toBeUndefined();
    expect(v1.dataMode).toBeUndefined();

    const migrated = migrateSave(v1);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.dataMode).toBe("real");
    expect(migrated.worldSeed).toBeNull();
    expect(migrated.difficulty).toBe("standard");
    expect(migrated.expansionDraft).toBeNull();
    // Old saves never see the tutorial: marked complete.
    expect(migrated.tutorial).toEqual({ active: false, step: "DONE" });
    expect(migrated.powerRankings).toEqual([]);
    expect(migrated.rivalries).toEqual({});
    // Original v1 content untouched.
    expect(migrated.saveName).toBe("V1 Veteran");
    expect(migrated.week).toBe(3);

    expect(migrateSave(migrated)).toEqual(migrated);
  });

  it("a v1 fixture save loads via loadSnapshot and keeps playing", () => {
    useGameStore
      .getState()
      .loadSnapshot(v1Fixture.data as unknown as GameData);
    let s = useGameStore.getState();
    expect(s.initialized).toBe(true);
    expect(s.saveVersion).toBe(SAVE_VERSION);
    expect(s.dataMode).toBe("real");
    expect(s.tutorial).toEqual({ active: false, step: "DONE" });
    expect(s.playerTeamId).toBe("t1");
    expect(s.week).toBe(3);
    // Two weeks of v1 results survived the trip.
    expect(s.fixtures.filter((f) => f.result).length).toBe(10);

    // The migrated save simulates forward through a whole season.
    let guard = 0;
    while (useGameStore.getState().phase !== "OFFSEASON" && guard < 80) {
      useGameStore.getState().quickSimWeek();
      guard++;
    }
    s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");
    expect(s.history).toHaveLength(1);
    // v2 systems came alive on the old save.
    expect(s.powerRankings.length).toBeGreaterThan(0);
    expect(Object.values(s.rivalries).reduce((a, v) => a + v, 0)).toBeGreaterThanOrEqual(3);
    expect(s.history[0].awards).toBeTruthy();
  });
});
