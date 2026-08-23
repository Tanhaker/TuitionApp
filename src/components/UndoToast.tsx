"use client";

/**
 * A short-lived offer to reverse the write that just happened.
 *
 * The write itself is never delayed and never confirmed first — tapping a chip
 * has to stay instant, that is the whole point of the screen. This appears
 * after the fact and disappears on its own, so the fast path costs nothing and
 * a mis-tap is still recoverable.
 *
 * Sits above the bottom nav rather than over it, so the nav stays reachable.
 */
export default function UndoToast({
  message,
  onUndo,
  onDismiss,
  busy,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <div className="undobar" role="status" aria-live="polite">
      <div className="wrap">
        <span className="msg">{message}</span>
        <div className="between" style={{ gap: 6, flexShrink: 0 }}>
          <button
            className="btn"
            style={{ minHeight: 44, padding: "8px 16px" }}
            onClick={onUndo}
            disabled={busy}
          >
            {busy ? "…" : "Undo"}
          </button>
          <button
            className="btn ghost"
            style={{ minHeight: 44, padding: "8px 12px" }}
            onClick={onDismiss}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
