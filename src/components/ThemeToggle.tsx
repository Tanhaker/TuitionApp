"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

/**
 * Light / dark / follow-the-phone.
 *
 * The choice is written to <html data-theme> and to localStorage. An inline
 * script in the layout applies it before first paint — without that, a teacher
 * on dark would get a full screen of cream for one frame every time the app
 * opened, which is exactly the thing dark mode is meant to prevent.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);

  function apply(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") {
      root.removeAttribute("data-theme");
      localStorage.removeItem("theme");
    } else {
      root.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    }
  }

  // Cycle rather than a three-way control: it is one small button in a top bar,
  // and the label always says what you are on.
  const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const label = theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark";

  return (
    <button
      className="btn ghost"
      style={{ padding: "8px 10px", minHeight: 40, fontSize: "0.75rem" }}
      onClick={() => apply(next)}
      aria-label={`Theme: ${label}. Tap to switch.`}
      title={`Theme: ${label}`}
    >
      {label}
    </button>
  );
}
