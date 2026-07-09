"use client";

import { useSyncExternalStore } from "react";

const KEY = "riftgm:reduced-motion";
const QUERY = "(prefers-reduced-motion: reduce)";

const overrideListeners = new Set<() => void>();

function subscribeSystem(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function getSystem() {
  return window.matchMedia(QUERY).matches;
}

function subscribeOverride(cb: () => void) {
  overrideListeners.add(cb);
  return () => overrideListeners.delete(cb);
}

function getOverride() {
  return window.localStorage.getItem(KEY) === "1";
}

function getServerSnapshot() {
  return false;
}

/**
 * Reduced-motion preference: system setting OR the in-app override toggle.
 * Returns [effective, override, setOverride].
 */
export function useReducedMotionPref(): [boolean, boolean, (v: boolean) => void] {
  const system = useSyncExternalStore(subscribeSystem, getSystem, getServerSnapshot);
  const override = useSyncExternalStore(subscribeOverride, getOverride, getServerSnapshot);

  const setOverride = (v: boolean) => {
    window.localStorage.setItem(KEY, v ? "1" : "0");
    for (const listener of overrideListeners) listener();
  };

  return [system || override, override, setOverride];
}
