import { beforeEach, describe, expect, it } from "vitest";
import { crestSpecFor } from "../lib/crest";
import { CUSTOM_TEAM_ID, useGameStore } from "../lib/store";
import { ROLES } from "../lib/types";

const BASE_CREATE = {
  name: "Ashen Wolves",
  tag: "ASH",
  region: "RIFT",
  primaryColor: "#58c9f0",
  secondaryColor: "#c8aa6e",
};

function runToOffseason() {
  let guard = 0;
  while (useGameStore.getState().phase !== "OFFSEASON" && guard < 80) {
    useGameStore.getState().quickSimWeek();
    guard++;
  }
  return guard;
}

describe("procedural crest", () => {
  it("is deterministic per name and varies across names", () => {
    expect(crestSpecFor("Ashen Wolves")).toEqual(crestSpecFor("Ashen Wolves"));
    expect(crestSpecFor("  ashen wolves ")).toEqual(crestSpecFor("Ashen Wolves"));
    const specs = new Set(
      ["Ashen Wolves", "Iron Ravens", "Solar Drakes", "Midnight Lynxes", "Gilded Titans"].map(
        (n) => JSON.stringify(crestSpecFor(n)),
      ),
    );
    expect(specs.size).toBeGreaterThanOrEqual(4);
  });

  it("stays within layer bounds", () => {
    for (const name of ["a", "Zz", "The Very Long Franchise Name", "漢字隊"]) {
      const spec = crestSpecFor(name);
      expect(spec.shape).toBeGreaterThanOrEqual(0);
      expect(spec.shape).toBeLessThan(5);
      expect(spec.glyph).toBeGreaterThanOrEqual(0);
      expect(spec.glyph).toBeLessThan(8);
      expect(spec.pattern).toBeGreaterThanOrEqual(0);
      expect(spec.pattern).toBeLessThan(5);
    }
  });
});

describe("create-a-team", () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it("academy start: replaces the weakest team and plays a full season", () => {
    useGameStore.getState().newGame({
      saveName: "Academy Test",
      dataMode: "real",
      createTeam: { ...BASE_CREATE, rosterMode: "academy" },
      difficulty: "standard",
    });
    let s = useGameStore.getState();
    expect(s.expansionDraft).toBeNull();
    const team = s.teams[CUSTOM_TEAM_ID];
    expect(team).toBeTruthy();
    expect(team.custom).toBe(true);
    expect(Object.keys(s.teams)).toHaveLength(10);
    // League expansion news posted.
    expect(s.inbox.some((m) => m.title === "League expansion")).toBe(true);
    // Roster is young and high-potential.
    const roster = team.roster.map((id) => s.players[id]);
    expect(roster.length).toBeGreaterThanOrEqual(5);
    for (const p of roster) {
      expect(p.age).toBeLessThanOrEqual(19);
      expect(p.attributes.potential).toBeGreaterThanOrEqual(13);
    }
    for (const role of ROLES) expect(s.players[team.starters[role]]).toBeTruthy();
    // Board mandate scales to roster strength — no top-4 demand for a project.
    expect(s.board.expectedFinish).toBeGreaterThanOrEqual(6);

    // Full season end-to-end.
    expect(runToOffseason()).toBeLessThan(80);
    s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");
    expect(s.history).toHaveLength(1);
  });

  it("expansion draft: gated until 5 roles covered, respects the cap, then plays on", () => {
    useGameStore.getState().newGame({
      saveName: "Draft Test",
      dataMode: "fictional",
      worldSeed: 777,
      createTeam: { ...BASE_CREATE, name: "Iron Ravens", tag: "IRN", rosterMode: "draft" },
      difficulty: "standard",
    });
    let s = useGameStore.getState();
    const draft = s.expansionDraft!;
    expect(draft).toBeTruthy();
    // Pool has at least 5 candidates per role.
    for (const role of ROLES) {
      const count = draft.poolIds.filter((id) => s.players[id]?.role === role).length;
      expect(count, role).toBeGreaterThanOrEqual(5);
    }

    // Season is locked while drafting.
    useGameStore.getState().quickSimWeek();
    expect(useGameStore.getState().week).toBe(1);
    expect(useGameStore.getState().fixtures.every((f) => !f.result)).toBe(true);
    // Can't confirm without covering all roles.
    expect(useGameStore.getState().finishDraft()).toBe(false);

    // Draft the cheapest option per role plus a sub.
    s = useGameStore.getState();
    for (const role of ROLES) {
      const cheapest = draft.poolIds
        .map((id) => s.players[id])
        .filter((p) => p.role === role)
        .sort((a, b) => a.ovr - b.ovr)[0];
      useGameStore.getState().draftPick(cheapest.id);
    }
    expect(useGameStore.getState().expansionDraft!.pickedIds).toHaveLength(5);
    expect(useGameStore.getState().finishDraft()).toBe(true);

    s = useGameStore.getState();
    expect(s.expansionDraft).toBeNull();
    const team = s.teams[CUSTOM_TEAM_ID];
    expect(team.roster).toHaveLength(5);
    for (const role of ROLES) expect(s.players[team.starters[role]].role).toBe(role);
    const payroll = team.roster.reduce((sum, id) => sum + s.players[id].contract.salary, 0);
    expect(payroll).toBeLessThanOrEqual(team.budget);

    // Created team flows through a whole season like any other.
    expect(runToOffseason()).toBeLessThan(80);
    s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");
    // …and into the next one.
    if (s.board.fired) {
      useGameStore.getState().acceptJobOffer(s.jobOffers[0]);
    }
    useGameStore.getState().startNextSeason();
    expect(useGameStore.getState().season).toBe(2);
  });

  it("difficulty scales the user budget", () => {
    useGameStore.getState().newGame({
      saveName: "Relaxed",
      dataMode: "real",
      teamId: "t1",
      difficulty: "relaxed",
    });
    const relaxed = useGameStore.getState().teams["t1"].budget;
    useGameStore.getState().resetGame();
    useGameStore.getState().newGame({
      saveName: "Brutal",
      dataMode: "real",
      teamId: "t1",
      difficulty: "brutal",
    });
    const brutal = useGameStore.getState().teams["t1"].budget;
    expect(relaxed).toBeGreaterThan(brutal);
  });
});
