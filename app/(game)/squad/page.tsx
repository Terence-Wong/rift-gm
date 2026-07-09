"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmtMoney } from "@/lib/format";
import { useGameStore } from "@/lib/store";
import type { Player, Role } from "@/lib/types";
import { VISIBLE_ATTRIBUTES } from "@/lib/types";

type SortKey = "role" | "ovr" | "age" | "form" | "fatigue" | "morale" | "salary";

const ROLE_ORDER: Record<Role, number> = { TOP: 0, JGL: 1, MID: 2, ADC: 3, SUP: 4 };

const ATTR_SHORT: Record<string, string> = {
  laning: "LAN",
  mechanics: "MEC",
  macro: "MAC",
  teamfight: "TF",
  aggression: "AGG",
};

function MiniBar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="num w-6 text-right text-xs">{Math.round(value)}</span>
      <span aria-hidden className="h-1.5 w-10 bg-fog-800">
        <span
          className="block h-full"
          style={{
            width: `${(value / 20) * 100}%`,
            background: value >= 16 ? "var(--hextech-gold)" : value >= 12 ? "var(--blue-cyan)" : "var(--ink-muted)",
          }}
        />
      </span>
    </span>
  );
}

export default function SquadPage() {
  const teams = useGameStore((s) => s.teams);
  const playersMap = useGameStore((s) => s.players);
  const playerTeamId = useGameStore((s) => s.playerTeamId);
  const setStarter = useGameStore((s) => s.setStarter);
  const team = teams[playerTeamId];

  const [sortKey, setSortKey] = useState<SortKey>("role");
  const [desc, setDesc] = useState(false);

  const roster = useMemo(() => {
    const list = team.roster.map((id) => playersMap[id]).filter(Boolean) as Player[];
    const dir = desc ? -1 : 1;
    return [...list].sort((a, b) => {
      switch (sortKey) {
        case "ovr": return dir * (a.ovr - b.ovr);
        case "age": return dir * (a.age - b.age);
        case "form": return dir * (a.form - b.form);
        case "fatigue": return dir * (a.fatigue - b.fatigue);
        case "morale": return dir * (a.morale - b.morale);
        case "salary": return dir * (a.contract.salary - b.contract.salary);
        default: return dir * (ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
      }
    });
  }, [team.roster, playersMap, sortKey, desc]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setDesc(!desc);
    else {
      setSortKey(key);
      setDesc(key !== "role");
    }
  };

  const payroll = team.roster.reduce(
    (sum, id) => sum + (playersMap[id]?.contract.salary ?? 0),
    0,
  );

  const header = (label: string, key: SortKey, align = "text-right") => (
    <th scope="col" className={`eyebrow py-2 pr-3 font-medium ${align}`}>
      <button onClick={() => toggleSort(key)} className="hover:text-ink" aria-label={`Sort by ${label}`}>
        {label}
        {sortKey === key ? <span aria-hidden>{desc ? " ↓" : " ↑"}</span> : null}
      </button>
    </th>
  );

  if (roster.length === 0) {
    return <p className="py-10 text-center text-sm text-ink-muted">No players under contract. Hit the transfer market.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="display text-xl font-bold">Squad</h1>
        <p className="eyebrow">
          Payroll <span className="num text-gold">{fmtMoney(payroll)}</span> / {fmtMoney(team.budget)} · Starters marked ●
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-hairline text-left">
              {header("Role", "role", "text-left")}
              <th scope="col" className="eyebrow py-2 pr-3 text-left font-medium">Player</th>
              {header("OVR", "ovr")}
              {VISIBLE_ATTRIBUTES.map((a) => (
                <th key={a} scope="col" className="eyebrow py-2 pr-3 text-left font-medium">{ATTR_SHORT[a]}</th>
              ))}
              {header("Age", "age")}
              {header("Form", "form")}
              {header("Fat", "fatigue")}
              {header("Mor", "morale")}
              {header("Salary", "salary")}
              <th scope="col" className="eyebrow py-2 font-medium text-right">Starter</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => {
              const isStarter = team.starters[p.role] === p.id;
              return (
                <tr key={p.id} className="border-b border-hairline/50 hover:bg-fog-800">
                  <td className="num py-2 pl-3 pr-3 text-ink-muted">{p.role}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/players/${p.id}`} className="font-semibold text-ink hover:text-cyan">
                      {isStarter ? <span className="mr-1 text-cyan" aria-label="starter">●</span> : null}
                      {p.handle}
                    </Link>
                  </td>
                  <td className="num py-2 pr-3 text-right font-semibold text-cyan">{p.ovr.toFixed(1)}</td>
                  {VISIBLE_ATTRIBUTES.map((a) => (
                    <td key={a} className="py-2 pr-3"><MiniBar value={p.attributes[a]} /></td>
                  ))}
                  <td className="num py-2 pr-3 text-right">{p.age}</td>
                  <td className="num py-2 pr-3 text-right" style={{ color: p.form > 0.5 ? "var(--blue-cyan)" : p.form < -0.5 ? "var(--red-ember)" : undefined }}>
                    {p.form > 0 ? "+" : ""}{p.form.toFixed(1)}
                  </td>
                  <td className="num py-2 pr-3 text-right" style={{ color: p.fatigue > 60 ? "var(--red-ember)" : undefined }}>
                    {Math.round(p.fatigue)}
                  </td>
                  <td className="num py-2 pr-3 text-right">{Math.round(p.morale)}</td>
                  <td className="num py-2 pr-3 text-right">
                    {fmtMoney(p.contract.salary)}
                    <span className="text-ink-muted"> ×{p.contract.years}y</span>
                  </td>
                  <td className="py-2 pr-3 text-right">
                    {isStarter ? (
                      <span className="eyebrow text-cyan">Starting</span>
                    ) : (
                      <button
                        onClick={() => setStarter(p.role, p.id)}
                        className="eyebrow border border-hairline px-2 py-1 hover:bg-fog-700 hover:text-ink"
                      >
                        Start
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-ink-muted">
        Resting a starter for a week clears fatigue faster. Hidden attributes (consistency,
        clutch, potential) never show exact values — see a player&apos;s page for estimates.
      </p>
    </div>
  );
}
