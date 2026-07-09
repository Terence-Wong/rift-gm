"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useGameStore } from "@/lib/store";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";
import { TutorialCoach } from "./TutorialCoach";

/**
 * Game shell: broadcast top bar + nav rail, gated on store hydration and
 * an active game. Screens render inside the scrollable main region.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useGameStore((s) => s._hasHydrated);
  const initialized = useGameStore((s) => s.initialized);
  const draftPending = useGameStore((s) => s.expansionDraft !== null);
  const tutorialActive = useGameStore((s) => s.tutorial.active);
  const tutorialStep = useGameStore((s) => s.tutorial.step);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (hydrated && !initialized) router.replace("/");
  }, [hydrated, initialized, router]);

  // An unfinished expansion draft locks the season — keep the GM in the room.
  useEffect(() => {
    if (hydrated && initialized && draftPending && pathname !== "/draft" && !pathname.startsWith("/players")) {
      router.replace("/draft");
    }
  }, [hydrated, initialized, draftPending, pathname, router]);

  if (!hydrated || !initialized) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-void">
        <p className="eyebrow animate-pulse">Loading the desk…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-dvh flex-col bg-void"
      data-tut-step={tutorialActive ? tutorialStep : undefined}
    >
      <TopBar />
      <TutorialCoach />
      <div className="flex flex-1 flex-col-reverse md:flex-row">
        <NavRail />
        <main className="min-w-0 flex-1 p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
