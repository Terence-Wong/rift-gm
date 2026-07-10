import { beforeEach, describe, expect, it } from "vitest";
import { buildMatchIntel } from "../lib/engine/intel";
import { counterEdge } from "../lib/engine/tactics";
import { useGameStore } from "../lib/store";
import { ROLES } from "../lib/types";

function newRealGame(name: string, teamId = "t1") {
  useGameStore.getState().newGame({ teamId, saveName: name, dataMode: "real" });
}

describe("weekly training recap", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("every advance produces a visible recap of the user roster's gains", () => {
    newRealGame("Recap");
    useGameStore.getState().quickSimWeek();
    const s = useGameStore.getState();
    expect(s.trainingRecap).toBeTruthy();
    expect(s.trainingRecap!.season).toBe(1);
    expect(s.trainingRecap!.week).toBe(1);
    const team = s.teams[s.playerTeamId];
    for (const e of s.trainingRecap!.entries) {
      expect(team.roster).toContain(e.playerId);
      expect(e.delta).toBeGreaterThan(0);
      expect(e.handle).toBeTruthy();
    }
    // Sorted biggest gain first.
    const deltas = s.trainingRecap!.entries.map((e) => e.delta);
    expect([...deltas].sort((a, b) => b - a)).toEqual(deltas);
  });
});

describe("scouting intel", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("unlocks progressively with scout level and is actionable", () => {
    newRealGame("Intel");
    const s = useGameStore.getState();
    const opp = Object.values(s.teams).find((t) => t.id !== s.playerTeamId)!;
    const mine = s.teams[s.playerTeamId];

    const blind = buildMatchIntel(opp, mine, s.players, 0, "1-fx-0");
    expect(blind.suggestedBanId).toBeUndefined();
    expect(blind.likelyComp).toBeUndefined();

    const level2 = buildMatchIntel(opp, mine, s.players, 2, "1-fx-0");
    expect(level2.suggestedBanId).toBeTruthy();
    expect(opp.roster).toContain(level2.suggestedBanId);
    expect(level2.likelyComp).toBeUndefined();

    const level3 = buildMatchIntel(opp, mine, s.players, 3, "1-fx-0");
    expect(level3.likelyComp).toBeTruthy();
    if (level3.counterPick) {
      expect(counterEdge(level3.counterPick, level3.likelyComp!)).toBeGreaterThan(0);
    }
    // Deterministic per seed key.
    expect(buildMatchIntel(opp, mine, s.players, 3, "1-fx-0")).toEqual(level3);
  });

  it("post-match attribution data is captured on the user's match", () => {
    newRealGame("Attribution");
    useGameStore.getState().playUserMatch(
      { playstyle: "BALANCED", objective: "DRAGON", archetype: "POKE", targetBan: undefined },
      false,
    );
    const s = useGameStore.getState();
    expect(s.lastMatch?.userTactics?.archetype).toBe("POKE");
    expect(s.lastMatch?.oppTactics?.archetype).toBeTruthy();
  });
});

describe("academy showcase + dev events + rumors", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("seeds the season narrative at new game", () => {
    newRealGame("Narrative");
    const s = useGameStore.getState();
    expect(s.intake.quality).toBeGreaterThanOrEqual(1);
    expect(s.intake.quality).toBeLessThanOrEqual(5);
    expect(s.intake.previewSent).toBe(false);
    expect(s.intake.done).toBe(false);
    const team = s.teams[s.playerTeamId];
    for (const e of s.devEvents) {
      expect(team.roster).toContain(e.playerId);
      expect(e.week).toBeGreaterThanOrEqual(2);
      expect(e.week).toBeLessThanOrEqual(15);
      expect(e.fired).toBe(false);
    }
  });

  it("preview hype lands before the reveal, then the class hits free agency", () => {
    newRealGame("Showcase");
    const faBefore = useGameStore.getState().freeAgents.length;
    for (let i = 0; i < 9; i++) useGameStore.getState().quickSimWeek();
    const s = useGameStore.getState();
    expect(s.intake.previewSent).toBe(true);
    expect(s.intake.done).toBe(true);
    expect(s.inbox.some((m) => m.title === "Coach — academy preview")).toBe(true);
    const reveal = s.inbox.find((m) => m.title.startsWith("Academy Showcase"));
    expect(reveal).toBeTruthy();
    expect(s.freeAgents.length).toBeGreaterThan(faBefore);
    // The rookies are young and real (present in the player table).
    const rookies = s.freeAgents
      .map((id) => s.players[id])
      .filter((p) => p.id.startsWith(`fa-s1-`) && p.age <= 19);
    expect(rookies.length).toBeGreaterThanOrEqual(4);
    // The preview arrived strictly before the reveal.
    const previewIdx = s.inbox.findIndex((m) => m.title === "Coach — academy preview");
    const revealIdx = s.inbox.findIndex((m) => m.title.startsWith("Academy Showcase"));
    expect(previewIdx).toBeGreaterThan(revealIdx); // inbox is newest-first
  });

  it("a full season fires all dev events and opens the offseason market", () => {
    newRealGame("FullLoop", "gen");
    let guard = 0;
    while (useGameStore.getState().phase !== "OFFSEASON" && guard < 80) {
      useGameStore.getState().quickSimWeek();
      guard++;
    }
    const s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");
    for (const e of s.devEvents) expect(e.fired).toBe(true);
    expect(s.inbox.some((m) => m.title === "The market is open")).toBe(true);
    // Breakout/slump news exists whenever events were seeded.
    if (s.devEvents.length > 0) {
      expect(
        s.inbox.some(
          (m) => m.title.includes("leveling up") || m.title.includes("burnt out"),
        ),
      ).toBe(true);
    }
    // Season 2 reseeds the narrative.
    if (s.board.fired) useGameStore.getState().acceptJobOffer(s.jobOffers[0]);
    useGameStore.getState().startNextSeason();
    const s2 = useGameStore.getState();
    expect(s2.intake.done).toBe(false);
    expect(s2.intake.previewSent).toBe(false);
    expect(s2.devEvents.every((e) => !e.fired)).toBe(true);
    for (const role of ROLES) {
      expect(s2.players[s2.teams[s2.playerTeamId].starters[role]]).toBeTruthy();
    }
  });
});
