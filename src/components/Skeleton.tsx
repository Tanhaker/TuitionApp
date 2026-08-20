/**
 * Shared loading shell.
 *
 * Every screen reads per-user data and so is force-dynamic, which means the
 * browser would otherwise sit on the previous page until the server responded.
 * Showing the real chrome — top bar, nav, card outlines — makes a navigation
 * feel immediate and keeps the layout from jumping when the data lands.
 */
export default function Skeleton({
  eyebrow,
  title,
  rows = 4,
}: {
  eyebrow: string;
  title: string;
  rows?: number;
}) {
  return (
    <>
      <header className="topbar">
        <div className="wrap">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{title}</h1>
          </div>
        </div>
      </header>
      <main className="wrap" style={{ paddingTop: 12 }}>
        <div className="register" aria-busy="true" aria-live="polite">
          {Array.from({ length: rows }).map((_, i) => (
            <div className="row skeleton" key={i}>
              <div className="bar" style={{ width: "42%", height: 14 }} />
              <div className="chips" style={{ marginTop: 10 }}>
                <div className="bar" style={{ width: 74, height: 34, borderRadius: 999 }} />
                <div className="bar" style={{ width: 92, height: 34, borderRadius: 999 }} />
                <div className="bar" style={{ width: 64, height: 34, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
