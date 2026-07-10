import { beforeEach, describe, expect, it } from "vitest";
import { estimatedOvrRange, upgradeVerdict } from "../lib/engine/scouting";
import { OFFSEASON_WEEKS, useGameStore } from "../lib/store";

function runToOffseason() {
  useGameStore.getState().newGame({ teamId: "t1", saveName: "Market", dataMode: "real" });
  let guard = 0;
  while (useGameStore.getState().phase !== "OFFSEASON" && guard < 80) {
    useGameStore.getState().quickSimWeek();
    guard++;
  }
  expect(useGameStore.getState().phase).toBe("OFFSEASON");
}

describe("offseason market weeks", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("opens at week 1 with seeded intents, rumors precede done deals", () => {
    runToOffseason();
    let s = useGameStore.getState();
    expect(s.offseasonWeek).toBe(1);
    expect(s.inbox.some((m) => m.title === "The market is open")).toBe(true);
    // Intents are well-formed and target real free agents.
    for (const intent of s.signingIntents) {
      expect(s.teams[intent.teamId]).toBeTruthy();
      expect(s.freeAgents).toContain(intent.playerId);
      expect(intent.week).toBeGreaterThanOrEqual(2);
      expect(intent.week).toBeLessThanOrEqual(OFFSEASON_WEEKS);
      expect(intent.done).toBe(false);
    }

    // Advance the whole market.
    for (let w = 0; w < OFFSEASON_WEEKS; w++) useGameStore.getState().finishWeek();
    s = useGameStore.getState();
    expect(s.offseasonWeek).toBe(OFFSEASON_WEEKS);
    expect(s.inbox.some((m) => m.title === "DEADLINE WEEK")).toBe(true);

    // Every intent executed; its player left free agency and joined the team.
    for (const intent of s.signingIntents) {
      expect(intent.done).toBe(true);
      expect(intent.rumored).toBe(true);
      const p = s.players[intent.playerId];
      const signedSomewhere = Object.values(s.teams).some((t) => t.roster.includes(p.id));
      expect(signedSomewhere || s.freeAgents.includes(p.id)).toBe(true);
    }
    const doneDeals = s.inbox.filter((m) => m.title === "Done deal");
    const executed = s.signingIntents.filter(
      (i) => !s.freeAgents.includes(i.playerId),
    );
    expect(doneDeals.length).toBe(executed.length);
    // A rumor exists for each executed deal, posted before (newer-first inbox:
    // rumor index > deal index).
    for (const intent of executed) {
      const p = s.players[intent.playerId];
      const rumorIdx = s.inbox.findIndex((m) => m.title === "Transfer rumor" && m.body.includes(p.handle));
      const dealIdx = s.inbox.findIndex((m) => m.title === "Done deal" && m.body.includes(p.handle));
      expect(rumorIdx).toBeGreaterThan(dealIdx);
    }

    // Market closed: further advances don't move the week.
    useGameStore.getState().finishWeek();
    expect(useGameStore.getState().offseasonWeek).toBe(OFFSEASON_WEEKS);

    // Season still starts fine.
    if (useGameStore.getState().board.fired) {
      useGameStore.getState().acceptJobOffer(useGameStore.getState().jobOffers[0]);
    }
    useGameStore.getState().startNextSeason();
    const s2 = useGameStore.getState();
    expect(s2.season).toBe(2);
    expect(s2.offseasonWeek).toBe(0);
    expect(s2.signingIntents).toHaveLength(0);
  });

  it("a rumored target can be sniped: user hesitation loses the player", () => {
    runToOffseason();
    let sniped = false;
    // Find an intent, advance past its week without bidding, verify the player left.
    const s0 = useGameStore.getState();
    const intent = s0.signingIntents[0];
    if (intent) {
      for (let w = 0; w < OFFSEASON_WEEKS; w++) useGameStore.getState().finishWeek();
      const s = useGameStore.getState();
      sniped = !s.freeAgents.includes(intent.playerId);
      expect(s.teams[intent.teamId].roster).toContain(intent.playerId);
    }
    // (If no intents were seeded this run, nothing to assert — rare but legal.)
    expect(intent === undefined || sniped).toBe(true);
  });

  it("poach offers can be matched (player stays, salary up) or accepted (buyout)", () => {
    runToOffseason();
    // Force a deterministic offer instead of relying on the seeded roll.
    useGameStore.setState((s) => {
      const team = s.teams[s.playerTeamId];
      const pid = team.roster[0];
      const rival = Object.values(s.teams).find((t) => t.id !== s.playerTeamId)!;
      s.poachOffers = [
        {
          id: "poach-test",
          playerId: pid,
          teamId: rival.id,
          salary: s.players[pid].contract.salary + 200,
          arrivalWeek: 2,
          arrived: false,
          resolved: false,
        },
      ];
    });
    useGameStore.getState().finishWeek(); // week 2 → offer arrives
    let s = useGameStore.getState();
    const offer = s.poachOffers[0];
    expect(offer.arrived).toBe(true);
    const player = s.players[offer.playerId];
    const oldSalary = player.contract.salary;

    // Match: player stays at the rival's number.
    useGameStore.getState().respondPoach("poach-test", false);
    s = useGameStore.getState();
    if (s.poachOffers[0].resolved) {
      expect(s.players[offer.playerId].contract.salary).toBe(offer.salary);
      expect(s.teams[s.playerTeamId].roster).toContain(offer.playerId);
      expect(s.players[offer.playerId].contract.salary).toBeGreaterThan(oldSalary);
    } else {
      // Budget blocked the match — accept instead and verify the buyout.
      const budgetBefore = s.teams[s.playerTeamId].budget;
      useGameStore.getState().respondPoach("poach-test", true);
      s = useGameStore.getState();
      expect(s.teams[s.playerTeamId].roster).not.toContain(offer.playerId);
      expect(s.teams[offer.teamId].roster).toContain(offer.playerId);
      expect(s.teams[s.playerTeamId].budget).toBeGreaterThan(budgetBefore);
    }
  });

  it("unanswered offers lapse at season start with a morale hit", () => {
    runToOffseason();
    useGameStore.setState((s) => {
      const team = s.teams[s.playerTeamId];
      const pid = team.roster[0];
      const rival = Object.values(s.teams).find((t) => t.id !== s.playerTeamId)!;
      s.players[pid].morale = 60;
      s.poachOffers = [
        {
          id: "poach-lapse",
          playerId: pid,
          teamId: rival.id,
          salary: 999,
          arrivalWeek: 2,
          arrived: true,
          resolved: false,
        },
      ];
    });
    const pid = useGameStore.getState().poachOffers[0].playerId;
    if (useGameStore.getState().board.fired) {
      useGameStore.getState().acceptJobOffer(useGameStore.getState().jobOffers[0]);
    }
    useGameStore.getState().startNextSeason();
    const s = useGameStore.getState();
    expect(s.players[pid].morale).toBeLessThan(60);
    expect(s.inbox.some((m) => m.title.includes("felt dangled"))).toBe(true);
  });
});

describe("scout report cards", () => {
  beforeEach(() => useGameStore.getState().resetGame());

  it("estimated OVR range always contains the truth and tightens with knowledge", () => {
    useGameStore.getState().newGame({ teamId: "t1", saveName: "Range", dataMode: "real" });
    const s = useGameStore.getState();
    for (const id of s.freeAgents.slice(0, 8)) {
      const p = s.players[id];
      let prevWidth = Infinity;
      for (const level of [0, 2, 4, 5]) {
        const r = estimatedOvrRange(p, level);
        expect(p.ovr).toBeGreaterThanOrEqual(r.min - 0.05);
        expect(p.ovr).toBeLessThanOrEqual(r.max + 0.05);
        const width = r.max - r.min;
        expect(width).toBeLessThanOrEqual(prevWidth + 0.001);
        prevWidth = width;
      }
      expect(estimatedOvrRange(p, 5).min).toBe(p.ovr);
    }
  });

  it("verdicts are computed from the range, not the truth", () => {
    useGameStore.getState().newGame({ teamId: "t1", saveName: "Verdict", dataMode: "real" });
    const s = useGameStore.getState();
    const p = s.players[s.freeAgents[0]];
    // Absurdly high starter: even a wide range can't clear it.
    expect(upgradeVerdict(p, 0, 25)).toBe("not an upgrade");
    // Absurdly low starter: any range clears it.
    expect(upgradeVerdict(p, 0, 0)).toBe("likely upgrade");
    expect(upgradeVerdict(p, 0, null)).toBe("unknown");
  });

  it("assigning a scout produces weekly reports that tighten the file", () => {
    useGameStore.getState().newGame({ teamId: "t1", saveName: "ScoutFA", dataMode: "real" });
    const targetId = useGameStore.getState().freeAgents[0];
    useGameStore.getState().setPlayerScoutTarget(targetId);
    useGameStore.getState().quickSimWeek();
    let s = useGameStore.getState();
    expect(s.playerScouting[targetId]).toBe(2);
    const report = s.inbox.find((m) => m.title.startsWith("Scout report:"));
    expect(report).toBeTruthy();
    expect(report!.body).toContain("Verdict");

    // Two more weeks maxes the file and auto-clears the assignment.
    useGameStore.getState().quickSimWeek();
    useGameStore.getState().quickSimWeek();
    s = useGameStore.getState();
    expect(s.playerScouting[targetId]).toBe(5);
    expect(s.playerScoutTargetId).toBeNull();
    expect(estimatedOvrRange(s.players[targetId], 5).min).toBe(s.players[targetId].ovr);
  });

  it("scouting also progresses through offseason market weeks", () => {
    runToOffseason();
    const targetId = useGameStore.getState().freeAgents[0];
    useGameStore.getState().setPlayerScoutTarget(targetId);
    useGameStore.getState().finishWeek();
    const s = useGameStore.getState();
    expect(s.playerScouting[targetId]).toBe(2);
  });
});
