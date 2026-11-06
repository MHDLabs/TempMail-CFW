export type ThemeMode = "system" | "light" | "dark";

const KEY = "tm-theme";

export function getStoredTheme(): ThemeMode {
  const v = localStorage.getItem(KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(mode: ThemeMode) {
  const dark = resolveDark(mode);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(KEY, mode);
}
