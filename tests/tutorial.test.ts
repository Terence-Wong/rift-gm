import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "../lib/store";
import {
  advanceTutorial,
  TUTORIAL_ORDER,
  TUTORIAL_STEP_INFO,
  type TutorialEvent,
  type TutorialState,
} from "../lib/tutorial";
import { ROLES } from "../lib/types";

describe("tutorial state machine (pure)", () => {
  it("walks the five steps in order on the right events", () => {
    let state: TutorialState = { active: true, step: "SQUAD" };
    const script: [TutorialEvent, string][] = [
      ["starter-set", "SCOUT"],
      ["scouting-viewed", "DRAFT"],
      ["tactics-locked", "MATCH"],
      ["match-finished", "DEBRIEF"],
      ["training-focus-set", "DONE"],
    ];
    for (const [event, expected] of script) {
      state = advanceTutorial(state, event);
      expect(state.step).toBe(expected);
    }
    expect(state.active).toBe(false);
  });

  it("ignores out-of-order events instead of skipping steps", () => {
    let state: TutorialState = { active: true, step: "SQUAD" };
    for (const wrong of ["scouting-viewed", "tactics-locked", "match-finished", "training-focus-set"] as TutorialEvent[]) {
      state = advanceTutorial(state, wrong);
      expect(state.step).toBe("SQUAD");
      expect(state.active).toBe(true);
    }
  });

  it("does nothing when inactive or done", () => {
    expect(advanceTutorial({ active: false, step: "SQUAD" }, "starter-set").step).toBe("SQUAD");
    const done: TutorialState = { active: true, step: "DONE" };
    expect(advanceTutorial(done, "starter-set")).toBe(done);
  });

  it("every step has coach copy and a target screen", () => {
    for (const step of TUTORIAL_ORDER) {
      const info = TUTORIAL_STEP_INFO[step];
      expect(info.memoTitle).toBeTruthy();
      expect(info.memoBody.length).toBeGreaterThan(40);
      expect(info.screen.startsWith("/")).toBe(true);
    }
  });
});

describe("tutorial store integration", () => {
  beforeEach(() => {
    useGameStore.getState().resetGame();
  });

  it("runs through a real save: memos post as real actions land", () => {
    useGameStore.getState().newGame({
      teamId: "t1",
      saveName: "Tutorial Test",
      dataMode: "real",
      tutorial: true,
    });
    let s = useGameStore.getState();
    expect(s.tutorial).toEqual({ active: true, step: "SQUAD" });
    expect(s.inbox.some((m) => m.title === TUTORIAL_STEP_INFO.SQUAD.memoTitle)).toBe(true);

    // Real action: set a starter → SCOUT.
    const team = s.teams["t1"];
    const role = ROLES[0];
    useGameStore.getState().setStarter(role, team.starters[role]);
    s = useGameStore.getState();
    expect(s.tutorial.step).toBe("SCOUT");
    expect(s.inbox.some((m) => m.title === TUTORIAL_STEP_INFO.SCOUT.memoTitle)).toBe(true);

    // View scouting → DRAFT; lock tactics → MATCH; finish match → DEBRIEF.
    useGameStore.getState().tutorialEvent("scouting-viewed");
    expect(useGameStore.getState().tutorial.step).toBe("DRAFT");
    useGameStore.getState().tutorialEvent("tactics-locked");
    expect(useGameStore.getState().tutorial.step).toBe("MATCH");
    useGameStore.getState().tutorialEvent("match-finished");
    expect(useGameStore.getState().tutorial.step).toBe("DEBRIEF");

    // Real action: assign training → DONE, tutorial ends.
    const anyPlayer = useGameStore.getState().teams["t1"].roster[0];
    useGameStore.getState().setTrainingFocus(anyPlayer, "macro");
    s = useGameStore.getState();
    expect(s.tutorial).toEqual({ active: false, step: "DONE" });
    expect(s.inbox.some((m) => m.title === TUTORIAL_STEP_INFO.DONE.memoTitle)).toBe(true);
  });

  it("is skippable and relaunchable", () => {
    useGameStore.getState().newGame({
      teamId: "gen",
      saveName: "Skip Test",
      dataMode: "real",
      tutorial: true,
    });
    useGameStore.getState().skipTutorial();
    expect(useGameStore.getState().tutorial).toEqual({ active: false, step: "DONE" });
    // Skipped tutorial never advances.
    useGameStore.getState().tutorialEvent("starter-set");
    expect(useGameStore.getState().tutorial.step).toBe("DONE");
    // Relaunch from settings.
    useGameStore.getState().startTutorial();
    expect(useGameStore.getState().tutorial).toEqual({ active: true, step: "SQUAD" });
  });

  it("opt-out saves never activate it", () => {
    useGameStore.getState().newGame({
      teamId: "t1",
      saveName: "No Tutorial",
      dataMode: "real",
      tutorial: false,
    });
    const s = useGameStore.getState();
    expect(s.tutorial.active).toBe(false);
    useGameStore.getState().setStarter(ROLES[0], s.teams["t1"].starters[ROLES[0]]);
    expect(useGameStore.getState().tutorial.step).toBe("SQUAD");
  });
});
