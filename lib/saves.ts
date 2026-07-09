/**
 * Named save slots + export/import, layered on top of the active-game
 * persist store. Slots live in localStorage under riftgm:slot:*.
 */

"use client";

import { DATA_KEYS, useGameStore, type GameData } from "./store";

const SLOT_PREFIX = "riftgm:slot:";

export interface SaveSlotMeta {
  key: string;
  name: string;
  savedAt: string;
  season: number;
  week: number;
  teamName: string;
  phase: string;
  /** "real" | "fictional" — absent on pre-v2 slots (treated as real). */
  dataMode?: string;
}

interface SlotPayload {
  meta: SaveSlotMeta;
  data: GameData;
}

function snapshot(): GameData {
  const state = useGameStore.getState();
  return JSON.parse(
    JSON.stringify(Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]]))),
  ) as GameData;
}

export function listSlots(): SaveSlotMeta[] {
  if (typeof window === "undefined") return [];
  const slots: SaveSlotMeta[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key?.startsWith(SLOT_PREFIX)) continue;
    try {
      const payload = JSON.parse(window.localStorage.getItem(key) ?? "") as SlotPayload;
      if (payload?.meta) slots.push({ ...payload.meta, key });
    } catch {
      // Corrupt slot — skip it rather than crash the manager.
    }
  }
  return slots.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveSlot(name: string): SaveSlotMeta | null {
  if (typeof window === "undefined") return null;
  const state = useGameStore.getState();
  if (!state.initialized) return null;
  const data = snapshot();
  const meta: SaveSlotMeta = {
    key: `${SLOT_PREFIX}${name}`,
    name,
    savedAt: new Date().toISOString(),
    season: data.season,
    week: data.week,
    teamName: data.teams[data.playerTeamId]?.name ?? "—",
    phase: data.phase,
    dataMode: data.dataMode ?? "real",
  };
  window.localStorage.setItem(meta.key, JSON.stringify({ meta, data }));
  return meta;
}

export function loadSlot(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload = JSON.parse(window.localStorage.getItem(key) ?? "") as SlotPayload;
    if (!payload?.data?.initialized) return false;
    useGameStore.getState().loadSnapshot(payload.data);
    return true;
  } catch {
    return false;
  }
}

export function deleteSlot(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

export function exportSave(): string {
  return JSON.stringify({ riftgm: 1, data: snapshot() }, null, 2);
}

export function importSave(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json) as { riftgm?: number; data?: GameData };
    const data = parsed.riftgm ? parsed.data : (parsed as unknown as GameData);
    if (!data?.initialized || !data.teams || !data.players) {
      return { ok: false, error: "That file isn't a RIFT GM save — no game state inside." };
    }
    useGameStore.getState().loadSnapshot(data);
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't parse that file as JSON." };
  }
}
