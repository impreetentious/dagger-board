"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const storageKey = "theme-preference";
const themeChangeEvent = "theme-preference-change";

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(themeChangeEvent, onStoreChange);
  return () => window.removeEventListener(themeChangeEvent, onStoreChange);
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(storageKey, theme);
  window.dispatchEvent(new Event(themeChangeEvent));
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light");

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === "dark"}
      className="inline-flex h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--moss-soft)]"
      onClick={() => {
        applyTheme(nextTheme);
      }}
      type="button"
    >
      <span aria-hidden="true">{theme === "dark" ? "◐" : "◑"}</span>
      <span className="hidden sm:inline">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
