import { useEffect, useState } from "react";
import { applyTheme, getStoredTheme, type ThemeMode } from "../lib/theme";

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const m = getStoredTheme();
    setMode(m);
    applyTheme(m);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">Theme</span>
      <select
        className="field max-w-[8rem] py-1"
        value={mode}
        onChange={(e) => {
          const v = e.target.value as ThemeMode;
          setMode(v);
          applyTheme(v);
        }}
        aria-label="Color theme"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
