"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useGameStore } from "@/lib/store";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";

/**
 * Game shell: broadcast top bar + nav rail, gated on store hydration and
 * an active game. Screens render inside the scrollable main region.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useGameStore((s) => s._hasHydrated);
  const initialized = useGameStore((s) => s.initialized);
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !initialized) router.replace("/");
  }, [hydrated, initialized, router]);

  if (!hydrated || !initialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void">
        <p className="eyebrow animate-pulse">Loading the desk…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-void">
      <TopBar />
      <div className="flex flex-1 flex-col-reverse md:flex-row">
        <NavRail />
        <main className="min-w-0 flex-1 p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
