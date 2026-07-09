"use client";

import Link from "next/link";
import { AttributeBar } from "@/components/AttributeBar";
import { Term } from "@/components/Term";
import { hiddenVisibleAt, scoutedRange } from "@/lib/engine/scouting";
import type { Player, Team } from "@/lib/types";
import { ROLES } from "@/lib/types";

/** Opponent scouting report: fuzzy ranges only, tighter with scout level. */
export function ScoutingCard({
  team,
  players,
  scoutLevel,
}: {
  team: Team;
  players: Record<string, Player>;
  scoutLevel: number;
}) {
  return (
    <section className="panel p-4" aria-labelledby="scout-head">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 id="scout-head" className="eyebrow">
          <Term k="scouting">Scouting report</Term> · {team.name}
        </h2>
        <span className="eyebrow" aria-label={`Scout level ${scoutLevel} of 5`}>
          {Array.from({ length: 5 }, (_, i) => (
            <span key={i} aria-hidden style={{ color: i < scoutLevel ? "var(--hextech-gold)" : "var(--hairline)" }}>
              ◆
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {ROLES.map((role) => {
          const p = players[team.starters[role]];
          if (!p) return null;
          const hiddenUnlocked = hiddenVisibleAt(scoutLevel);
          return (
            <div key={role} className="panel-raised p-2.5">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="num text-xs text-ink-muted">{role}</span>
                <Link href={`/players/${p.id}`} className="text-sm font-semibold hover:text-cyan">
                  {p.handle}
                </Link>
                <span className="num ml-auto text-xs text-ink-muted">
                  form {p.form > 0 ? "+" : ""}
                  {p.form.toFixed(1)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <AttributeBar label="Laning" range={scoutedRange(p, "laning", scoutLevel)} />
                <AttributeBar label="Mech" range={scoutedRange(p, "mechanics", scoutLevel)} />
                <AttributeBar label="Macro" range={scoutedRange(p, "macro", scoutLevel)} />
                <AttributeBar
                  label="Clutch"
                  range={hiddenUnlocked ? scoutedRange(p, "clutch", scoutLevel) : undefined}
                  locked={!hiddenUnlocked}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        {scoutLevel <= 1
          ? "Thin file. Set this team as your scouting target (Training screen) to tighten the ranges."
          : scoutLevel < 4
            ? "Ranges tighten the more you scout and face this team. Hidden attributes unlock at level 4."
            : "Deep file — hidden attributes estimated."}
      </p>
    </section>
  );
}
