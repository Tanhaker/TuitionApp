"use client";

import { useState } from "react";

type Row = Record<string, string | number | null | undefined>;

/**
 * Downloads the visible report as a CSV, built in the browser from data the
 * server already sent — no second round trip, and nothing to keep in sync with
 * what is on screen.
 */
function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);

  const cell = (value: string | number | null | undefined) => {
    const s = value === null || value === undefined ? "" : String(value);
    // Quote if it contains a delimiter, a quote, or a newline; double up quotes.
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => cell(row[h])).join(",")),
  ].join("\r\n");
}

export default function CsvButton({ rows, filename }: { rows: Row[]; filename: string }) {
  const [done, setDone] = useState(false);

  function download() {
    // The leading BOM is what makes Excel read the file as UTF-8. Without it,
    // Gujarati and Hindi student names come out as mojibake.
    const blob = new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <button
      className="btn ghost"
      style={{ padding: "8px 12px", minHeight: 40 }}
      onClick={download}
      disabled={rows.length === 0}
    >
      {done ? "Saved" : "Export CSV"}
    </button>
  );
}
