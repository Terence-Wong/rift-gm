/**
 * "Your first week as head coach" — the diegetic tutorial state machine.
 * Pure and event-driven: steps gate on real actions (setting a starter,
 * reading a scouting report, locking a draft, finishing a match, assigning
 * training), never on a "Next" button. The store owns persistence and the
 * assistant-coach inbox memos; this module owns the transitions and copy.
 */

export type TutorialStep = "SQUAD" | "SCOUT" | "DRAFT" | "MATCH" | "DEBRIEF" | "DONE";

export type TutorialEvent =
  | "starter-set"
  | "scouting-viewed"
  | "tactics-locked"
  | "match-finished"
  | "training-focus-set";

export interface TutorialState {
  active: boolean;
  step: string; // TutorialStep, stored loosely for save-schema stability
}

/** Which event completes each step (in order). */
const TRANSITIONS: Record<Exclude<TutorialStep, "DONE">, { on: TutorialEvent; next: TutorialStep }> = {
  SQUAD: { on: "starter-set", next: "SCOUT" },
  SCOUT: { on: "scouting-viewed", next: "DRAFT" },
  DRAFT: { on: "tactics-locked", next: "MATCH" },
  MATCH: { on: "match-finished", next: "DEBRIEF" },
  DEBRIEF: { on: "training-focus-set", next: "DONE" },
};

export const TUTORIAL_ORDER: TutorialStep[] = ["SQUAD", "SCOUT", "DRAFT", "MATCH", "DEBRIEF", "DONE"];

/**
 * Advance the machine. Events that don't match the current step are
 * ignored — doing things out of order never breaks or skips the flow.
 */
export function advanceTutorial(state: TutorialState, event: TutorialEvent): TutorialState {
  if (!state.active || state.step === "DONE") return state;
  const t = TRANSITIONS[state.step as Exclude<TutorialStep, "DONE">];
  if (!t || t.on !== event) return state;
  return { active: t.next !== "DONE", step: t.next };
}

export interface TutorialStepInfo {
  /** Screen the step happens on (for the coach bar link + spotlight scope). */
  screen: string;
  /** Short objective, shown in the coach bar. */
  objective: string;
  /** Inbox memo from the assistant coach, posted when the step begins. */
  memoTitle: string;
  memoBody: string;
}

export const TUTORIAL_STEP_INFO: Record<TutorialStep, TutorialStepInfo> = {
  SQUAD: {
    screen: "/squad",
    objective: "Open Squad and set (or confirm) a starter in any role.",
    memoTitle: "Coach — first day, first job",
    memoBody:
      "Welcome to the desk. Before anything else, look at who's actually walking on stage: open Squad and set your starters — press Start on a player to lock them in. Form, fatigue, and morale all live there. When you've touched the lineup, come find me.",
  },
  SCOUT: {
    screen: "/match",
    objective: "Open this week's Match screen and read the opponent's scouting report.",
    memoTitle: "Coach — scouting memo",
    memoBody:
      "Lineup looks handled. Now the other side: open Match and read the scouting report. You'll see ranges, not numbers — we don't know their players exactly, and we never will. That's the job: decide under uncertainty. Scouting a team all week tightens the ranges.",
  },
  DRAFT: {
    screen: "/match",
    objective: "Pick a comp archetype, set a target ban, and lock in.",
    memoTitle: "Coach — draft prep",
    memoBody:
      "Time to draft. Pick a comp archetype into what they likely run — the counter wheel is simple: Poke beats Teamfight, Teamfight beats Pick, Pick beats Poke; Split-push punishes slow teamfight setups and Cheese trades everything for the early game. Then target-ban their best player and lock it in.",
  },
  MATCH: {
    screen: "/match",
    objective: "Play the match — watch the map and the gold line together.",
    memoTitle: "Coach — match day",
    memoBody:
      "We're live. Watch the map and the gold line together — that's the broadcast. Dots converging on a pit is a setup; the gold line tells you whether it paid. You can speed up or skip, but the first one's worth watching.",
  },
  DEBRIEF: {
    screen: "/training",
    objective: "Read the post-match numbers, then set a training focus in Training.",
    memoTitle: "Coach — debrief",
    memoBody:
      "Game's in the books. The ratings tell you who showed up; the MVP line tells you who carried. Turn what you saw into work: open Training and set a focus for at least one player. Young players with potential move fastest.",
  },
  DONE: {
    screen: "/dashboard",
    objective: "",
    memoTitle: "Coach — that's the week",
    memoBody:
      "Squad set, scout read, draft won or lost on its merits, film reviewed, training assigned. That's the whole loop — everything else is just doing it better than the other nine teams. The desk is yours now. (You can re-run this week from Settings any time.)",
  },
};
