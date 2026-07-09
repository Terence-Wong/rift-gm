"use client";

/**
 * The assistant-coach bar for "your first week as head coach": shows the
 * current objective, links to the right screen, and (on that screen) dims
 * the backdrop so gold-ringed spotlight targets pop (CSS in globals.css —
 * elements tagged data-tut are ringed per step via [data-tut-step]).
 * Fully keyboard accessible; the pulse honors reduced motion.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { TUTORIAL_ORDER, TUTORIAL_STEP_INFO, type TutorialStep } from "@/lib/tutorial";

export function TutorialCoach() {
  const tutorial = useGameStore((s) => s.tutorial);
  const skipTutorial = useGameStore((s) => s.skipTutorial);
  const pathname = usePathname();

  if (!tutorial.active) return null;
  const step = tutorial.step as TutorialStep;
  const info = TUTORIAL_STEP_INFO[step];
  if (!info || step === "DONE") return null;
  const stepIndex = TUTORIAL_ORDER.indexOf(step) + 1;
  const onScreen = pathname.startsWith(info.screen);

  return (
    <>
      {onScreen ? <div className="tut-backdrop" aria-hidden /> : null}
      <aside
        aria-label="Tutorial objective"
        className="tut-bar panel-raised relative flex flex-wrap items-center gap-x-4 gap-y-2 border-l-2 px-4 py-2.5"
        style={{ borderLeftColor: "var(--hextech-gold)" }}
      >
        <span className="eyebrow shrink-0 text-gold">
          First week · {stepIndex}/5
        </span>
        <p className="min-w-0 flex-1 text-sm">
          <span className="text-ink-muted">Coach: </span>
          {info.objective}
        </p>
        {step === "DRAFT" && onScreen ? <CounterWheel /> : null}
        {!onScreen ? (
          <Link
            href={info.screen}
            className="hex-clip display shrink-0 bg-gold px-3 py-1.5 text-xs font-bold text-void hover:brightness-110"
          >
            Take me there →
          </Link>
        ) : null}
        <button
          onClick={skipTutorial}
          className="eyebrow shrink-0 border border-hairline px-2 py-1 text-ink-muted hover:text-ink"
        >
          Skip tutorial
        </button>
      </aside>
    </>
  );
}

/** Inline mini-diagram of the comp counter wheel: Poke → Teamfight → Pick → Poke. */
function CounterWheel() {
  return (
    <svg
      viewBox="0 0 150 96"
      width="140"
      role="img"
      aria-label="Counter wheel: Poke beats Teamfight, Teamfight beats Pick, Pick beats Poke"
      className="shrink-0"
    >
      <defs>
        <marker id="tut-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 Z" fill="var(--hextech-gold)" />
        </marker>
      </defs>
      {/* triangle: Poke (top) → Teamfight (bottom-right) → Pick (bottom-left) → Poke */}
      <line x1="75" y1="22" x2="112" y2="70" stroke="var(--hextech-gold)" strokeWidth="1.4" markerEnd="url(#tut-arrow)" />
      <line x1="104" y1="80" x2="48" y2="80" stroke="var(--hextech-gold)" strokeWidth="1.4" markerEnd="url(#tut-arrow)" />
      <line x1="40" y1="70" x2="68" y2="24" stroke="var(--hextech-gold)" strokeWidth="1.4" markerEnd="url(#tut-arrow)" />
      <text x="75" y="14" textAnchor="middle" fontSize="11" fill="var(--ink)" fontFamily="var(--font-chakra)">POKE</text>
      <text x="118" y="84" textAnchor="start" fontSize="11" fill="var(--ink)" fontFamily="var(--font-chakra)">TEAMFIGHT</text>
      <text x="4" y="84" textAnchor="start" fontSize="11" fill="var(--ink)" fontFamily="var(--font-chakra)">PICK</text>
      <text x="75" y="60" textAnchor="middle" fontSize="8" fill="var(--ink-muted)" fontFamily="var(--font-plex-sans)">beats →</text>
    </svg>
  );
}
