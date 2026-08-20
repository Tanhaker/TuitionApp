"use client";

import { useState } from "react";

/**
 * Sends the report straight into WhatsApp (or whatever the phone offers)
 * instead of downloading a file the teacher then has to find and attach.
 *
 * Shares as TEXT, not as a file: a shared file arrives in WhatsApp as a .txt
 * attachment nobody opens, whereas shared text arrives as a readable message.
 *
 * The Web Share API needs HTTPS and a real user gesture, and it is missing on
 * most desktop browsers — so the fallback copies to the clipboard, which is the
 * same two-step the teacher would otherwise do by hand.
 */
export default function ShareTextButton({
  text,
  title,
  disabled,
}: {
  text: string;
  title: string;
  disabled?: boolean;
}) {
  const [state, setState] = useState<"idle" | "shared" | "copied" | "failed">("idle");

  function flash(next: "shared" | "copied" | "failed") {
    setState(next);
    setTimeout(() => setState("idle"), 2200);
  }

  async function send() {
    // Feature-detect share itself, not the user agent.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text });
        flash("shared");
        return;
      } catch (e) {
        // AbortError just means the teacher closed the share sheet. That is not
        // a failure and must not fall through to a surprise clipboard write.
        if (e instanceof DOMException && e.name === "AbortError") {
          setState("idle");
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      flash("copied");
    } catch {
      flash("failed");
    }
  }

  const label =
    state === "shared"
      ? "Sent"
      : state === "copied"
        ? "Copied"
        : state === "failed"
          ? "Could not share"
          : "Send report";

  return (
    <button className="btn" style={{ minHeight: 40, padding: "8px 14px" }} onClick={send} disabled={disabled}>
      {label}
    </button>
  );
}
