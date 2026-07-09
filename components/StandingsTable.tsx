"use client";

import { TeamCrest } from "@/components/TeamCrest";
import type { StandingsRow } from "@/lib/engine/schedule";
import type { Team } from "@/lib/types";

export function StandingsTable({
  standings,
  teams,
  highlightId,
  compact,
  playoffLine = 4,
}: {
  standings: StandingsRow[];
  teams: Record<string, Team>;
  highlightId?: string;
  compact?: boolean;
  playoffLine?: number;
}) {
  const rows = compact ? standings.slice(0, 5) : standings;
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-hairline text-left">
            <th scope="col" className="eyebrow py-2 pr-2 font-medium">#</th>
            <th scope="col" className="eyebrow py-2 pr-2 font-medium">Team</th>
            <th scope="col" className="eyebrow py-2 pr-2 text-right font-medium">W</th>
            <th scope="col" className="eyebrow py-2 pr-2 text-right font-medium">L</th>
            <th scope="col" className="eyebrow py-2 text-right font-medium">Strk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const team = teams[row.teamId];
            if (!team) return null;
            const mine = row.teamId === highlightId;
            return (
              <tr
                key={row.teamId}
                className={`border-b border-hairline/50 ${mine ? "bg-fog-800" : ""} ${
                  i === playoffLine - 1 && !compact ? "border-b-2 border-b-gold-dim" : ""
                }`}
              >
                <td className="num py-2 pr-2 text-ink-muted">{i + 1}</td>
                <td className="py-2 pr-2">
                  <span className="flex items-center gap-2">
                    <TeamCrest shortName={team.shortName} color={team.color} size={22} />
                    <span className={`truncate ${mine ? "font-semibold text-cyan" : ""}`}>
                      {compact ? team.shortName : team.name}
                    </span>
                  </span>
                </td>
                <td className="num py-2 pr-2 text-right text-cyan">{row.wins}</td>
                <td className="num py-2 pr-2 text-right text-ember">{row.losses}</td>
                <td className="num py-2 text-right text-ink-muted">
                  {row.streak > 0 ? `W${row.streak}` : row.streak < 0 ? `L${-row.streak}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
