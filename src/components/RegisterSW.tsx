"use client";

import { useEffect } from "react";

/**
 * Registers the shell-only service worker. Kept out of the layout body so the
 * layout can stay a server component.
 */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // An unregistered worker only costs offline shell caching. Nothing in the
      // app depends on it, so there is nothing useful to tell the teacher.
    });
  }, []);

  return null;
}
