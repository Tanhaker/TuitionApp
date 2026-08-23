"use client";

import { useEffect, useState } from "react";

/**
 * Offers to install the app to the home screen.
 *
 * Teachers are not going to find "Add to Home screen" buried in a browser
 * menu, and the app is meaningfully better installed: full screen, its own
 * icon, no address bar eating a line of a small phone.
 *
 * Two paths, because the platforms differ:
 *   Android/Chrome fires `beforeinstallprompt`, which we capture and replay
 *   when the teacher taps Install — the browser then shows its own dialog.
 *   iOS Safari has no such event and never will, so it gets instructions.
 *
 * Nothing shows once the app is already installed, and a dismissal is
 * remembered so this never becomes a thing to swat away every morning.
 */

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISSED = "install-prompt-dismissed";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    // Already installed: standalone on Android, a non-standard flag on iOS.
    const installed =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (installed) return;

    try {
      if (localStorage.getItem(DISMISSED)) return;
    } catch {
      // Private mode can throw on localStorage. Showing the bar is harmless.
    }

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /safari/i.test(navigator.userAgent) && !/crios|fxios|android/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      setShowIosHint(true);
      setHidden(false);
      return;
    }

    function onPrompt(e: Event) {
      // Stop Chrome showing its own mini-infobar; we place the offer ourselves.
      e.preventDefault();
      setDeferred(e as InstallEvent);
      setHidden(false);
    }

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", () => setHidden(true));
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // Nothing depends on remembering it.
    }
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Either way the event is spent and cannot be replayed.
    setDeferred(null);
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div className="installbar" role="region" aria-label="Install this app">
      <div className="wrap">
        <div>
          <strong>Add to your home screen</strong>
          <p className="hint">
            {showIosHint
              ? "Tap the Share button below, then “Add to Home Screen”."
              : "Opens full screen with its own icon, like any other app."}
          </p>
        </div>
        <div className="between" style={{ gap: 6, flexShrink: 0 }}>
          {!showIosHint && (
            <button className="btn" style={{ minHeight: 40, padding: "8px 14px" }} onClick={install}>
              Install
            </button>
          )}
          <button
            className="btn ghost"
            style={{ minHeight: 40, padding: "8px 12px" }}
            onClick={dismiss}
            aria-label="Dismiss"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
