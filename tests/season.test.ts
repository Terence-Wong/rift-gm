import { beforeEach, describe, expect, it } from "vitest";
import realPlayers from "../data/players.json";
import { standingsOf, useGameStore, userFixtureThisWeek, userSeries } from "../lib/store";

describe("full season smoke test", () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it("plays start → playoffs → offseason → next season without throwing", () => {
    const store = useGameStore.getState();
    const teams = Object.keys(useGameStore.getState().teams);
    expect(teams).toHaveLength(0);

    store.newGame({ teamId: "t1", saveName: "Smoke Test", dataMode: "real" });
    let s = useGameStore.getState();
    expect(s.initialized).toBe(true);
    expect(Object.keys(s.teams).length).toBeGreaterThanOrEqual(8);
    expect(s.fixtures.length).toBeGreaterThan(0);
    expect(userFixtureThisWeek(s)).toBeTruthy();

    // Run the whole regular season + playoffs via quick sim.
    let guard = 0;
    while (useGameStore.getState().phase !== "OFFSEASON" && guard < 80) {
      useGameStore.getState().quickSimWeek();
      guard++;
    }
    s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");
    expect(guard).toBeLessThan(80);

    // Every regular-season fixture resolved; standings consistent.
    expect(s.fixtures.every((f) => f.result)).toBe(true);
    const standings = standingsOf(s);
    const teamCount = Object.keys(s.teams).length;
    const totalGames = s.fixtures.length;
    const totalWins = standings.reduce((sum, r) => sum + r.wins, 0);
    expect(totalWins).toBe(totalGames);
    expect(standings).toHaveLength(teamCount);

    // Playoffs produced a champion and a history entry.
    const final = s.playoffs.find((p) => p.round === "FINAL");
    expect(final?.winnerId).toBeTruthy();
    expect(s.history).toHaveLength(1);
    expect(s.history[0].champion).toBeTruthy();

    // Players accumulated stats.
    const withGames = Object.values(s.players).filter((p) => p.seasonStats.games > 0);
    expect(withGames.length).toBeGreaterThan(30);

    // Roll into next season (unless fired — then take an offer first).
    if (useGameStore.getState().board.fired) {
      const offer = useGameStore.getState().jobOffers[0];
      expect(offer).toBeTruthy();
      useGameStore.getState().acceptJobOffer(offer);
    }
    useGameStore.getState().startNextSeason();
    s = useGameStore.getState();
    expect(s.season).toBe(2);
    expect(s.phase).toBe("REGULAR");
    expect(s.week).toBe(1);
    expect(s.fixtures.every((f) => !f.result)).toBe(true);

    // All ten teams still field five starters.
    for (const team of Object.values(s.teams)) {
      for (const role of ["TOP", "JGL", "MID", "ADC", "SUP"] as const) {
        const starter = s.players[team.starters[role]];
        expect(starter, `${team.name} missing ${role}`).toBeTruthy();
        expect(starter.retired).not.toBe(true);
      }
    }

    // And season 2 is playable too.
    useGameStore.getState().quickSimWeek();
    expect(
      useGameStore.getState().fixtures.filter((f) => f.result).length,
    ).toBeGreaterThan(0);
  });

  it("fictional mode plays a complete season with no real names", () => {
    useGameStore.getState().newGame({
      teamId: "fic-0",
      saveName: "Fictional Smoke",
      dataMode: "fictional",
      worldSeed: 20260709,
    });
    let s = useGameStore.getState();
    expect(s.initialized).toBe(true);
    expect(s.dataMode).toBe("fictional");
    expect(s.worldSeed).toBe(20260709);
    expect(s.usingSampleData).toBe(false);
    expect(Object.keys(s.teams)).toHaveLength(10);
    expect(s.teams["fic-0"]).toBeTruthy();

    // Season → playoffs → offseason, then roll into season 2.
    let guard = 0;
    while (useGameStore.getState().phase !== "OFFSEASON" && guard < 80) {
      useGameStore.getState().quickSimWeek();
      guard++;
    }
    s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");
    expect(s.history).toHaveLength(1);

    // No real pro handle anywhere in the fictional world — including
    // offseason prospect intake.
    const real = new Set(
      (realPlayers as { handle: string }[]).map((p) => p.handle.toLowerCase()),
    );
    for (const p of Object.values(s.players)) {
      expect(real.has(p.handle.toLowerCase()), p.handle).toBe(false);
    }

    if (s.board.fired) {
      useGameStore.getState().acceptJobOffer(useGameStore.getState().jobOffers[0]);
    }
    useGameStore.getState().startNextSeason();
    s = useGameStore.getState();
    expect(s.season).toBe(2);
    expect(s.dataMode).toBe("fictional");
    for (const team of Object.values(s.teams)) {
      for (const role of ["TOP", "JGL", "MID", "ADC", "SUP"] as const) {
        expect(s.players[team.starters[role]], `${team.name} missing ${role}`).toBeTruthy();
      }
    }
  });

  it("playoffs use best-of-five series", () => {
    useGameStore.getState().newGame({ teamId: "gen", saveName: "Playoff Test", dataMode: "real" });
    let guard = 0;
    while (useGameStore.getState().phase === "REGULAR" && guard < 40) {
      useGameStore.getState().quickSimWeek();
      guard++;
    }
    guard = 0;
    while (useGameStore.getState().phase === "PLAYOFFS" && guard < 30) {
      const s = useGameStore.getState();
      const mine = userSeries(s);
      if (mine) {
        expect(mine.blueWins).toBeLessThanOrEqual(3);
        expect(mine.redWins).toBeLessThanOrEqual(3);
      }
      useGameStore.getState().quickSimWeek();
      guard++;
    }
    const s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");
    for (const series of s.playoffs) {
      expect(Math.max(series.blueWins, series.redWins)).toBe(3);
      expect(series.games.length).toBeGreaterThanOrEqual(3);
      expect(series.games.length).toBeLessThanOrEqual(5);
    }
  });
});
