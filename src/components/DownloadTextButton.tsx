"use client";

import { useState } from "react";

/**
 * Saves a plain-text report the server already composed.
 *
 * The wording is built on the server (src/lib/report-text.ts) rather than here,
 * so there is one place to read and change it. This component only handles the
 * download.
 */
export default function DownloadTextButton({
  text,
  filename,
  disabled,
}: {
  text: string;
  filename: string;
  disabled?: boolean;
}) {
  const [done, setDone] = useState(false);

  function download() {
    // BOM so Notepad and Word read it as UTF-8 — without it Gujarati and Hindi
    // names come out as mojibake.
    const blob = new Blob(["﻿" + text], { type: "text/plain;charset=utf-8;" });
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
      disabled={disabled}
    >
      {done ? "Saved" : "Export text"}
    </button>
  );
}
