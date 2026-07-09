"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  glyph: ReactNode;
}

function Glyph({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d={d} strokeLinecap="square" />
    </svg>
  );
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Desk", glyph: <Glyph d="M4 13h6V4H4v9zm10 7h6v-9h-6v9zM4 20h6v-4H4v4zm10-11h6V4h-6v5z" /> },
  { href: "/squad", label: "Squad", glyph: <Glyph d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 8c0-3.9 3.1-6 7-6s7 2.1 7 6" /> },
  { href: "/league", label: "League", glyph: <Glyph d="M5 4h14v3a5 5 0 01-5 5h-4a5 5 0 01-5-5V4zm7 8v4m-4 4h8m-4-4v4" /> },
  { href: "/schedule", label: "Schedule", glyph: <Glyph d="M5 6h14v14H5V6zm0 5h14M9 3v4m6-4v4" /> },
  { href: "/match", label: "Match", glyph: <Glyph d="M3 17l5-5 4 3 6-8 3 4M3 21h18" /> },
  { href: "/training", label: "Training", glyph: <Glyph d="M6 12h12M4 9v6m4-8v10m8-10v10m4-8v6" /> },
  { href: "/transfers", label: "Transfers", glyph: <Glyph d="M4 8h12m0 0l-3-3m3 3l-3 3m7 5H8m0 0l3-3m-3 3l3 3" /> },
  { href: "/settings", label: "Settings", glyph: <Glyph d="M12 15a3 3 0 100-6 3 3 0 000 6zm7-3l2-1-1.5-3-2.2.5a7 7 0 00-1.6-1L15 4h-3.5l-.7 2.5a7 7 0 00-1.6 1L5 7 3.5 10l2 1v2l-2 1L5 17l4.2-.5" /> },
];

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex shrink-0 flex-row justify-around border-t border-hairline bg-fog-900 md:w-20 md:flex-col md:justify-start md:gap-1 md:border-r md:border-t-0 md:py-3">
      {ITEMS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center gap-1 px-2 py-2 text-[10px] uppercase tracking-widest transition-colors md:py-3 ${
              active
                ? "text-cyan"
                : "text-ink-muted hover:text-ink"
            }`}
            style={active ? { boxShadow: "inset 0 -2px 0 var(--blue-cyan)" } : undefined}
          >
            {item.glyph}
            <span className="display hidden md:block">{item.label}</span>
            <span className="sr-only md:hidden">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
