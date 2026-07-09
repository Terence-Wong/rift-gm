/**
 * Spatial match simulation: a 2D tick-level layer (1 tick = 2 in-game
 * seconds) DRIVEN BY the strategic layer in simulateMatch.ts. The strategic
 * layer decides what happens each minute (gold, objectives, team-level
 * kills); this layer decides where everyone is, paths units to fulfil those
 * intents, and — crucially — determines WHO is present at each fight, so
 * K/D/A emerges from spatial events instead of independent sampling.
 *
 * Pure and seeded: same seed → identical position log and identical result.
 * The strategic outcome (winner/gold/duration) of a seed is byte-identical
 * to the quick-sim path because attribution uses separate RNG streams.
 */

import type { MatchOptions, MatchResult, Role, TeamContext } from "../types";
import {
  BARON_PIT,
  BASES,
  DRAGON_PIT,
  JUNGLE_CAMPS,
  LANE_PATHS,
  TURRETS,
  dist,
  laneFront,
  pathPoint,
  type LaneId,
  type Pt,
} from "./mapLayout";
import { createRng, hashSeed, type Rng } from "./rng";
import {
  CS_PER_MIN,
  applyKillAttributions,
  finalizeMatch,
  killerWeights,
  runStrategic,
  victimWeights,
  type KillAttribution,
  type SideKey,
  type SideState,
  type StrategicOutcome,
} from "./simulateMatch";

export const TICKS_PER_MINUTE = 30; // 1 tick = 2 in-game seconds

/** Movement speed in map units per tick, by unit state. */
const SPEED = { laning: 2.4, rotating: 3.0, basing: 3.0 };
/** Units within this radius of a fight are "present". */
const FIGHT_RADIUS = 14;
/** CS-rate compensation: laners only farm ~78% of the game in this model. */
const CS_LANING_COMPENSATION = 1.26;

export type UnitState = "laning" | "rotating" | "fighting" | "dead" | "basing";

/** Per-tick snapshot; arrays indexed 0–4 blue (TOP,JGL,MID,ADC,SUP), 5–9 red. */
export interface SpatialFrame {
  x: number[];
  y: number[];
  state: UnitState[];
}

export interface SpatialKill {
  tick: number;
  x: number;
  y: number;
  killer: number; // unit index
  victim: number;
  assists: number[];
  respawnTick: number;
  side: SideKey;
  firstBlood: boolean;
}

export interface SpatialTag {
  tick: number;
  x: number;
  y: number;
  kind: "kill" | "first_blood" | "dragon" | "herald" | "baron" | "tower" | "throw" | "ace" | "nexus";
  side: SideKey;
  text: string;
}

export interface SpatialLog {
  ticksPerMinute: number;
  durationTicks: number;
  /** Player ids by unit index (blue TOP,JGL,MID,ADC,SUP then red). */
  unitIds: string[];
  handles: string[];
  roles: Role[];
  frames: SpatialFrame[];
  kills: SpatialKill[];
  tags: SpatialTag[];
}

export interface SpatialMatch {
  result: MatchResult;
  log: SpatialLog;
}

/** Serializable inputs to regenerate a spatial log deterministically. */
export interface SpatialInputs {
  blue: TeamContext;
  red: TeamContext;
  seed: number;
  elimination: boolean;
  varianceBoost?: number;
}

const LANE_OF_ROLE: Record<Role, LaneId | null> = {
  TOP: "top",
  JGL: null,
  MID: "mid",
  ADC: "bot",
  SUP: "bot",
};

/** Respawn timer in ticks, scaled by game time (caps ~54s late). */
export function respawnTicks(minute: number): number {
  const seconds = Math.min(54, 8 + minute * 1.3);
  return Math.max(4, Math.round(seconds / 2));
}

interface UnitRt {
  idx: number;
  id: string;
  handle: string;
  role: Role;
  side: SideKey;
  pos: Pt;
  state: UnitState;
  /** Where this unit is trying to be right now. */
  target: Pt;
  respawnAt: number; // tick when a dead unit revives
  fightUntil: number; // tick until which the unit holds "fighting"
  campCursor: number;
  csTicks: number;
  speedJitter: number;
}

interface PlannedFight {
  tick: number;
  loc: Pt;
  slotIndexes: number[]; // indexes into outcome.killSlots resolved at this fight
  attackers: number[]; // unit idxs told to converge
  defenders: number[];
}

function roleOrder(ctx: TeamContext): TeamContext["players"] {
  const order: Role[] = ["TOP", "JGL", "MID", "ADC", "SUP"];
  return order.map((r) => ctx.players.find((p) => p.role === r)!) as TeamContext["players"];
}

function towardBase(side: SideKey, p: Pt, amount: number): Pt {
  const base = BASES[side];
  const d = dist(p, base);
  if (d < 0.01) return { ...p };
  const t = Math.min(1, amount / d);
  return { x: p.x + (base.x - p.x) * t, y: p.y + (base.y - p.y) * t };
}

/**
 * Generate the full spatial layer for a strategic outcome. Consumes only
 * the `:spatial` RNG stream so it never perturbs the strategic result.
 */
export function generateSpatialLog(outcome: StrategicOutcome): {
  log: SpatialLog;
  attributions: KillAttribution[];
  csOverride: Map<string, number>;
} {
  const rng = createRng(hashSeed(`${outcome.seed}:spatial`));
  const durationTicks = outcome.duration * TICKS_PER_MINUTE;

  const blueP = roleOrder(outcome.sides.blue.ctx);
  const redP = roleOrder(outcome.sides.red.ctx);
  const units: UnitRt[] = [...blueP, ...redP].map((p, idx) => {
    const side: SideKey = idx < 5 ? "blue" : "red";
    return {
      idx,
      id: p.id,
      handle: p.handle,
      role: p.role,
      side,
      pos: { ...BASES[side] },
      state: "rotating" as UnitState,
      target: { ...BASES[side] },
      respawnAt: -1,
      fightUntil: -1,
      campCursor: rng.int(0, JUNGLE_CAMPS[side].length - 1),
      csTicks: 0,
      speedJitter: 0.9 + rng.next() * 0.2,
    };
  });
  const sideUnits = (s: SideKey) => (s === "blue" ? units.slice(0, 5) : units.slice(5, 10));

  const frames: SpatialFrame[] = [];
  const kills: SpatialKill[] = [];
  const tags: SpatialTag[] = [];
  const attributions: KillAttribution[] = new Array(outcome.killSlots.length);

  // Tower tracking so TOWER events target a real remaining turret.
  const towersLeft: Record<SideKey, Record<LaneId | "nexus", number>> = {
    blue: { top: 3, mid: 3, bot: 3, nexus: 2 },
    red: { top: 3, mid: 3, bot: 3, nexus: 2 },
  };

  const alive = (u: UnitRt) => u.state !== "dead";

  /** Objective pit for an event type at a given minute. */
  const pitOf = (type: string): Pt =>
    type === "DRAGON" ? DRAGON_PIT : BARON_PIT; // herald + baron share the top pit

  /** Choose which remaining turret a TOWER event knocks down. */
  const pickTower = (losingSide: SideKey, pressure: number): { lane: LaneId | "nexus"; pos: Pt } => {
    const lanes = (["top", "mid", "bot"] as LaneId[]).filter((l) => towersLeft[losingSide][l] > 0);
    if (lanes.length === 0) {
      if (towersLeft[losingSide].nexus > 0) {
        towersLeft[losingSide].nexus--;
        const spot = TURRETS.find((t) => t.side === losingSide && t.lane === "nexus");
        return { lane: "nexus", pos: spot?.pos ?? BASES[losingSide] };
      }
      return { lane: "nexus", pos: BASES[losingSide] };
    }
    // Prefer the lane where the winner has pressure; mid slightly favored.
    const weights = lanes.map((l) => (l === "mid" ? 1.3 : 1) + Math.abs(pressure));
    const lane = rng.weightedPick(lanes, weights);
    const tier = (4 - towersLeft[losingSide][lane]) as 1 | 2 | 3;
    towersLeft[losingSide][lane]--;
    const spot = TURRETS.find((t) => t.side === losingSide && t.lane === lane && t.tier === tier);
    return { lane, pos: spot?.pos ?? laneFront(lane, 0) };
  };

  /* ── Main loop: plan each minute, then execute its 30 ticks ─── */
  let slotCursor = 0;
  for (let minute = 1; minute <= outcome.duration; minute++) {
    const minuteStart = (minute - 1) * TICKS_PER_MINUTE;
    const gold = outcome.goldTimeline[Math.min(minute, outcome.goldTimeline.length - 1)];
    const pressure = Math.max(-1, Math.min(1, gold / 12000)); // + = blue pushing
    const phase = minute < 14 ? "early" : minute < 25 ? "mid" : "late";

    const minuteEvents = outcome.events.filter((e) => e.minute === minute);
    const minuteSlots: { slot: (typeof outcome.killSlots)[number]; index: number }[] = [];
    while (
      slotCursor + minuteSlots.length < outcome.killSlots.length &&
      outcome.killSlots[slotCursor + minuteSlots.length].minute === minute
    ) {
      const index = slotCursor + minuteSlots.length;
      minuteSlots.push({ slot: outcome.killSlots[index], index });
    }
    slotCursor += minuteSlots.length;

    const objective = minuteEvents.find(
      (e) => e.type === "DRAGON" || e.type === "BARON" || e.type === "HERALD",
    );
    const throwEvent = minuteEvents.find((e) => e.type === "THROW");

    /* Default intents for the minute. */
    for (const u of units) {
      if (u.state === "dead") continue;
      u.state = u.state === "basing" ? "rotating" : u.state;
      const lane = LANE_OF_ROLE[u.role];
      if (phase === "late") {
        // Teams group around the strongest front; trailing side sits deeper.
        const grouped = laneFront("mid", pressure);
        const back = (u.side === "blue" ? pressure < 0 : pressure > 0) ? 7 : 2;
        const anchor = towardBase(u.side, grouped, back + rng.next() * 4);
        u.target = anchor;
        u.state = "rotating";
      } else if (lane) {
        const facing = u.side === "blue" ? -0.025 : 0.025;
        const t = 0.5 + Math.max(-0.24, Math.min(0.24, pressure * 0.22)) + facing;
        const spread = u.role === "SUP" ? 2.5 : 0;
        const p = pathPoint(LANE_PATHS[lane], t);
        u.target = { x: p.x + rng.normal(0, 1) + spread, y: p.y + rng.normal(0, 1) };
        u.state = "laning";
      } else {
        // Jungler roams camps.
        const camps = JUNGLE_CAMPS[u.side];
        u.target = camps[u.campCursor % camps.length];
        u.state = "laning";
      }
    }

    /* Plan fights for this minute. */
    const fights: PlannedFight[] = [];
    const claimedVictims = new Set<number>();

    // Objective minute: everyone relevant converges on the pit.
    let objectiveTick = -1;
    let objectiveLoc: Pt | null = null;
    if (objective) {
      objectiveLoc = pitOf(objective.type);
      objectiveTick = minuteStart + rng.int(14, 20);
      for (const s of ["blue", "red"] as SideKey[]) {
        const contesters = sideUnits(s).filter(alive);
        const count = phase === "early" ? 3 : 5;
        for (const u of contesters.slice(0, count)) {
          const off = { x: rng.normal(0, 2.5), y: rng.normal(0, 2.5) };
          const standoff = objective.team === s ? 1.5 : 7;
          u.target = towardBase(s, { x: objectiveLoc.x + off.x, y: objectiveLoc.y + off.y }, standoff - 1.5);
          u.state = "rotating";
        }
      }
    }

    // Kill slots → fights. Kills share the objective/throw location when present.
    if (minuteSlots.length > 0) {
      const groups = new Map<string, { loc: Pt; tick: number; items: typeof minuteSlots }>();
      for (const item of minuteSlots) {
        const ctxKey =
          item.slot.context === "throw" || item.slot.context === "steal"
            ? "baron"
            : objective
              ? "objective"
              : `skirmish-${item.slot.side}`;
        if (!groups.has(ctxKey)) {
          let loc: Pt;
          let tick: number;
          if (ctxKey === "baron") {
            loc = BARON_PIT;
            tick = minuteStart + rng.int(16, 24);
          } else if (ctxKey === "objective" && objectiveLoc) {
            loc = objectiveLoc;
            tick = objectiveTick + rng.int(0, 3);
          } else {
            // Gank / skirmish: pick the victim first, fight happens where they are.
            const vsSide: SideKey = item.slot.side === "blue" ? "red" : "blue";
            const cands = sideUnits(vsSide).filter(alive);
            const pool = cands.length > 0 ? cands : sideUnits(vsSide);
            const weights = pool.map(
              (u) => (u.role === "SUP" ? 1.25 : u.role === "JGL" ? 1.1 : 1) * 1,
            );
            const victim = rng.weightedPick(pool, weights);
            const vLane = LANE_OF_ROLE[victim.role];
            loc =
              phase === "early" && vLane
                ? laneFront(vLane, pressure)
                : phase === "early"
                  ? JUNGLE_CAMPS[victim.side][rng.int(0, 3)]
                  : rng.chance(0.5)
                    ? { x: 50 + rng.normal(0, 9), y: 50 + rng.normal(0, 9) }
                    : laneFront(vLane ?? "mid", pressure);
            tick = minuteStart + rng.int(8, 24);
          }
          groups.set(ctxKey, { loc, tick, items: [] });
        }
        groups.get(ctxKey)!.items.push(item);
      }

      for (const group of groups.values()) {
        const killSide = group.items[0].slot.side;
        const defSide: SideKey = killSide === "blue" ? "red" : "blue";
        // Attackers: killer candidates converge — jungler joins ganks.
        const atk = sideUnits(killSide).filter(alive);
        const attackers =
          phase === "early"
            ? atk.filter((u) => u.role === "JGL" || dist(u.pos, group.loc) < 30).slice(0, 3)
            : atk;
        const nearDef = sideUnits(defSide)
          .filter(alive)
          .filter((u) => dist(u.target, group.loc) < 26);
        for (const u of [...attackers, ...nearDef]) {
          u.target = {
            x: group.loc.x + rng.normal(0, 2.2),
            y: group.loc.y + rng.normal(0, 2.2),
          };
          if (u.state !== "laning" || dist(u.pos, group.loc) > 10) u.state = "rotating";
        }
        fights.push({
          tick: Math.min(group.tick, minuteStart + TICKS_PER_MINUTE - 2),
          loc: group.loc,
          slotIndexes: group.items.map((i) => i.index),
          attackers: (attackers.length > 0 ? attackers : atk).map((u) => u.idx),
          defenders: sideUnits(defSide).map((u) => u.idx),
        });
      }
    }
    fights.sort((a, b) => a.tick - b.tick);

    // Tower events: winners walk onto the turret.
    const towerEvents = minuteEvents.filter((e) => e.type === "TOWER");
    for (const te of towerEvents) {
      const losing: SideKey = te.team === "blue" ? "red" : "blue";
      const tower = pickTower(losing, pressure);
      const tick = minuteStart + rng.int(10, 26);
      tags.push({
        tick,
        x: tower.pos.x,
        y: tower.pos.y,
        kind: "tower",
        side: te.team,
        text: "TOWER",
      });
      const pushers = sideUnits(te.team)
        .filter(alive)
        .filter((u) => LANE_OF_ROLE[u.role] === tower.lane || u.role === "JGL")
        .slice(0, 3);
      for (const u of pushers) {
        u.target = { x: tower.pos.x + rng.normal(0, 2), y: tower.pos.y + rng.normal(0, 2) };
        u.state = "rotating";
      }
    }

    // Objective / throw / nexus tags.
    if (objective && objectiveLoc) {
      tags.push({
        tick: objectiveTick,
        x: objectiveLoc.x,
        y: objectiveLoc.y,
        kind: objective.type.toLowerCase() as SpatialTag["kind"],
        side: objective.team,
        text: objective.type,
      });
    }
    if (throwEvent) {
      tags.push({
        tick: minuteStart + rng.int(16, 24),
        x: BARON_PIT.x,
        y: BARON_PIT.y,
        kind: "throw",
        side: throwEvent.team,
        text: "THROW",
      });
    }
    const nexusEvent = minuteEvents.find((e) => e.type === "NEXUS");
    if (nexusEvent) {
      const losingBase = BASES[nexusEvent.team === "blue" ? "red" : "blue"];
      for (const u of sideUnits(nexusEvent.team).filter(alive)) {
        u.target = { x: losingBase.x + rng.normal(0, 3), y: losingBase.y + rng.normal(0, 3) };
        u.state = "rotating";
      }
      tags.push({
        tick: durationTicks - 2,
        x: losingBase.x,
        y: losingBase.y,
        kind: "nexus",
        side: nexusEvent.team,
        text: "NEXUS",
      });
    }

    /* Execute the minute tick by tick. */
    let fightCursor = 0;
    for (let tick = minuteStart; tick < minuteStart + TICKS_PER_MINUTE; tick++) {
      // Respawns.
      for (const u of units) {
        if (u.state === "dead" && tick >= u.respawnAt) {
          u.pos = { ...BASES[u.side] };
          u.state = "basing";
        }
        if (u.state === "fighting" && tick >= u.fightUntil) u.state = "rotating";
      }

      // Resolve fights scheduled for this tick.
      while (fightCursor < fights.length && fights[fightCursor].tick <= tick) {
        const fight = fights[fightCursor++];
        const loc = fight.loc;
        for (const slotIndex of fight.slotIndexes) {
          const slot = outcome.killSlots[slotIndex];
          const killSide = slot.side;
          const defSide: SideKey = killSide === "blue" ? "red" : "blue";
          const ks = outcome.sides[killSide];
          const vs = outcome.sides[defSide];

          // Presence: alive units near the fight. Guarantee at least one on
          // each side by pulling the closest planned participant in.
          const present = (s: SideKey) =>
            sideUnits(s).filter(alive).filter((u) => dist(u.pos, loc) <= FIGHT_RADIUS);
          let killersPresent = present(killSide);
          if (killersPresent.length === 0) {
            const pool = sideUnits(killSide).filter(alive);
            if (pool.length === 0) continue; // no living killers: leave slot to fallback sampling
            const nearest = pool.reduce((a, b) => (dist(a.pos, loc) < dist(b.pos, loc) ? a : b));
            nearest.pos = { x: loc.x + rng.normal(0, 1.5), y: loc.y + rng.normal(0, 1.5) };
            nearest.state = "rotating";
            killersPresent = [nearest];
          }
          let victimsPresent = sideUnits(defSide)
            .filter(alive)
            .filter((u) => !claimedVictims.has(u.idx) && dist(u.pos, loc) <= FIGHT_RADIUS);
          if (victimsPresent.length === 0) {
            const candidates = sideUnits(defSide)
              .filter(alive)
              .filter((u) => !claimedVictims.has(u.idx));
            const pool = candidates.length > 0 ? candidates : sideUnits(defSide).filter(alive);
            if (pool.length === 0) continue; // whole team dead: leave slot to fallback sampling
            const nearest = pool.reduce((a, b) => (dist(a.pos, loc) < dist(b.pos, loc) ? a : b));
            nearest.pos = { x: loc.x + rng.normal(0, 1.5), y: loc.y + rng.normal(0, 1.5) };
            victimsPresent = [nearest];
          }

          // Attribute with v1 math, restricted to who is actually here.
          const kWeightsAll = killerWeights(ks);
          const killerUnit = rng.weightedPick(
            killersPresent,
            killersPresent.map((u) => kWeightsAll[ks.ctx.players.findIndex((p) => p.id === u.id)]),
          );
          const vWeightsAll = victimWeights(vs);
          const victimUnit = rng.weightedPick(
            victimsPresent,
            victimsPresent.map((u) => vWeightsAll[vs.ctx.players.findIndex((p) => p.id === u.id)]),
          );
          const assistUnits = killersPresent.filter(
            (u) => u.idx !== killerUnit.idx && rng.chance(0.85),
          );
          attributions[slotIndex] = {
            killerId: killerUnit.id,
            victimId: victimUnit.id,
            assistIds: assistUnits.map((u) => u.id),
          };
          claimedVictims.add(victimUnit.idx);

          // Death state + respawn.
          const deathTick = tick;
          victimUnit.state = "dead";
          victimUnit.respawnAt = deathTick + respawnTicks(minute);
          victimUnit.pos = { x: loc.x + rng.normal(0, 2), y: loc.y + rng.normal(0, 2) };
          for (const u of [killerUnit, ...assistUnits]) {
            if (u.state !== "dead") {
              u.state = "fighting";
              u.fightUntil = tick + 3;
            }
          }
          kills.push({
            tick,
            x: victimUnit.pos.x,
            y: victimUnit.pos.y,
            killer: killerUnit.idx,
            victim: victimUnit.idx,
            assists: assistUnits.map((u) => u.idx),
            respawnTick: victimUnit.respawnAt,
            side: killSide,
            firstBlood: slot.firstBlood,
          });
          tags.push({
            tick,
            x: victimUnit.pos.x,
            y: victimUnit.pos.y,
            kind: slot.firstBlood ? "first_blood" : "kill",
            side: killSide,
            text: slot.firstBlood ? "FIRST BLOOD" : `${killerUnit.handle} ⚔ ${victimUnit.handle}`,
          });
        }
      }

      // Movement + CS accrual.
      for (const u of units) {
        if (u.state === "dead") continue;
        const speed =
          (u.state === "laning" ? SPEED.laning : u.state === "fighting" ? 0.6 : SPEED.rotating) *
          u.speedJitter;
        const d = dist(u.pos, u.target);
        if (d > 0.8) {
          const step = Math.min(speed, d);
          u.pos = {
            x: u.pos.x + ((u.target.x - u.pos.x) / d) * step + rng.normal(0, 0.2),
            y: u.pos.y + ((u.target.y - u.pos.y) / d) * step + rng.normal(0, 0.2),
          };
        } else if (u.state === "laning") {
          // Oscillate around the front / farm the camp.
          u.pos = { x: u.pos.x + rng.normal(0, 0.5), y: u.pos.y + rng.normal(0, 0.5) };
          if (u.role === "JGL" && rng.chance(0.12)) {
            u.campCursor++;
            const camps = JUNGLE_CAMPS[u.side];
            u.target = camps[u.campCursor % camps.length];
          }
        } else if (u.state === "basing") {
          u.state = "rotating";
        }
        u.pos.x = Math.min(97, Math.max(3, u.pos.x));
        u.pos.y = Math.min(97, Math.max(3, u.pos.y));
        if (u.state === "laning") u.csTicks++;
      }

      frames.push({
        x: units.map((u) => Math.round(u.pos.x * 10) / 10),
        y: units.map((u) => Math.round(u.pos.y * 10) / 10),
        state: units.map((u) => u.state),
      });
    }
  }

  /* CS from time actually spent farming. */
  const csOverride = new Map<string, number>();
  const signedFor = (s: SideKey, amount: number) => (s === "blue" ? amount : -amount);
  for (const u of units) {
    const side = outcome.sides[u.side];
    const eff = side.eff.get(u.id) ?? 1;
    const p = side.ctx.players.find((x) => x.id === u.id)!;
    const leadFactor = 1 + signedFor(u.side, outcome.finalGold) / 40000;
    const minutesFarming = u.csTicks / TICKS_PER_MINUTE;
    csOverride.set(
      u.id,
      Math.round(
        CS_PER_MIN[u.role] *
          minutesFarming *
          CS_LANING_COMPENSATION *
          (0.72 + (p.attributes.mechanics / 40) * eff) *
          leadFactor,
      ),
    );
  }

  // Fill any unresolved slots (defensive): sample from alive players.
  fillMissingAttributions(outcome, attributions, rng);

  const log: SpatialLog = {
    ticksPerMinute: TICKS_PER_MINUTE,
    durationTicks,
    unitIds: units.map((u) => u.id),
    handles: units.map((u) => u.handle),
    roles: units.map((u) => u.role),
    frames,
    kills,
    tags,
  };
  return { log, attributions, csOverride };
}

function fillMissingAttributions(
  outcome: StrategicOutcome,
  attributions: KillAttribution[],
  rng: Rng,
): void {
  outcome.killSlots.forEach((slot, i) => {
    if (attributions[i]) return;
    const ks: SideState = outcome.sides[slot.side];
    const vs: SideState = outcome.sides[slot.side === "blue" ? "red" : "blue"];
    const killer = rng.weightedPick(ks.ctx.players, killerWeights(ks));
    const victim = rng.weightedPick(vs.ctx.players, victimWeights(vs));
    attributions[i] = { killerId: killer.id, victimId: victim.id, assistIds: [] };
  });
}

/**
 * Full spatial match: strategic core + spatial attribution + position log.
 * result.winner/goldTimeline/durationMin are identical to simulateMatch()
 * for the same seed; only K/D/A attribution and CS come from the map.
 */
export function simulateSpatialMatch(
  blue: TeamContext,
  red: TeamContext,
  seed: number,
  options: MatchOptions = {},
): SpatialMatch {
  const outcome = runStrategic(blue, red, seed, options);
  const { log, attributions, csOverride } = generateSpatialLog(outcome);
  const rngDetail = createRng(hashSeed(`${seed}:spatial-detail`));
  applyKillAttributions(outcome, attributions, rngDetail);
  return { result: finalizeMatch(outcome, csOverride), log };
}

/** Regenerate a log from saved inputs (pure — used by the match viewer). */
export function spatialFromInputs(inputs: SpatialInputs): SpatialMatch {
  return simulateSpatialMatch(inputs.blue, inputs.red, inputs.seed, {
    elimination: inputs.elimination,
    varianceBoost: inputs.varianceBoost,
  });
}
