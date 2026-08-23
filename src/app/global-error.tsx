"use client";

/**
 * Last resort: an error in the root layout itself, where the normal error.tsx
 * cannot render because the layout that would wrap it is what failed.
 *
 * This replaces the whole document, so it has to carry its own <html> and
 * <body> — and it cannot rely on globals.css having loaded. The styling is
 * therefore inline and deliberately minimal, matching the paper palette by
 * value rather than by token.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf7f0",
          color: "#16233f",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: 20,
        }}
      >
        <main style={{ maxWidth: 420, width: "100%" }}>
          <p
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#55607a",
              margin: 0,
            }}
          >
            Tuition register
          </p>
          <h1 style={{ fontSize: "1.5rem", margin: "6px 0 14px" }}>The app did not load</h1>

          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e4dccc",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <p style={{ fontSize: "0.9rem", lineHeight: 1.5, marginTop: 0 }}>
              Something failed before the page could be built. Nothing you have
              logged has been lost.
            </p>
            <button
              onClick={reset}
              style={{
                width: "100%",
                minHeight: 44,
                borderRadius: 8,
                border: "1px solid #16233f",
                background: "#16233f",
                color: "#faf7f0",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            {error.digest && (
              <p style={{ fontSize: "0.72rem", color: "#55607a", marginBottom: 0 }}>
                Reference: {error.digest}
              </p>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
