"use client";

import type { InboxMessage } from "@/lib/types";

const TONE_COLOR: Record<InboxMessage["tone"], string> = {
  info: "var(--blue-cyan)",
  good: "var(--hextech-gold)",
  bad: "var(--red-ember)",
};

export function InboxList({ messages, limit }: { messages: InboxMessage[]; limit?: number }) {
  const items = limit ? messages.slice(0, limit) : messages;
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">No news yet. Play a match — the feed fills itself.</p>;
  }
  return (
    <ul className="divide-y divide-hairline/50">
      {items.map((m) => (
        <li key={m.id} className="flex gap-3 py-2.5">
          <span
            aria-hidden
            className="mt-1.5 h-2 w-2 shrink-0"
            style={{ background: TONE_COLOR[m.tone], opacity: m.read ? 0.35 : 1 }}
          />
          <div className="min-w-0">
            <p className={`text-sm ${m.read ? "text-ink-muted" : "font-semibold text-ink"}`}>
              {m.title}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-ink-muted">{m.body}</p>
            <p className="eyebrow mt-1">S{m.season} · W{m.week}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
