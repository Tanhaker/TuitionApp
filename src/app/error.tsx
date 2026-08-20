"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * What a teacher sees when a query fails.
 *
 * The default Next error page says "something went wrong" and offers no way
 * out, which in a noisy room mid-class is useless. This says what is likely
 * wrong, gives a retry that re-runs the failed render, and a way back to Today.
 *
 * The message itself is deliberately not shown: in production it is a sanitised
 * digest, and a teacher can do nothing with it. It goes to the console for
 * whoever is debugging.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="wrap" style={{ paddingTop: 48, maxWidth: 460 }}>
      <div className="eyebrow">Tuition register</div>
      <h1 style={{ marginBottom: 14 }}>That did not load</h1>

      <div className="card stack">
        <p className="hint" style={{ color: "var(--ink)" }}>
          The register could not be read. This is almost always a connection
          that dropped — nothing you logged has been lost.
        </p>

        <button className="btn" onClick={reset}>
          Try again
        </button>

        <Link href="/" className="btn ghost" style={{ textAlign: "center" }}>
          Back to Today
        </Link>

        {error.digest && (
          <p className="hint mono" style={{ fontSize: "0.72rem" }}>
            Reference: {error.digest}
          </p>
        )}
      </div>

      <p className="hint" style={{ marginTop: 14 }}>
        If this keeps happening on a good connection, the tuition&rsquo;s
        Supabase project may be paused — free projects pause after a week of no
        activity and need a click to resume.
      </p>
    </main>
  );
}
