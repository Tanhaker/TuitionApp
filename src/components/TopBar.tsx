import Link from "next/link";
import { signOut } from "@/app/actions";
import ThemeToggle from "@/components/ThemeToggle";

/**
 * Sticky header. The eyebrow says which screen you are on, the title says
 * whose register it is — useful when six teachers share one phone shape and
 * glance down mid-class.
 */
export default function TopBar({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="topbar">
      <div className="wrap">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
        </div>
        <div className="between" style={{ gap: 6 }}>
          <ThemeToggle />
          <Link href="/subjects" className="eyebrow" aria-label="Subjects">
            Subjects
          </Link>
          <form action={signOut}>
            <button className="btn ghost" style={{ padding: "8px 12px", minHeight: 40 }}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
