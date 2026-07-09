/**
 * App-wide glossary: one-line, coach-voice definitions for domain terms.
 * Rendered by components/Term.tsx as "?" popovers — available everywhere,
 * forever, not just during the tutorial.
 */

export const GLOSSARY: Record<string, { term: string; def: string }> = {
  ovr: {
    term: "OVR",
    def: "Overall rating — a role-weighted blend of the visible attributes. What matters for a support isn't what matters for an ADC.",
  },
  form: {
    term: "Form",
    def: "Rolling hot/cold streak from recent performances (−3 to +3). It fades fast — don't bench someone over one bad night.",
  },
  morale: {
    term: "Morale",
    def: "Confidence, 0–100. Wins raise it, losses dent it, renewals help. Low morale bleeds into performance.",
  },
  fatigue: {
    term: "Fatigue",
    def: "Accumulated wear, 0–100. Playing adds it, resting clears it. Past ~50 it starts costing you on stage.",
  },
  potential: {
    term: "Potential",
    def: "Development ceiling — hidden, estimated by scouts, never exact. High potential + young = the fastest training gains.",
  },
  consistency: {
    term: "Consistency",
    def: "How steady a player's game-to-game level is. Low consistency means monster games and disasters — sometimes in the same week.",
  },
  clutch: {
    term: "Clutch",
    def: "Elimination-game factor. Some players grow in a best-of-five; some shrink. Only shows up when the season's on the line.",
  },
  archetype: {
    term: "Comp archetype",
    def: "The shape of your draft: Poke beats Teamfight, Teamfight beats Pick, Pick beats Poke. Split-push punishes slow setups; Cheese sells the late game for the early.",
  },
  targetBan: {
    term: "Target ban",
    def: "Spend bans on one enemy player's champion pool. They still play — just 10% worse.",
  },
  scouting: {
    term: "Scout level",
    def: "0–5 per team. Higher levels tighten attribute ranges; level 4 unlocks estimates of hidden attributes. Playing a team also teaches you about them.",
  },
  csd15: {
    term: "CSD@15",
    def: "Creep-score difference at 15 minutes versus the lane opponent — the cleanest read on who actually won lane.",
  },
  gd15: {
    term: "GD@15",
    def: "Gold difference at 15 minutes versus the lane opponent. Early-game impact in one number.",
  },
  xpd15: {
    term: "XPD@15",
    def: "Experience difference at 15 minutes versus the lane opponent — pressure without needing kills.",
  },
  dpm: {
    term: "DPM",
    def: "Damage to champions per minute. High DPM with low deaths is carry material.",
  },
  kp: {
    term: "KP%",
    def: "Kill participation — the share of team kills a player had a hand in. Low KP mid/jungle is a red flag.",
  },
  vspm: {
    term: "Vision/min",
    def: "Vision score per minute. The support stat casters never shout about and coaches never stop looking at.",
  },
  rating: {
    term: "Rating",
    def: "Our 0–10 match grade from kills, deaths, assists, damage share, and kill participation. 7+ is a genuinely big game.",
  },
  dragonSoul: {
    term: "Dragon soul",
    def: "Take four drakes and the map permanently tilts your way. Teams that stack dragons win long games they have no business winning.",
  },
  provenance: {
    term: "est",
    def: "This value is a modeled estimate, not derived from real match data. We flag it so you always know data from guesswork.",
  },
};

export type GlossaryKey = keyof typeof GLOSSARY;
