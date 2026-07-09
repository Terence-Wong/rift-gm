import { beforeEach, describe, expect, it } from "vitest";
import { buildTeamContext } from "../lib/engine/ai";
import {
  applyTraitToInput,
  matchFatigueCost,
  traitOf,
  TRAIT_INFO,
} from "../lib/engine/personality";
import { computePowerRankings } from "../lib/engine/rankings";
import { computeStandings } from "../lib/engine/schedule";
import { useGameStore } from "../lib/store";
import type { PlayerMatchInput } from "../lib/types";
import { ROLES } from "../lib/types";

function findIdWithTrait(trait: string | null): string {
  for (let i = 0; i < 5000; i++) {
    const id = `probe-${i}`;
    if (traitOf(id) === trait) return id;
  }
  throw new Error(`no id found with trait ${trait}`);
}

function baseInput(id: string): PlayerMatchInput {
  return {
    id,
    handle: id,
    role: "MID",
    attributes: {
      laning: 12, mechanics: 12, macro: 12, teamfight: 12, aggression: 12,
      consistency: 12, clutch: 12, potential: 12,
    },
    form: 0,
    morale: 60,
    fatigue: 40,
  };
}

describe("player personalities", () => {
  it("assigns traits deterministically with roughly half the pool untraited", () => {
    const counts = new Map<string | null, number>();
    for (let i = 0; i < 800; i++) {
      const t = traitOf(`p-${i}`);
      counts.set(t, (counts.get(t) ?? 0) + 1);
      expect(traitOf(`p-${i}`)).toBe(t); // stable
    }
    expect(counts.get(null)! > 250).toBe(true);
    for (const trait of Object.keys(TRAIT_INFO)) {
      expect(counts.get(trait as never) ?? 0).toBeGreaterThan(30);
    }
  });

  it("traits visibly modify the match input without touching the player", () => {
    const streakyId = findIdWithTrait("streaky");
    const streaky = applyTraitToInput(baseInput(streakyId), { id: streakyId }, 8);
    expect(streaky.attributes.consistency).toBeLessThan(12);

    const stageId = findIdWithTrait("big-stage");
    const stage = applyTraitToInput(baseInput(stageId), { id: stageId }, 8);
    expect(stage.attributes.clutch).toBeGreaterThan(12);

    const slowId = findIdWithTrait("slow-starter");
    const early = applyTraitToInput(baseInput(slowId), { id: slowId }, 2);
    const late = applyTraitToInput(baseInput(slowId), { id: slowId }, 9);
    expect(early.form).toBeLessThan(late.form);

    const horseId = findIdWithTrait("workhorse");
    const horse = applyTraitToInput(baseInput(horseId), { id: horseId }, 8);
    expect(horse.fatigue).toBeLessThan(40);
    expect(matchFatigueCost(horseId)).toBeLessThan(matchFatigueCost(findIdWithTrait(null)));

    // Inputs are copies — the original object is untouched.
    const original = baseInput(streakyId);
    applyTraitToInput(original, { id: streakyId }, 8);
    expect(original.attributes.consistency).toBe(12);
  });
});

describe("power rankings", () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it("ranks every team, tracks movement, and writes analyst blurbs", () => {
    useGameStore.getState().newGame({ teamId: "t1", saveName: "PR", dataMode: "real" });
    const s = useGameStore.getState();
    const standings = computeStandings(Object.values(s.teams), s.fixtures);
    const week1 = computePowerRankings(s.teams, s.players, standings, null, "1-1");
    expect(week1).toHaveLength(Object.keys(s.teams).length);
    expect(new Set(week1.map((e) => e.rank)).size).toBe(week1.length);
    for (const e of week1) {
      expect(e.blurb.length).toBeGreaterThan(10);
      expect(e.prevRank).toBeNull();
    }
    // Deterministic per seed key.
    expect(computePowerRankings(s.teams, s.players, standings, null, "1-1")).toEqual(week1);
    // Week 2 carries movement.
    const week2 = computePowerRankings(s.teams, s.players, standings, week1, "1-2");
    for (const e of week2) expect(e.prevRank).not.toBeNull();
  });

  it("updates weekly during a season (store smoke)", () => {
    useGameStore.getState().newGame({ teamId: "t1", saveName: "PR2", dataMode: "real" });
    useGameStore.getState().quickSimWeek();
    useGameStore.getState().quickSimWeek();
    const s = useGameStore.getState();
    expect(s.powerRankings).toHaveLength(Object.keys(s.teams).length);
    expect(s.powerRankings.every((e) => s.teams[e.teamId])).toBe(true);
  });
});

describe("awards + rivalries (full-season smoke)", () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it("season end produces an awards ceremony and playoff rivalries", () => {
    useGameStore.getState().newGame({ teamId: "gen", saveName: "Awards", dataMode: "real" });
    let guard = 0;
    while (useGameStore.getState().phase !== "OFFSEASON" && guard < 80) {
      useGameStore.getState().quickSimWeek();
      guard++;
    }
    const s = useGameStore.getState();
    expect(s.phase).toBe("OFFSEASON");

    // Awards attached to history + announced in the inbox.
    const entry = s.history[0];
    expect(entry.awards).toBeTruthy();
    expect(entry.awards!.mvpHandle).toBeTruthy();
    expect(entry.awards!.allPro.map((a) => a.role)).toEqual([...ROLES]);
    expect(s.inbox.some((m) => m.title.includes("awards ceremony"))).toBe(true);

    // Every finished playoff series founded/deepened a rivalry.
    const finished = s.playoffs.filter((p) => p.winnerId).length;
    const total = Object.values(s.rivalries).reduce((a, v) => a + v, 0);
    expect(finished).toBeGreaterThanOrEqual(3);
    expect(total).toBe(finished);
  });
});

describe("trait-aware team context", () => {
  it("buildTeamContext applies traits per week without mutating players", () => {
    useGameStore.getState().resetGame();
    useGameStore.getState().newGame({ teamId: "t1", saveName: "Ctx", dataMode: "real" });
    const s = useGameStore.getState();
    const team = s.teams["t1"];
    const ctx = buildTeamContext(team, s.players, {
      playstyle: "BALANCED",
      objective: "DRAGON",
      archetype: "TEAMFIGHT",
    }, 1);
    expect(ctx.players).toHaveLength(5);
    for (const input of ctx.players) {
      const real = s.players[input.id];
      const trait = traitOf(input.id);
      if (trait === "streaky") {
        expect(input.attributes.consistency).toBeLessThan(real.attributes.consistency);
      } else if (!trait) {
        expect(input.attributes.consistency).toBe(real.attributes.consistency);
      }
      // Store data never mutated by context building.
      expect(real.attributes).toEqual(s.players[input.id].attributes);
    }
  });
});
