"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { CHAMPIONS, DATA_META } from "@/lib/data";
import {
  deleteSlot,
  exportSave,
  importSave,
  listSlots,
  loadSlot,
  saveSlot,
  type SaveSlotMeta,
} from "@/lib/saves";
import { useGameStore } from "@/lib/store";
import { useReducedMotionPref } from "@/lib/useReducedMotionPref";

export default function SettingsPage() {
  const s = useGameStore();
  const [, override, setOverride] = useReducedMotionPref();
  const [slots, setSlots] = useState<SaveSlotMeta[]>(() => listSlots());
  const [slotName, setSlotName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => setSlots(listSlots());

  const onSave = () => {
    const name = slotName.trim() || `${s.teams[s.playerTeamId]?.shortName ?? "save"} S${s.season}W${s.week}`;
    const meta = saveSlot(name);
    setNotice(meta ? `Saved "${name}".` : "Nothing to save — start a game first.");
    refresh();
  };

  const onExport = () => {
    const blob = new Blob([exportSave()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riftgm-save-s${s.season}w${s.week}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    const result = importSave(text);
    setNotice(result.ok ? "Save imported — you're back on the desk." : (result.error ?? "Import failed."));
    refresh();
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <h1 className="display text-xl font-bold">Settings</h1>

      <section className="panel p-4" aria-labelledby="saves-head">
        <h2 id="saves-head" className="eyebrow mb-3">Save manager</h2>
        {notice ? <p className="mb-2 text-sm text-cyan" role="status">{notice}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="slot-name">Save slot name</label>
          <input
            id="slot-name"
            value={slotName}
            onChange={(e) => setSlotName(e.target.value)}
            placeholder="Slot name (optional)"
            className="panel-raised px-3 py-2 text-sm placeholder:text-ink-muted"
          />
          <button onClick={onSave} className="hex-clip display bg-gold px-4 py-2 text-sm font-bold text-void hover:brightness-110">
            Save game
          </button>
          <button onClick={onExport} className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold hover:bg-fog-700">
            Export JSON
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold hover:bg-fog-700"
          >
            Import JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {slots.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">No saved slots yet. The active game auto-saves as you play.</p>
        ) : (
          <ul className="mt-3 divide-y divide-hairline/50">
            {slots.map((slot) => (
              <li key={slot.key} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="font-semibold">{slot.name}</span>
                <span className="eyebrow">
                  {slot.teamName} · S{slot.season} W{slot.week} · {slot.phase.toLowerCase()} ·{" "}
                  {slot.dataMode === "fictional" ? "fictional league" : "real rosters"}
                </span>
                <span className="num ml-auto text-xs text-ink-muted">
                  {new Date(slot.savedAt).toLocaleString()}
                </span>
                <button
                  onClick={() => {
                    if (loadSlot(slot.key)) setNotice(`Loaded "${slot.name}".`);
                    else setNotice("That slot is corrupt and couldn't be loaded.");
                  }}
                  className="eyebrow border border-hairline px-2 py-1 text-cyan hover:bg-fog-700"
                >
                  Load
                </button>
                <button
                  onClick={() => {
                    deleteSlot(slot.key);
                    refresh();
                  }}
                  className="eyebrow border border-hairline px-2 py-1 text-ember hover:bg-fog-700"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-4" aria-labelledby="tutorial-head">
        <h2 id="tutorial-head" className="eyebrow mb-3">First-week tutorial</h2>
        <p className="text-sm text-ink-muted">
          {s.tutorial.active
            ? `In progress — current step: ${s.tutorial.step}. Your assistant coach's memos are in the inbox.`
            : "Not running. Relaunch the guided “first week as head coach” any time — it walks the squad → scouting → draft → match → debrief loop with your assistant coach."}
        </p>
        <div className="mt-3 flex gap-2">
          {s.tutorial.active ? (
            <button
              onClick={() => s.skipTutorial()}
              className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold hover:bg-fog-700"
            >
              Skip the rest
            </button>
          ) : (
            <button
              onClick={() => {
                s.startTutorial();
                setNotice("Tutorial relaunched — check your inbox for the coach's memo.");
              }}
              className="hex-clip display border border-hairline bg-fog-800 px-4 py-2 text-sm font-bold hover:bg-fog-700"
            >
              Relaunch tutorial
            </button>
          )}
        </div>
      </section>

      <section className="panel p-4" aria-labelledby="a11y-head">
        <h2 id="a11y-head" className="eyebrow mb-3">Accessibility</h2>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={override}
            onChange={(e) => setOverride(e.target.checked)}
            className="h-4 w-4 accent-[var(--blue-cyan)]"
          />
          Reduce motion — matches render at their final state instead of animating. Your system
          preference is always respected regardless of this toggle.
        </label>
      </section>

      <section className="panel p-4" aria-labelledby="data-head">
        <h2 id="data-head" className="eyebrow mb-3">Data &amp; attribution</h2>
        <p className="text-sm leading-6 text-ink-muted">
          <strong className="text-ink">This is an unofficial fan project.</strong> Not affiliated
          with or endorsed by Riot Games. League of Legends is a trademark of Riot Games, Inc.
        </p>
        {s.dataMode === "fictional" ? (
          <>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">Mode</dt>
              <dd className="text-cyan">
                Fictional league — this save&apos;s entire world (teams, players, names,
                attributes) is procedurally generated. Nothing here refers to a real person or
                organization.
              </dd>
              <dt className="text-ink-muted">World seed</dt>
              <dd className="num text-gold">{s.worldSeed ?? "—"}</dd>
            </dl>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Share the world seed to let someone else start a career in the exact same generated
              league. Real-data attribution applies only to Real-rosters saves.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-ink-muted">Player data © their respective sources.</p>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-ink-muted">Dataset</dt>
              <dd>
                {DATA_META.seasonLabel} · v{DATA_META.dataVersion} · fetched{" "}
                <span className="num">{DATA_META.fetchedAt.slice(0, 10)}</span>
              </dd>
              <dt className="text-ink-muted">Mode</dt>
              <dd className={DATA_META.usingSampleData ? "text-gold" : "text-cyan"}>
                {DATA_META.usingSampleData
                  ? "Sample data — live stats couldn't be loaded at build time; attributes are approximate."
                  : "Derived from real competitive match data."}
              </dd>
              <dt className="text-ink-muted">Notes</dt>
              <dd>{DATA_META.notes}</dd>
              <dt className="text-ink-muted">Champions</dt>
              <dd><span className="num">{CHAMPIONS.length}</span> from Riot Data Dragon</dd>
            </dl>
            <ul className="mt-3 flex flex-col gap-1 text-sm">
              {DATA_META.sources.map((src) => (
                <li key={src.name}>
                  <a href={src.url} target="_blank" rel="noreferrer" className="text-cyan hover:underline">
                    {src.name}
                  </a>{" "}
                  <span className="text-ink-muted">— {src.license}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              Attribute provenance: values marked <span className="text-gold">est</span> on player
              pages are modeled estimates (Clutch and Potential usually are); unmarked values are
              derived from role-normalized percentiles of real per-game metrics. Free-agent
              &quot;trainee&quot; prospects are fictional. Attributes marked{" "}
              <span className="text-gold">est</span> should not be read as real-world skill claims.
            </p>
          </>
        )}
      </section>

      <section className="panel border-ember/30 p-4" aria-labelledby="danger-head">
        <h2 id="danger-head" className="eyebrow mb-2 text-ember">Danger zone</h2>
        <Link
          href="/"
          onClick={() => s.resetGame()}
          className="hex-clip display inline-block border border-ember/50 px-4 py-2 text-sm font-bold text-ember hover:bg-fog-700"
        >
          Abandon career &amp; start over
        </Link>
        <p className="mt-2 text-xs text-ink-muted">
          Wipes the active game (saved slots are kept). Save first if you might come back.
        </p>
      </section>
    </div>
  );
}
