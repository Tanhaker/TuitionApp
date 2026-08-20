"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The one client component that talks to Supabase directly.
 *
 * Sign-in has to run in the browser so @supabase/ssr can write the session
 * cookies the middleware then reads on every subsequent request. Every other
 * read and write in the app goes through a server component or a server action
 * — see src/app/actions.ts.
 *
 * There is no sign-up form: the six teachers are created once in the Supabase
 * dashboard. Public sign-up on a shared tuition register would be a way in for
 * anyone who guessed the URL.
 */
/**
 * Turn a Supabase auth error into something a teacher can act on.
 *
 * The distinction that matters is between "you typed the wrong password" and
 * "the request never reached a server". The second one used to be reported as
 * "check your connection", which is wrong often enough to be harmful: an
 * unreachable Supabase project produces exactly the same failure as dead wifi,
 * and it sends someone off restarting their router over an env var.
 */
function describeSignInError(error: { message: string; name?: string; status?: number }): string {
  if (error.message === "Invalid login credentials") {
    return "That email and password do not match. Check them and try again.";
  }
  if (/not confirmed/i.test(error.message)) {
    return "That account has not been confirmed yet. Whoever set it up needs to tick Auto Confirm in the Supabase dashboard.";
  }
  if (/signups not allowed|signup is disabled/i.test(error.message)) {
    return "That account does not exist. Accounts are created by whoever set up the tuition — ask them to add you.";
  }

  // supabase-js wraps a failed fetch as AuthRetryableFetchError with no status.
  const unreachable =
    error.name === "AuthRetryableFetchError" ||
    !error.status ||
    /fetch|network/i.test(error.message);

  if (unreachable) {
    return "Could not reach the sign-in server. If your connection is working, the app is probably pointed at the wrong Supabase URL.";
  }

  return `Could not sign in (${error.message}).`;
}

export default function LoginForm({
  next,
  setupError,
}: {
  next: string;
  /** Set when the app has no real Supabase project configured. */
  setupError?: string | null;
}) {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError(describeSignInError(error));
      setBusy(false);
      return;
    }

    // refresh() so the server re-renders with the new session before we land.
    router.replace(next);
    router.refresh();
  }

  return (
    <main className="wrap" style={{ paddingTop: 48, maxWidth: 420 }}>
      <div className="eyebrow">Tuition register</div>
      <h1 style={{ marginBottom: 18 }}>Sign in</h1>

      {setupError && (
        <div
          className="card stack"
          style={{ borderColor: "var(--marigold)", background: "var(--mari-soft)", marginBottom: 12 }}
        >
          <strong style={{ fontSize: "0.95rem" }}>Not connected to Supabase yet</strong>
          <p className="hint" style={{ color: "var(--ink)" }}>
            {setupError} Sign-in cannot work until that is fixed &mdash; it is not
            a problem with your connection.
          </p>
          <p className="hint" style={{ color: "var(--ink)" }}>
            Copy <code className="mono">.env.local.example</code> to{" "}
            <code className="mono">.env.local</code>, paste the Project URL and
            the <code className="mono">anon</code> key from Supabase &rarr;
            Project Settings &rarr; API, then reload.
          </p>
        </div>
      )}

      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="err">{error}</p>}

        <button className="btn" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="hint" style={{ marginTop: 14 }}>
        You stay signed in on this phone. If you have forgotten your password,
        ask whoever set up the tuition&rsquo;s Supabase project to reset it.
      </p>
    </main>
  );
}
