"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fixed bottom nav — thumb reach matters more than screen space here, and the
 * teacher is standing up. Four destinations, no menu, no nesting.
 */
const ITEMS = [
  { href: "/", glyph: "✓", label: "Today" },
  { href: "/plan", glyph: "◷", label: "Plan" },
  { href: "/reports", glyph: "▤", label: "Reports" },
  { href: "/students", glyph: "☺", label: "Students" },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <ul>
        {ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} data-active={active} aria-current={active ? "page" : undefined}>
                <span className="glyph" aria-hidden="true">
                  {item.glyph}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
