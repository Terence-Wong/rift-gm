"use client";

/**
 * Champ-select-style draft: pick a comp archetype (with counter hints),
 * playstyle, objective focus, and one target ban from the enemy five.
 */

import { Term } from "@/components/Term";
import type { MatchIntel } from "@/lib/engine/intel";
import { ARCHETYPES, counterEdge, OBJECTIVES, PLAYSTYLES } from "@/lib/engine/tactics";
import type {
  CompArchetype,
  ObjectiveFocus,
  Player,
  Playstyle,
  Team,
  TeamTactics,
} from "@/lib/types";
import { ROLES } from "@/lib/types";

const ARCHETYPE_KEYS = Object.keys(ARCHETYPES) as CompArchetype[];
const PLAYSTYLE_KEYS = Object.keys(PLAYSTYLES) as Playstyle[];
const OBJECTIVE_KEYS = Object.keys(OBJECTIVES) as ObjectiveFocus[];

export function DraftBoard({
  tactics,
  onChange,
  opponent,
  players,
  likelyOpponentComp,
  intel,
}: {
  tactics: TeamTactics;
  onChange: (t: TeamTactics) => void;
  opponent: Team;
  players: Record<string, Player>;
  /** Revealed at scout level ≥ 3; undefined = unknown. */
  likelyOpponentComp?: CompArchetype;
  /** Actionable scouting intel, rendered inline so scouting pays off here. */
  intel?: MatchIntel;
}) {
  const set = (patch: Partial<TeamTactics>) => onChange({ ...tactics, ...patch });
  const intelLines = intel
    ? [intel.suggestedBanLine, intel.counterLine, intel.weaknessLine].filter(Boolean)
    : [];

  return (
    <section className="panel p-4" aria-labelledby="draft-head" data-tut="draft-board">
      <h2 id="draft-head" className="eyebrow mb-3">
        Draft &amp; tactics
        {likelyOpponentComp ? (
          <span className="ml-2 normal-case tracking-normal text-cyan">
            — scouting suggests {opponent.shortName} run {ARCHETYPES[likelyOpponentComp].label}
          </span>
        ) : null}
      </h2>

      {intel ? (
        <aside
          className="panel-raised mb-4 border-l-2 p-3"
          style={{ borderLeftColor: "var(--hextech-gold)" }}
          aria-label="Scouting intel"
        >
          <p className="eyebrow mb-1 text-gold">From scouting · level {intel.level}/5</p>
          {intelLines.length === 0 ? (
            <p className="text-xs leading-5 text-ink-muted">
              Thin file — nothing actionable yet. Set {opponent.shortName} as your scouting
              target to unlock ban and comp reads.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5 text-xs leading-5">
              {intelLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </aside>
      ) : null}

      {/* Comp archetype — champ-select style row */}
      <fieldset className="mb-4 border-0 p-0">
        <legend className="eyebrow mb-2">
          <Term k="archetype">Comp archetype</Term>
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {ARCHETYPE_KEYS.map((key) => {
            const edge = likelyOpponentComp ? counterEdge(key, likelyOpponentComp) : 0;
            const active = tactics.archetype === key;
            return (
              <button
                key={key}
                onClick={() => set({ archetype: key })}
                aria-pressed={active}
                className={`panel-raised flex flex-col gap-1 p-2.5 text-left transition-colors hover:bg-fog-700 ${
                  active ? "outline-2 outline-cyan" : ""
                }`}
              >
                <span className="display text-sm font-bold">{ARCHETYPES[key].label}</span>
                <span className="text-xs leading-4 text-ink-muted">{ARCHETYPES[key].blurb}</span>
                {likelyOpponentComp ? (
                  <span
                    className="num mt-auto text-xs"
                    style={{
                      color: edge > 0 ? "var(--blue-cyan)" : edge < 0 ? "var(--red-ember)" : "var(--ink-muted)",
                    }}
                  >
                    {edge > 0 ? "counters them" : edge < 0 ? "gets countered" : "even matchup"}
                  </span>
                ) : (
                  <span className="num mt-auto text-xs text-ink-muted">matchup unknown</span>
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <fieldset className="border-0 p-0">
          <legend className="eyebrow mb-2">Playstyle</legend>
          <div className="flex flex-col gap-1.5">
            {PLAYSTYLE_KEYS.map((key) => (
              <label key={key} className={`panel-raised flex cursor-pointer items-start gap-2 p-2 ${tactics.playstyle === key ? "outline-1 outline-cyan" : ""}`}>
                <input
                  type="radio"
                  name="playstyle"
                  checked={tactics.playstyle === key}
                  onChange={() => set({ playstyle: key })}
                  className="mt-1 accent-[var(--blue-cyan)]"
                />
                <span>
                  <span className="block text-sm font-semibold">{PLAYSTYLES[key].label}</span>
                  <span className="text-xs text-ink-muted">{PLAYSTYLES[key].blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="border-0 p-0">
          <legend className="eyebrow mb-2">Objective focus</legend>
          <div className="flex flex-col gap-1.5">
            {OBJECTIVE_KEYS.map((key) => (
              <label key={key} className={`panel-raised flex cursor-pointer items-start gap-2 p-2 ${tactics.objective === key ? "outline-1 outline-cyan" : ""}`}>
                <input
                  type="radio"
                  name="objective"
                  checked={tactics.objective === key}
                  onChange={() => set({ objective: key })}
                  className="mt-1 accent-[var(--blue-cyan)]"
                />
                <span>
                  <span className="block text-sm font-semibold">{OBJECTIVES[key].label}</span>
                  <span className="text-xs text-ink-muted">{OBJECTIVES[key].blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {/* Target ban row */}
      <fieldset className="mt-4 border-0 p-0">
        <legend className="eyebrow mb-2">
          <Term k="targetBan">Target ban</Term> — cripple one enemy champion pool
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((role) => {
            const p = players[opponent.starters[role]];
            if (!p) return null;
            const active = tactics.targetBan === p.id;
            const suggested = intel?.suggestedBanId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => set({ targetBan: active ? undefined : p.id })}
                aria-pressed={active}
                title={suggested ? "Scouting recommends this ban" : undefined}
                className={`display border px-3 py-1.5 text-xs font-bold transition-colors ${
                  active
                    ? "border-ember bg-ember/15 text-ember line-through"
                    : suggested
                      ? "border-gold bg-fog-800 text-gold hover:bg-fog-700"
                      : "border-hairline bg-fog-800 text-ink hover:bg-fog-700"
                }`}
              >
                {role} · {p.handle}
                {suggested && !active ? <span aria-hidden> ◆</span> : null}
              </button>
            );
          })}
          <button
            onClick={() => set({ targetBan: undefined })}
            aria-pressed={!tactics.targetBan}
            className={`display border px-3 py-1.5 text-xs font-bold ${!tactics.targetBan ? "border-cyan text-cyan" : "border-hairline text-ink-muted hover:text-ink"}`}
          >
            No ban
          </button>
        </div>
      </fieldset>
    </section>
  );
}
