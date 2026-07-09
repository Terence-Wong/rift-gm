/**
 * The RIFT GM match engine. Pure and seeded: same inputs + same seed →
 * identical MatchResult. Minute-by-minute gold-difference random walk with
 * phase strengths, objective events, kills, throws, and a decaying nexus
 * threshold. No Math.random() anywhere in this module.
 */

import type {
  MatchEvent,
  MatchOptions,
  MatchResult,
  PlayerLine,
  PlayerMatchInput,
  Role,
  TeamContext,
} from "../types";
import { createRng, type Rng } from "./rng";
import { computeTacticModifiers, TARGET_BAN_PENALTY, type PhaseModifiers } from "./tactics";

/**
 * Central tuning knobs. Calibrated (see scripts/calibrate.ts) so a +2 OVR
 * edge wins ~62–68%. Mutable on purpose: the calibration harness sweeps it.
 */
export const TUNING = {
  /** Effective-attribute swing per unit of the per-game form roll. */
  effPerFormRoll: 0.06,
  /** Gold drift per minute per point of phase-strength difference. */
  driftK: 9,
  /** Base per-minute gold noise (sd). */
  noiseSd: 340,
  /** How strongly phase strength biases who gets each kill. */
  killStrengthBias: 0.05,
  /** How strongly phase strength biases objective contests. */
  objStrengthBias: 0.1,
  /** Nexus threshold: max(floor, base − decay·t). */
  nexusBase: 11800,
  nexusDecay: 240,
  nexusFloor: 3400,
  hardCapMin: 40,
  killGold: 300,
  dragonGold: 420,
  soulGold: 900,
  heraldGold: 550,
  baronGold: 1400,
  towerGold: 300,
};

interface SideState {
  ctx: TeamContext;
  mods: PhaseModifiers;
  /** Effective per-player attribute multipliers for this game. */
  eff: Map<string, number>;
  early: number;
  mid: number;
  late: number;
  aggression: number; // team average, effective
  macroAvg: number;
  consistencyAvg: number;
  dragons: number;
  kills: number;
  lines: Map<string, PlayerLine>;
}

const PHASE_ROLE_WEIGHTS: Record<"early" | "mid" | "late", Record<Role, number>> = {
  early: { TOP: 0.22, JGL: 0.26, MID: 0.22, ADC: 0.15, SUP: 0.15 },
  mid: { TOP: 0.18, JGL: 0.24, MID: 0.22, ADC: 0.18, SUP: 0.18 },
  late: { TOP: 0.16, JGL: 0.18, MID: 0.22, ADC: 0.28, SUP: 0.16 },
};

const DEATH_EXPOSURE: Record<Role, number> = {
  TOP: 1.0,
  JGL: 1.1,
  MID: 0.95,
  ADC: 0.9,
  SUP: 1.25,
};

const CS_PER_MIN: Record<Role, number> = {
  TOP: 7.8,
  JGL: 5.6,
  MID: 8.8,
  ADC: 9.2,
  SUP: 1.1,
};

const DMG_ROLE_MULT: Record<Role, number> = {
  TOP: 0.8,
  JGL: 0.62,
  MID: 1.0,
  ADC: 1.05,
  SUP: 0.35,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function buildSide(
  ctx: TeamContext,
  opp: TeamContext,
  rng: Rng,
  elimination: boolean,
): SideState {
  const mods = computeTacticModifiers(ctx.tactics, opp.tactics);
  const eff = new Map<string, number>();
  const lines = new Map<string, PlayerLine>();

  for (const p of ctx.players) {
    // Per-game form roll: low consistency → wide swings.
    const sd = (21 - p.attributes.consistency) / 10;
    const roll = clamp(rng.normal(0, sd), -2.6, 2.6);
    let mult =
      1 +
      TUNING.effPerFormRoll * roll +
      0.01 * p.form +
      (p.morale - 60) * 0.0008 -
      Math.max(0, p.fatigue - 50) * 0.0012;
    if (elimination) mult += 0.012 * (p.attributes.clutch - 10);
    if (opp.tactics.targetBan === p.id) mult *= TARGET_BAN_PENALTY;
    eff.set(p.id, clamp(mult, 0.72, 1.28));
    lines.set(p.id, { k: 0, d: 0, a: 0, cs: 0, dmg: 0, rating: 0 });
  }

  const attr = (p: PlayerMatchInput, key: keyof PlayerMatchInput["attributes"]) =>
    p.attributes[key] * (eff.get(p.id) ?? 1);

  let early = 0;
  let mid = 0;
  let late = 0;
  let aggr = 0;
  let macro = 0;
  let cons = 0;
  let jungler: PlayerMatchInput | undefined;

  for (const p of ctx.players) {
    early +=
      PHASE_ROLE_WEIGHTS.early[p.role] * (0.6 * attr(p, "laning") + 0.4 * attr(p, "mechanics"));
    mid +=
      PHASE_ROLE_WEIGHTS.mid[p.role] *
      (0.5 * attr(p, "macro") + 0.3 * attr(p, "teamfight") + 0.2 * attr(p, "mechanics"));
    late +=
      PHASE_ROLE_WEIGHTS.late[p.role] *
      (0.5 * attr(p, "teamfight") + 0.3 * attr(p, "mechanics") + 0.2 * attr(p, "macro"));
    aggr += attr(p, "aggression") / 5;
    macro += p.attributes.macro / 5;
    cons += p.attributes.consistency / 5;
    if (p.role === "JGL") jungler = p;
  }

  if (jungler) early += 0.3 * (attr(jungler, "aggression") - 10) * 0.5;

  return {
    ctx,
    mods,
    eff,
    early: early + mods.early,
    mid: mid + mods.mid,
    late: late + mods.late,
    aggression: aggr,
    macroAvg: macro,
    consistencyAvg: cons,
    dragons: 0,
    kills: 0,
    lines,
  };
}

type SideKey = "blue" | "red";

function phaseOf(t: number): "early" | "mid" | "late" {
  if (t < 14) return "early";
  if (t < 25) return "mid";
  return "late";
}

/* Broadcast-style event copy. */
const KILL_LINES = [
  (k: string, v: string) => `${k} finds ${v} overextended`,
  (k: string, v: string) => `${k} punishes ${v} in the river`,
  (k: string, v: string) => `${k} solo kills ${v}`,
  (k: string, v: string) => `${k} collapses on ${v}`,
  (k: string, v: string) => `${k} picks off ${v} without vision`,
];

const DRAGON_LINES = [
  (t: string) => `${t} secure the drake uncontested`,
  (t: string) => `${t} win the standoff and take dragon`,
  (t: string) => `${t} steal the pit tempo — drake down`,
];

export function simulateMatch(
  blue: TeamContext,
  red: TeamContext,
  seed: number,
  options: MatchOptions = {},
): MatchResult {
  const rng = createRng(seed);
  const b = buildSide(blue, red, rng, options.elimination ?? false);
  const r = buildSide(red, blue, rng, options.elimination ?? false);
  const sides: Record<SideKey, SideState> = { blue: b, red: r };

  const events: MatchEvent[] = [];
  const goldTimeline: number[] = [0];
  let goldDiff = 0; // blue minus red
  let firstBlood = false;
  let lastBaronMin = -99;
  let nextDragonMin = rng.int(5, 6);
  const heraldMins = [rng.int(8, 9), rng.int(13, 15)];
  let winner: SideKey | null = null;
  let duration = TUNING.hardCapMin;

  const varianceMult = Math.sqrt(b.mods.variance * r.mods.variance);
  const aggrFactor = (b.aggression + r.aggression) / 20; // ~1 for avg teams

  let minute = 0;
  const push = (e: MatchEvent) => events.push(e);

  const teamName = (s: SideKey) => sides[s].ctx.name;
  const other = (s: SideKey): SideKey => (s === "blue" ? "red" : "blue");
  const signed = (s: SideKey, amount: number) => (s === "blue" ? amount : -amount);

  /** Pick a killer on `s` weighted by mechanics/aggression and role. */
  const pickKiller = (s: SideKey): PlayerMatchInput => {
    const ps = sides[s].ctx.players;
    return rng.weightedPick(
      ps,
      ps.map(
        (p) =>
          (p.attributes.mechanics * 1.2 + p.attributes.aggression * 0.6) *
          (p.role === "SUP" ? 0.35 : 1) *
          (sides[s].eff.get(p.id) ?? 1),
      ),
    );
  };

  /** Pick a victim on `s` weighted by exposure and (inverse) mechanics. */
  const pickVictim = (s: SideKey): PlayerMatchInput => {
    const ps = sides[s].ctx.players;
    return rng.weightedPick(
      ps,
      ps.map((p) => DEATH_EXPOSURE[p.role] * (24 - p.attributes.mechanics)),
    );
  };

  const creditKill = (killSide: SideKey, minute: number, minor = false): void => {
    const killer = pickKiller(killSide);
    const victim = pickVictim(other(killSide));
    const kl = sides[killSide].lines.get(killer.id);
    const vl = sides[other(killSide)].lines.get(victim.id);
    if (kl) kl.k++;
    if (vl) vl.d++;
    sides[killSide].kills++;
    const assistP = phaseOf(minute) === "early" ? 0.38 : 0.66;
    for (const p of sides[killSide].ctx.players) {
      if (p.id !== killer.id && rng.chance(assistP)) {
        const al = sides[killSide].lines.get(p.id);
        if (al) al.a++;
      }
    }
    const swing = TUNING.killGold + rng.int(-40, 60);
    goldDiff += signed(killSide, swing);

    if (!firstBlood) {
      firstBlood = true;
      goldDiff += signed(killSide, 100);
      push({
        minute,
        type: "FIRST_BLOOD",
        team: killSide,
        detail: `First blood — ${killer.handle} draws it against ${victim.handle}`,
        goldSwing: swing + 100,
      });
      return;
    }
    push({
      minute,
      type: "KILL",
      team: killSide,
      detail: rng.pick(KILL_LINES)(killer.handle, victim.handle),
      goldSwing: swing,
      minor: minor || undefined,
    });
  };

  /** Contest an objective; returns the winning side. */
  const contest = (bias: number, focusB: number, focusR: number): SideKey => {
    const phase = phaseOf(minute) === "early" ? b.early - r.early : b.mid - r.mid;
    const score =
      phase * TUNING.objStrengthBias +
      goldDiff / 2600 +
      bias +
      (focusB - focusR) * 0.5 +
      rng.normal(0, 2.1);
    return score >= 0 ? "blue" : "red";
  };

  for (minute = 1; minute <= TUNING.hardCapMin; minute++) {
    const phase = phaseOf(minute);
    const strengthDiff =
      phase === "early" ? b.early - r.early : phase === "mid" ? b.mid - r.mid : b.late - r.late;

    // Core random walk.
    const drift = TUNING.driftK * strengthDiff;
    const noise = rng.normal(0, TUNING.noiseSd * varianceMult * (0.8 + 0.4 * aggrFactor));
    goldDiff += drift + noise;

    // Kills / skirmishes.
    const killRate =
      (phase === "early" ? 0.34 : phase === "mid" ? 0.8 : 0.7) * (0.55 + 0.45 * aggrFactor);
    const kills = rng.poisson(killRate);
    for (let i = 0; i < kills; i++) {
      const pKillBlue = sigmoid(strengthDiff * TUNING.killStrengthBias + goldDiff / 2800);
      const killSide: SideKey = rng.chance(pKillBlue) ? "blue" : "red";
      // Only the first kill of a minute gets a feed line — keeps the feed readable.
      creditKill(killSide, minute, i > 0);
    }

    // Dragons.
    if (minute >= nextDragonMin) {
      const w = contest(0, b.mods.dragonBonus, r.mods.dragonBonus);
      sides[w].dragons++;
      const soul = sides[w].dragons === 4;
      const swing = soul ? TUNING.soulGold : TUNING.dragonGold;
      goldDiff += signed(w, swing);
      push({
        minute,
        type: "DRAGON",
        team: w,
        detail: soul
          ? `${teamName(w)} complete the Dragon Soul — the map shrinks`
          : rng.pick(DRAGON_LINES)(teamName(w)),
        goldSwing: swing,
      });
      nextDragonMin = minute + rng.int(5, 7);
    }

    // Heralds.
    if (heraldMins.length > 0 && minute >= heraldMins[0]) {
      heraldMins.shift();
      const w = contest(0.2, b.mods.heraldBonus, r.mods.heraldBonus);
      goldDiff += signed(w, TUNING.heraldGold);
      push({
        minute,
        type: "HERALD",
        team: w,
        detail: `${teamName(w)} bank the Rift Herald and cash it mid`,
        goldSwing: TUNING.heraldGold,
      });
    }

    // Barons.
    if (minute >= 21 && minute - lastBaronMin >= 6) {
      const leadSide: SideKey = goldDiff >= 0 ? "blue" : "red";
      const attemptP = 0.11 + 0.05 * Math.min(1, Math.abs(goldDiff) / 6000);
      if (rng.chance(attemptP)) {
        lastBaronMin = minute;
        const w = contest(signed(leadSide, 0.6), b.mods.baronBonus, r.mods.baronBonus);
        goldDiff += signed(w, TUNING.baronGold);
        const stolen = w !== leadSide;
        push({
          minute,
          type: "BARON",
          team: w,
          detail: stolen
            ? `${teamName(w)} STEAL baron over the wall — pandemonium`
            : `${teamName(w)} burn baron down and reset with the buff`,
          goldSwing: TUNING.baronGold,
        });
        if (stolen) {
          // A steal usually comes with bodies.
          const extra = rng.int(1, 3);
          for (let i = 0; i < extra; i++) creditKill(w, minute, true);
        }
      }
    }

    // Towers: tempo conversion for whoever holds the map.
    if (minute >= 9 && rng.chance(0.3)) {
      const pBlue = sigmoid(goldDiff / 3200 + strengthDiff * 0.1);
      const w: SideKey = rng.chance(pBlue) ? "blue" : "red";
      goldDiff += signed(w, TUNING.towerGold);
      push({
        minute,
        type: "TOWER",
        team: w,
        detail: `${teamName(w)} take a tower and open the map`,
        goldSwing: TUNING.towerGold,
      });
    }

    // Throw mechanic: big lead + shaky macro/consistency → disaster window.
    const leader: SideKey = goldDiff >= 0 ? "blue" : "red";
    const lead = Math.abs(goldDiff);
    if (lead > 4500 && minute >= 17) {
      const ls = sides[leader];
      const shake =
        Math.max(0, 13 - ls.macroAvg) / 13 + Math.max(0, 13 - ls.consistencyAvg) / 13;
      const pThrow = (0.008 + 0.035 * shake) * ls.mods.variance;
      if (rng.chance(pThrow)) {
        const loser = other(leader);
        const swingBack = lead * (0.4 + rng.next() * 0.3);
        goldDiff += signed(loser, swingBack);
        const bodies = rng.int(2, 4);
        for (let i = 0; i < bodies; i++) creditKill(loser, minute, true);
        push({
          minute,
          type: "THROW",
          team: loser,
          detail: `${teamName(leader)} throw it at baron — ${teamName(loser)} turn the fight and swing ${Math.round(
            swingBack / 100,
          ) / 10}k back`,
          goldSwing: Math.round(swingBack),
        });
        if (bodies >= 4 && rng.chance(0.5)) {
          push({
            minute,
            type: "ACE",
            team: loser,
            detail: `${teamName(loser)} ace the board off the reversal`,
            goldSwing: 0,
          });
        }
      }
    }

    goldDiff = clamp(goldDiff, -25000, 25000);
    goldTimeline.push(Math.round(goldDiff));

    // Win condition: decaying nexus threshold.
    const threshold = Math.max(TUNING.nexusFloor, TUNING.nexusBase - TUNING.nexusDecay * minute);
    if (Math.abs(goldDiff) >= threshold) {
      winner = goldDiff > 0 ? "blue" : "red";
      duration = minute;
      break;
    }
  }

  if (!winner) {
    duration = TUNING.hardCapMin;
    if (goldDiff === 0) goldDiff = rng.chance(0.5) ? 50 : -50;
    winner = goldDiff > 0 ? "blue" : "red";
    goldTimeline[goldTimeline.length - 1] = Math.round(goldDiff);
  }

  push({
    minute: duration,
    type: "NEXUS",
    team: winner,
    detail: `${teamName(winner)} end it at ${duration} minutes`,
    goldSwing: 0,
  });

  // ── Post-game stat lines ────────────────────────────────────
  const winTeamKills = sides[winner].kills;
  const loseTeamKills = sides[other(winner)].kills;

  const playerLines: Record<string, PlayerLine> = {};
  const finalize = (s: SideKey) => {
    const side = sides[s];
    const won = s === winner;
    const teamKills = Math.max(1, side.kills);
    const teamDmg: number[] = [];
    for (const p of side.ctx.players) {
      const line = side.lines.get(p.id)!;
      const effMult = side.eff.get(p.id) ?? 1;
      const leadFactor = 1 + signed(s, goldDiff) / 40000;
      line.cs = Math.round(
        CS_PER_MIN[p.role] * duration * (0.72 + (p.attributes.mechanics / 40) * effMult) * leadFactor,
      );
      const dmg =
        (p.attributes.mechanics * 30 + p.attributes.teamfight * 9) *
          DMG_ROLE_MULT[p.role] *
          duration *
          effMult +
        line.k * 380 +
        line.a * 120;
      line.dmg = Math.round(dmg);
      teamDmg.push(line.dmg);
    }
    const totalDmg = Math.max(1, teamDmg.reduce((a, v) => a + v, 0));
    for (const p of side.ctx.players) {
      const line = side.lines.get(p.id)!;
      const kp = (line.k + line.a) / teamKills;
      const dmgShare = line.dmg / totalDmg;
      const rating = clamp(
        5 +
          line.k * 0.32 +
          line.a * 0.11 -
          line.d * 0.42 +
          dmgShare * 3.2 +
          kp * 0.8 +
          (won ? 0.7 : -0.5),
        0,
        10,
      );
      line.rating = Math.round(rating * 100) / 100;
      playerLines[p.id] = line;
    }
  };
  finalize("blue");
  finalize("red");

  // MVP: best rating on the winning side; rare losing-side MVP.
  const best = (s: SideKey) =>
    sides[s].ctx.players.reduce((top, p) =>
      (playerLines[p.id]?.rating ?? 0) > (playerLines[top.id]?.rating ?? 0) ? p : top,
    );
  const winBest = best(winner);
  const loseBest = best(other(winner));
  const mvpPlayerId =
    playerLines[loseBest.id].rating > playerLines[winBest.id].rating + 1.4 &&
    loseTeamKills > winTeamKills
      ? loseBest.id
      : winBest.id;

  return {
    blueTeamId: blue.teamId,
    redTeamId: red.teamId,
    winner,
    durationMin: duration,
    goldTimeline,
    events,
    playerLines,
    mvpPlayerId,
    seed,
  };
}
