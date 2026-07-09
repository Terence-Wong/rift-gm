"use client";

import { useMemo } from "react";
import { TeamCrest } from "@/components/TeamCrest";
import { fmtGoldDiff } from "@/lib/format";
import { useGameStore } from "@/lib/store";
import type { Fixture } from "@/lib/types";

export default function SchedulePage() {
  const s = useGameStore();

  const byWeek = useMemo(() => {
    const map = new Map<number, Fixture[]>();
    for (const f of s.fixtures) {
      const list = map.get(f.week) ?? [];
      list.push(f);
      map.set(f.week, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [s.fixtures]);

  if (s.fixtures.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        No matches yet. Start a season from the dashboard.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="display text-xl font-bold">Schedule</h1>
      <p className="eyebrow -mt-2">
        Double round robin · your matches highlighted · playoff series appear on the League page
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {byWeek.map(([week, fixtures]) => {
          const isCurrent = week === s.week && s.phase === "REGULAR";
          return (
            <section
              key={week}
              className={`panel p-3 ${isCurrent ? "outline-1 outline-cyan-dim" : ""}`}
              aria-label={`Week ${week}`}
            >
              <h2 className="eyebrow mb-2">
                Week {week}
                {isCurrent ? <span className="ml-2 text-cyan">← you are here</span> : null}
              </h2>
              <ul className="flex flex-col gap-1.5">
                {fixtures.map((f) => {
                  const blue = s.teams[f.blueId];
                  const red = s.teams[f.redId];
                  const mine = f.blueId === s.playerTeamId || f.redId === s.playerTeamId;
                  const result = f.result;
                  const blueWon = result?.winner === "blue";
                  return (
                    <li
                      key={f.id}
                      className={`flex items-center gap-2 px-2 py-1.5 text-sm ${mine ? "bg-fog-800" : ""}`}
                    >
                      <TeamCrest team={blue} size={20} />
                      <span className={`w-10 ${result ? (blueWon ? "font-semibold text-ink" : "text-ink-muted") : ""}`}>
                        {blue.shortName}
                      </span>
                      {result ? (
                        <span className="num flex-1 text-center text-xs text-ink-muted">
                          {blueWon ? "1–0" : "0–1"} · {result.durationMin}m ·{" "}
                          {fmtGoldDiff(result.goldTimeline[result.goldTimeline.length - 1])}
                        </span>
                      ) : (
                        <span className="flex-1 text-center text-xs text-ink-muted">vs</span>
                      )}
                      <span className={`w-10 text-right ${result ? (!blueWon ? "font-semibold text-ink" : "text-ink-muted") : ""}`}>
                        {red.shortName}
                      </span>
                      <TeamCrest team={red} size={20} />
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
