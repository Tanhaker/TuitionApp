import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Everything except Next's own assets and the PWA files. The service worker
   * and manifest must stay reachable while signed out, or the installed app
   * cannot boot far enough to show the login screen.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon.svg|.*\\.(?:png|jpg|jpeg|svg|gif|webp)$).*)",
  ],
};
