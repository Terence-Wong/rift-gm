"use client";

import { fmtMoney } from "@/lib/format";
import { useGameStore } from "@/lib/store";
import { TeamCrest } from "./TeamCrest";

export function TopBar() {
  const team = useGameStore((s) => s.teams[s.playerTeamId]);
  const season = useGameStore((s) => s.season);
  const week = useGameStore((s) => s.week);
  const phase = useGameStore((s) => s.phase);
  const usingSampleData = useGameStore((s) => s.usingSampleData);
  const unread = useGameStore((s) => s.inbox.filter((m) => !m.read).length);

  if (!team) return null;

  const phaseLabel =
    phase === "REGULAR" ? `Week ${week}` : phase === "PLAYOFFS" ? "Playoffs" : "Offseason";

  return (
    <header className="flex items-center gap-3 border-b border-hairline bg-fog-900 px-3 py-2 md:px-5">
      <TeamCrest team={team} size={34} />
      <div className="min-w-0">
        <div className="display truncate text-sm font-bold text-ink">{team.name}</div>
        <div className="eyebrow">
          Season {season} · {phaseLabel}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-4 md:gap-6">
        {usingSampleData ? (
          <span className="eyebrow hidden text-gold md:block" title="Live stats couldn't be loaded at build time. Attributes are approximate.">
            Sample data
          </span>
        ) : null}
        {unread > 0 ? (
          <span className="eyebrow text-cyan" aria-label={`${unread} unread messages`}>
            {unread} new
          </span>
        ) : null}
        <div className="text-right">
          <div className="num text-sm font-semibold">
            <span className="text-cyan">{team.record.wins}</span>
            <span className="text-ink-muted">–</span>
            <span className="text-ember">{team.record.losses}</span>
          </div>
          <div className="eyebrow">Record</div>
        </div>
        <div className="hidden text-right sm:block">
          <div className="num text-sm font-semibold text-gold">{fmtMoney(team.budget)}</div>
          <div className="eyebrow">Budget</div>
        </div>
      </div>
    </header>
  );
}
