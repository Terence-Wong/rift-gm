"use client";

/**
 * Expansion draft for a created franchise: pick exactly 5 starters (one per
 * role) plus up to 3 subs from the pool, under the salary cap. The season
 * is locked until the draft is confirmed.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { TeamCrest } from "@/components/TeamCrest";
import { salaryDemand } from "@/lib/engine/ai";
import { fmtMoney } from "@/lib/format";
import { useGameStore } from "@/lib/store";
import type { Player, Role } from "@/lib/types";
import { ROLES } from "@/lib/types";

const ROLE_ORDER: Record<Role, number> = { TOP: 0, JGL: 1, MID: 2, ADC: 3, SUP: 4 };

export default function DraftPage() {
  const s = useGameStore();
  const router = useRouter();
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const draft = s.expansionDraft;
  const team = s.teams[s.playerTeamId];

  const pool = useMemo(() => {
    if (!draft) return [];
    const list = draft.poolIds
      .map((id) => s.players[id])
      .filter((p): p is Player => Boolean(p) && !p.retired);
    return list.sort((a, b) =>
      roleFilter === "ALL"
        ? ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.ovr - a.ovr
        : b.ovr - a.ovr,
    );
  }, [draft, s.players, roleFilter]);

  if (!draft || !team) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink-muted">No expansion draft in progress.</p>
        <Link href="/dashboard" className="eyebrow mt-2 inline-block text-cyan hover:underline">
          ← Dashboard
        </Link>
      </div>
    );
  }

  const picked = draft.pickedIds.map((id) => s.players[id]).filter(Boolean);
  const spent = picked.reduce((sum, p) => sum + salaryDemand(p), 0);
  const remaining = draft.cap - spent;
  const coveredRoles = new Set(picked.map((p) => p.role));
  const ready = coveredRoles.size === 5 && picked.length <= 8;

  const confirm = () => {
    if (s.finishDraft()) router.push("/dashboard");
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <TeamCrest team={team} size={44} />
        <div>
          <h1 className="display text-xl font-bold">Expansion draft — {team.name}</h1>
          <p className="eyebrow">
            5 starters (one per role) + up to 3 subs · cap {fmtMoney(draft.cap)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="num text-lg font-bold" style={{ color: remaining < 0 ? "var(--red-ember)" : "var(--hextech-gold)" }}>
            {fmtMoney(remaining)}
          </p>
          <p className="eyebrow">Cap space</p>
        </div>
      </header>

      {/* Picks so far */}
      <section className="panel p-3" aria-labelledby="picks-head">
        <h2 id="picks-head" className="eyebrow mb-2">
          Your picks · <span className="num">{picked.length}</span>/8
          {ready ? <span className="ml-2 text-cyan">all five roles covered</span> : null}
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {ROLES.map((role) => {
            const inRole = picked.filter((p) => p.role === role);
            return (
              <div key={role} className="panel-raised flex min-w-28 flex-col gap-1 p-2">
                <span className="eyebrow" style={{ color: inRole.length ? "var(--blue-cyan)" : "var(--red-ember)" }}>
                  {role} {inRole.length === 0 ? "— needed" : ""}
                </span>
                {inRole.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => s.undraftPick(p.id)}
                    title="Remove pick"
                    className="flex items-center gap-2 text-left text-sm hover:text-ember"
                  >
                    <span className="font-semibold">{p.handle}</span>
                    <span className="num text-xs text-ink-muted">{p.ovr.toFixed(1)} · {fmtMoney(salaryDemand(p))} ✕</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={confirm}
            disabled={!ready}
            className="hex-clip display bg-gold px-6 py-2.5 text-sm font-bold text-void enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {ready ? "Confirm roster — start the season" : "Cover all five roles to continue"}
          </button>
          <p className="text-xs text-ink-muted">
            Contracts sign at market rate for 2 years. Undrafted players stay in free agency.
          </p>
        </div>
      </section>

      {/* Pool */}
      <section className="panel p-3" aria-labelledby="pool-head">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h2 id="pool-head" className="eyebrow">Draft pool</h2>
          {(["ALL", ...ROLES] as (Role | "ALL")[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              aria-pressed={roleFilter === r}
              className={`display border px-2.5 py-1 text-xs font-bold ${roleFilter === r ? "border-cyan text-cyan" : "border-hairline text-ink-muted hover:text-ink"}`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-hairline text-left">
                <th className="eyebrow py-2 pl-2 pr-3 font-medium">Role</th>
                <th className="eyebrow py-2 pr-3 font-medium">Player</th>
                <th className="eyebrow py-2 pr-3 text-right font-medium">OVR</th>
                <th className="eyebrow py-2 pr-3 text-right font-medium">Age</th>
                <th className="eyebrow py-2 pr-3 text-right font-medium">Asking</th>
                <th className="eyebrow py-2 pr-3 text-right font-medium">Pick</th>
              </tr>
            </thead>
            <tbody>
              {pool
                .filter((p) => roleFilter === "ALL" || p.role === roleFilter)
                .map((p) => {
                  const isPicked = draft.pickedIds.includes(p.id);
                  const cost = salaryDemand(p);
                  const affordable = cost <= remaining;
                  return (
                    <tr key={p.id} className={`border-b border-hairline/40 ${isPicked ? "bg-fog-800" : "hover:bg-fog-800"}`}>
                      <td className="num py-1.5 pl-2 pr-3 text-ink-muted">{p.role}</td>
                      <td className="py-1.5 pr-3">
                        <Link href={`/players/${p.id}`} className="font-semibold hover:text-cyan">
                          {p.handle}
                        </Link>
                      </td>
                      <td className="num py-1.5 pr-3 text-right text-cyan">{p.ovr.toFixed(1)}</td>
                      <td className="num py-1.5 pr-3 text-right">{p.age}</td>
                      <td className="num py-1.5 pr-3 text-right">{fmtMoney(cost)}</td>
                      <td className="py-1.5 pr-3 text-right">
                        {isPicked ? (
                          <button onClick={() => s.undraftPick(p.id)} className="eyebrow border border-hairline px-2 py-1 text-ember hover:bg-fog-700">
                            Undo
                          </button>
                        ) : (
                          <button
                            onClick={() => s.draftPick(p.id)}
                            disabled={!affordable || picked.length >= 8}
                            className="eyebrow border border-hairline px-2 py-1 text-cyan enabled:hover:bg-fog-700 disabled:opacity-40"
                          >
                            Draft
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
