/**
 * Match-prep intel: turns scouting levels into concrete, draft-screen
 * suggestions so scouting visibly changes the next decision (the FM
 * "information is a progression currency" pattern). Pure and seeded.
 */

import type { CompArchetype, Player, Team } from "../types";
import { ROLES } from "../types";
import { aiTactics } from "./ai";
import { ARCHETYPES, counterEdge } from "./tactics";

export interface MatchIntel {
  /** Scout level the intel was built at. */
  level: number;
  /** ≥2: the opponent's engine — recommended target ban. */
  suggestedBanId?: string;
  suggestedBanLine?: string;
  /** ≥3: their likely comp (deterministic read of the AI's actual pick). */
  likelyComp?: CompArchetype;
  /** ≥3: the archetype that counters the likely comp hardest. */
  counterPick?: CompArchetype;
  counterLine?: string;
  /** ≥4: an exploitable weakness in their five. */
  weaknessLine?: string;
}

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as CompArchetype[];

/**
 * Build the pre-match intel card. Level gates mirror the scouting fiction:
 * 0–1 you know nothing actionable; 2 you know who carries them; 3 you can
 * call their comp and the counter; 4+ you know where they're soft this week.
 */
export function buildMatchIntel(
  opponent: Team,
  myTeam: Team,
  players: Record<string, Player>,
  scoutLevel: number,
  seedKey: string,
): MatchIntel {
  const intel: MatchIntel = { level: scoutLevel };
  const starters = ROLES.map((r) => players[opponent.starters[r]]).filter(Boolean);
  if (starters.length < 5) return intel;

  if (scoutLevel >= 2) {
    const engine = starters.reduce((top, p) => (p.ovr + p.form * 0.5 > top.ovr + top.form * 0.5 ? p : top));
    intel.suggestedBanId = engine.id;
    intel.suggestedBanLine = `${engine.handle} is their engine — ban into their pool.`;
  }

  if (scoutLevel >= 3) {
    const likely = aiTactics(opponent, myTeam, players, seedKey).archetype;
    intel.likelyComp = likely;
    const counter = ARCHETYPE_KEYS.reduce((best, key) =>
      counterEdge(key, likely) > counterEdge(best, likely) ? key : best,
    );
    if (counterEdge(counter, likely) > 0) {
      intel.counterPick = counter;
      intel.counterLine = `We expect ${ARCHETYPES[likely].label.toLowerCase()} — ${ARCHETYPES[counter].label} counters it.`;
    }
  }

  if (scoutLevel >= 4) {
    const soft = starters.reduce((worst, p) => {
      const wobble = (p: Player) => p.form - Math.max(0, p.fatigue - 50) / 25;
      return wobble(p) < wobble(worst) ? p : worst;
    });
    if (soft.form < 0.3 || soft.fatigue > 55) {
      const why = soft.fatigue > 55 ? "running on fumes" : "out of form";
      intel.weaknessLine = `${soft.handle} (${soft.role}) is ${why} — that lane is targetable.`;
    }
  }

  return intel;
}
