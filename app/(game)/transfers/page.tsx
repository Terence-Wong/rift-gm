"use client";

import Link from "next/link";
import { useState } from "react";
import { salaryDemand } from "@/lib/engine/ai";
import { estimatedOvrRange, upgradeVerdict, type UpgradeVerdict } from "@/lib/engine/scouting";
import { fmtMoney } from "@/lib/format";
import { OFFSEASON_WEEKS, useGameStore } from "@/lib/store";
import type { Player } from "@/lib/types";

export default function TransfersPage() {
  const s = useGameStore();
  const team = s.teams[s.playerTeamId];
  const isWindow = s.phase === "OFFSEASON";
  const deadline = isWindow && s.offseasonWeek >= OFFSEASON_WEEKS;

  const roster = team.roster.map((id) => s.players[id]).filter(Boolean) as Player[];
  const expiring = roster.filter((p) => p.contract.years === 0);
  const freeAgents = s.freeAgents
    .map((id) => s.players[id])
    .filter((p): p is Player => Boolean(p) && !p?.retired)
    .sort((a, b) => b.ovr - a.ovr);
  const offers = s.poachOffers.filter((o) => o.arrived && !o.resolved);

  const payroll = roster.reduce((sum, p) => sum + p.contract.salary, 0);

  if (s.board.fired) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink-muted">
          You&apos;ve been let go — this roster isn&apos;t yours to build anymore.
        </p>
        <Link href="/dashboard" className="eyebrow mt-3 inline-block text-cyan hover:underline">
          Review your offers on the dashboard →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="display text-xl font-bold">Transfers</h1>
        <span className="eyebrow">
          Payroll <span className="num text-gold">{fmtMoney(payroll)}</span> / {fmtMoney(team.budget)}
        </span>
        {isWindow ? (
          <span
            className="display border px-2.5 py-1 text-xs font-bold"
            style={{
              borderColor: deadline ? "var(--hextech-gold)" : "var(--hairline)",
              color: deadline ? "var(--hextech-gold)" : "var(--ink-muted)",
            }}
          >
            {deadline
              ? "DEADLINE WEEK — market closes when you lock"
              : `Market week ${s.offseasonWeek}/${OFFSEASON_WEEKS}`}
          </span>
        ) : null}
        {isWindow ? (
          <span className="ml-auto flex gap-2">
            {s.offseasonWeek < OFFSEASON_WEEKS ? (
              <button
                onClick={() => s.finishWeek()}
                className="hex-clip display border border-hairline bg-fog-800 px-4 py-2.5 text-sm font-bold hover:bg-fog-700"
                title="Let a week of the market play out — rumors land, deals close"
              >
                Advance market week
              </button>
            ) : null}
            <button
              onClick={() => s.startNextSeason()}
              className="hex-clip display bg-gold px-5 py-2.5 text-sm font-bold text-void hover:brightness-110"
            >
              Lock roster — start Season {s.season + 1}
            </button>
          </span>
        ) : (
          <span className="ml-auto text-xs text-ink-muted">
            The window opens in the offseason. Until then you can review contracts and scout targets.
          </span>
        )}
      </div>

      {offers.length > 0 ? (
        <section
          className="panel border-l-2 p-4"
          style={{ borderLeftColor: "var(--red-ember)" }}
          aria-labelledby="offers-head"
        >
          <h2 id="offers-head" className="eyebrow mb-2 text-ember">
            Incoming offers — rivals are at the door
          </h2>
          <ul className="flex flex-col gap-2">
            {offers.map((offer) => {
              const p = s.players[offer.playerId];
              const rival = s.teams[offer.teamId];
              if (!p || !rival) return null;
              return (
                <li key={offer.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="num w-8 text-xs text-ink-muted">{p.role}</span>
                  <Link href={`/players/${p.id}`} className="font-semibold hover:text-cyan">
                    {p.handle}
                  </Link>
                  <span className="text-xs text-ink-muted">
                    {rival.name} offer: <span className="num text-ember">{fmtMoney(offer.salary)}/yr</span>
                    <span className="num"> (currently {fmtMoney(p.contract.salary)}/yr)</span>
                  </span>
                  <span className="ml-auto flex gap-2">
                    <button
                      onClick={() => s.respondPoach(offer.id, false)}
                      className="hex-clip display bg-gold px-3 py-1.5 text-xs font-bold text-void hover:brightness-110"
                    >
                      Match {fmtMoney(offer.salary)} — he stays
                    </button>
                    <button
                      onClick={() => s.respondPoach(offer.id, true)}
                      className="eyebrow border border-hairline px-2 py-1 text-ember hover:bg-fog-700"
                    >
                      Accept buyout (+{fmtMoney(Math.round(offer.salary * 0.5))} budget)
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {isWindow && expiring.length > 0 ? (
        <section className="panel border-gold-dim p-4" aria-labelledby="expiring-head">
          <h2 id="expiring-head" className="eyebrow mb-2 text-gold">
            Expiring contracts — renew now or they walk when the season starts
          </h2>
          <ul className="flex flex-col gap-2">
            {expiring.map((p) => (
              <RenewRow key={p.id} player={p} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="panel p-4" aria-labelledby="roster-head">
          <h2 id="roster-head" className="eyebrow mb-2">Under contract</h2>
          {roster.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">Nobody under contract. That&apos;s a problem.</p>
          ) : (
            <ul className="divide-y divide-hairline/50">
              {roster.map((p) => (
                <li key={p.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="num w-8 text-xs text-ink-muted">{p.role}</span>
                  <Link href={`/players/${p.id}`} className="font-semibold hover:text-cyan">
                    {p.handle}
                  </Link>
                  <span className="num text-xs text-ink-muted">{p.age}y · OVR {p.ovr.toFixed(1)}</span>
                  <span className="num ml-auto">
                    {fmtMoney(p.contract.salary)}/yr × {p.contract.years}y
                  </span>
                  {isWindow ? (
                    <button
                      onClick={() => s.releasePlayer(p.id)}
                      className="eyebrow border border-hairline px-2 py-1 text-ember hover:bg-fog-700"
                    >
                      Release
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-4" aria-labelledby="fa-head">
          <h2 id="fa-head" className="eyebrow mb-2">
            Free agents {isWindow ? "— rival teams bid too; lowball at your peril" : "(window closed — scouting still works)"}
          </h2>
          <p className="mb-2 text-xs leading-5 text-ink-muted">
            Market players show <em>scouted ranges</em>, not numbers. Assign your scout to a
            player (one at a time) and a report lands each week — the range tightens and you
            get a verdict against your current starter.
          </p>
          {freeAgents.length === 0 ? (
            <p className="py-4 text-sm text-ink-muted">The market is empty. New prospects arrive each offseason.</p>
          ) : (
            <ul className="divide-y divide-hairline/50">
              {freeAgents.map((p) => (
                <BidRow key={p.id} player={p} disabled={!isWindow} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function RenewRow({ player }: { player: Player }) {
  const renewContract = useGameStore((s) => s.renewContract);
  const [years, setYears] = useState(2);
  const demand = salaryDemand(player);
  return (
    <li className="flex flex-wrap items-center gap-3 text-sm">
      <span className="num w-8 text-xs text-ink-muted">{player.role}</span>
      <Link href={`/players/${player.id}`} className="font-semibold hover:text-cyan">
        {player.handle}
      </Link>
      <span className="num text-xs text-ink-muted">
        {player.age}y · OVR {player.ovr.toFixed(1)} · asks {fmtMoney(demand)}/yr
      </span>
      <span className="ml-auto flex items-center gap-2">
        <label className="eyebrow" htmlFor={`renew-${player.id}`}>Years</label>
        <select
          id={`renew-${player.id}`}
          value={years}
          onChange={(e) => setYears(Number(e.target.value))}
          className="panel-raised px-2 py-1 text-sm"
        >
          {[1, 2, 3].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          onClick={() => renewContract(player.id, years)}
          className="hex-clip display bg-gold px-3 py-1.5 text-xs font-bold text-void hover:brightness-110"
        >
          Renew at {fmtMoney(demand)}
        </button>
      </span>
    </li>
  );
}

const VERDICT_COLOR: Record<UpgradeVerdict, string> = {
  "likely upgrade": "var(--blue-cyan)",
  "possible upgrade": "var(--hextech-gold)",
  "too close to call": "var(--ink-muted)",
  "not an upgrade": "var(--red-ember)",
  unknown: "var(--ink-muted)",
};

function BidRow({ player, disabled }: { player: Player; disabled: boolean }) {
  const s = useGameStore();
  const demand = salaryDemand(player);
  const [offer, setOffer] = useState(demand);
  const [years, setYears] = useState(1);
  const isProspect = player.id.startsWith("fa-");

  const knowledge = s.playerScouting[player.id] ?? 0;
  const range = estimatedOvrRange(player, knowledge);
  const starter = s.players[s.teams[s.playerTeamId].starters[player.role]];
  const verdict = knowledge >= 3 ? upgradeVerdict(player, knowledge, starter?.ovr ?? null) : null;
  const beingScouted = s.playerScoutTargetId === player.id;

  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="num w-8 text-xs text-ink-muted">{player.role}</span>
      <Link href={`/players/${player.id}`} className="font-semibold hover:text-cyan">
        {player.handle}
      </Link>
      <span className="num text-xs text-ink-muted">
        {player.age}y · OVR{" "}
        {knowledge >= 5 ? (
          <span className="text-cyan">{player.ovr.toFixed(1)}</span>
        ) : (
          <span>{range.min}–{range.max}</span>
        )}
        {isProspect ? " · trainee (fictional)" : ""}
      </span>
      {verdict ? (
        <span className="eyebrow" style={{ color: VERDICT_COLOR[verdict] }}>
          {verdict}
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-2">
        {knowledge < 5 ? (
          <button
            onClick={() => s.setPlayerScoutTarget(beingScouted ? null : player.id)}
            aria-pressed={beingScouted}
            title={
              beingScouted
                ? "Scouting — a report lands each week. Click to stop."
                : `Assign your scout (knowledge ${knowledge}/5)`
            }
            className={`eyebrow border px-2 py-1 ${
              beingScouted ? "border-cyan text-cyan" : "border-hairline text-ink-muted hover:text-ink"
            }`}
          >
            {beingScouted ? "Scouting…" : `Scout ${knowledge}/5`}
          </button>
        ) : null}
        <span className="eyebrow">asks {fmtMoney(demand)}</span>
        {!disabled ? (
          <>
            <label className="sr-only" htmlFor={`offer-${player.id}`}>Offer for {player.handle}</label>
            <input
              id={`offer-${player.id}`}
              type="number"
              min={50}
              step={25}
              value={offer}
              onChange={(e) => setOffer(Number(e.target.value))}
              className="panel-raised num w-24 px-2 py-1 text-right text-sm"
            />
            <select
              value={years}
              onChange={(e) => setYears(Number(e.target.value))}
              aria-label={`Contract years for ${player.handle}`}
              className="panel-raised px-2 py-1 text-sm"
            >
              {[1, 2, 3].map((y) => (
                <option key={y} value={y}>{y}y</option>
              ))}
            </select>
            <button
              onClick={() => s.bidFreeAgent(player.id, offer, years)}
              className="hex-clip display bg-fog-800 px-3 py-1.5 text-xs font-bold text-cyan hover:bg-fog-700"
            >
              Bid
            </button>
          </>
        ) : null}
      </span>
    </li>
  );
}
