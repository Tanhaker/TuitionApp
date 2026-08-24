"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Fixed bottom nav — thumb reach matters more than screen space here, and the
 * teacher is standing up. Five destinations, no menu, no nesting.
 *
 * Board sits beside Today deliberately: one is what you are writing, the other
 * is what everyone wrote, and they get glanced at in that order.
 */
const ITEMS = [
  { href: "/", glyph: "✓", label: "Today" },
  { href: "/board", glyph: "▦", label: "Board" },
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
