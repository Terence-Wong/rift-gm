import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

export default function GameLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
