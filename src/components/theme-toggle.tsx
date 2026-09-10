"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "./icon";

const key = "app-financas-theme";
function preference() {
  try { return localStorage.getItem(key); } catch { return null; }
}
function apply(theme: string) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event("finance-theme-change"));
}
function subscribe(listener: () => void) {
  window.addEventListener("finance-theme-change", listener);
  return () => window.removeEventListener("finance-theme-change", listener);
}
export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => {
      const stored = preference();
      apply(stored === "dark" || stored === "light" ? stored : media.matches ? "dark" : "light");
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("storage", sync);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("storage", sync); };
  }, []);
  return null;
}
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? "light", () => "light");
  const dark = theme === "dark";
  return <button type="button" className="theme-toggle" title={dark ? "Ativar modo claro" : "Ativar modo escuro"} aria-label={dark ? "Ativar modo claro" : "Ativar modo escuro"} onClick={() => {
    const next = dark ? "light" : "dark";
    try { localStorage.setItem(key, next); } catch { /* The current page still supports theme switching without storage. */ }
    apply(next);
  }}><Icon name={dark ? "sun" : "moon"} size={19} /></button>;
}
