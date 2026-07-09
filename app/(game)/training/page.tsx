"use client";

import Link from "next/link";
import { Term } from "@/components/Term";
import { projectedGain, TRAINABLE } from "@/lib/engine/development";
import { useGameStore } from "@/lib/store";
import type { AttributeKey, Player } from "@/lib/types";

const FOCUS_LABEL: Record<string, string> = {
  laning: "Laning",
  mechanics: "Mechanics",
  macro: "Macro",
  teamfight: "Teamfight",
  aggression: "Aggression",
};

export default function TrainingPage() {
  const s = useGameStore();
  const team = s.teams[s.playerTeamId];
  const roster = team.roster.map((id) => s.players[id]).filter(Boolean) as Player[];
  const otherTeams = Object.values(s.teams).filter((t) => t.id !== s.playerTeamId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-xl font-bold">Training &amp; scouting</h1>
      <p className="-mt-2 flex flex-wrap items-baseline gap-x-1 text-sm text-ink-muted">
        Focus applies when the week advances. Growth is gated by age and hidden{" "}
        <Term k="potential">potential</Term> — young players with headroom move fastest.
      </p>

      <section className="panel overflow-x-auto" aria-labelledby="training-head">
        <h2 id="training-head" className="sr-only">Weekly training focus</h2>
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="eyebrow px-3 py-2 font-medium">Player</th>
              <th className="eyebrow py-2 pr-3 text-right font-medium">Age</th>
              <th className="eyebrow py-2 pr-3 text-right font-medium">OVR</th>
              <th className="eyebrow py-2 pr-3 font-medium">Focus</th>
              <th className="eyebrow py-2 pr-3 text-right font-medium">Current</th>
              <th className="eyebrow py-2 pr-3 text-right font-medium">Proj / wk</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => {
              const focus = (s.trainingFocus[p.id] ?? "laning") as AttributeKey;
              return (
                <tr key={p.id} className="border-b border-hairline/50">
                  <td className="px-3 py-2">
                    <Link href={`/players/${p.id}`} className="font-semibold hover:text-cyan">
                      {p.handle}
                    </Link>
                    <span className="num ml-2 text-xs text-ink-muted">{p.role}</span>
                  </td>
                  <td className="num py-2 pr-3 text-right">{p.age}</td>
                  <td className="num py-2 pr-3 text-right text-cyan">{p.ovr.toFixed(1)}</td>
                  <td className="py-2 pr-3">
                    <select
                      value={focus}
                      onChange={(e) => s.setTrainingFocus(p.id, e.target.value as AttributeKey)}
                      aria-label={`Training focus for ${p.handle}`}
                      data-tut="training-focus"
                      className="panel-raised px-2 py-1 text-sm text-ink"
                    >
                      {TRAINABLE.map((key) => (
                        <option key={key} value={key}>
                          {FOCUS_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="num py-2 pr-3 text-right">{Math.round(p.attributes[focus])}</td>
                  <td className="num py-2 pr-3 text-right text-cyan">
                    +{projectedGain(p, focus).toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel p-4" aria-labelledby="scout-target-head">
        <h2 id="scout-target-head" className="eyebrow mb-2">Scouting target — one team per week gains a level</h2>
        <div className="flex flex-wrap gap-1.5">
          {otherTeams.map((t) => {
            const level = s.scouting[t.id] ?? 0;
            const active = s.scoutTargetId === t.id;
            return (
              <button
                key={t.id}
                onClick={() => s.setScoutTarget(active ? null : t.id)}
                aria-pressed={active}
                className={`display border px-3 py-1.5 text-xs font-bold ${
                  active ? "border-cyan bg-cyan/10 text-cyan" : "border-hairline bg-fog-800 text-ink hover:bg-fog-700"
                }`}
              >
                {t.shortName} <span className="num font-normal text-ink-muted">{level}/5</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
