"use client";

/**
 * Glossary popover: wraps a domain term with a "?" affordance that opens a
 * one-line coach-voice definition. Keyboard accessible (toggle on click or
 * Enter/Space via button semantics, dismiss on Escape or blur).
 */

import { useEffect, useId, useRef, useState } from "react";
import { GLOSSARY } from "@/lib/glossary";

export function Term({ k, children }: { k: string; children?: React.ReactNode }) {
  const entry = GLOSSARY[k];
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  if (!entry) return <>{children ?? k}</>;

  return (
    <span ref={ref} className="relative inline-flex items-baseline gap-0.5">
      {children ?? entry.term}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`What is ${entry.term}?`}
        className="inline-flex h-3.5 w-3.5 shrink-0 translate-y-[-1px] items-center justify-center rounded-full border border-hairline text-[9px] leading-none text-ink-muted hover:border-cyan hover:text-cyan"
      >
        ?
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className="panel-raised absolute left-0 top-full z-50 mt-1.5 block w-64 p-2.5 text-left text-xs font-normal normal-case leading-5 tracking-normal text-ink shadow-lg"
        >
          <span className="display block text-[11px] font-bold text-gold">{entry.term}</span>
          {entry.def}
        </span>
      ) : null}
    </span>
  );
}
