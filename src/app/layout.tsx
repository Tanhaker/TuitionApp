import type { Metadata, Viewport } from "next";
import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import RegisterSW from "@/components/RegisterSW";
import ThemeToggle from "@/components/ThemeToggle";
import "./globals.css";

/**
 * Fonts are self-hosted by next/font rather than pulled from Google at runtime.
 *
 * The old <link> to fonts.googleapis.com cost two extra DNS lookups and TLS
 * handshakes before a single glyph could paint, on a phone on tuition wifi.
 * next/font inlines the @font-face rules and serves the files from our own
 * origin, so there is nothing third-party in the critical path.
 *
 * Latin subset only: Gujarati and Hindi names fall through to the system font,
 * which handles those scripts properly. Inter has no Gujarati coverage anyway.
 */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tuition Register",
  description: "Daily teaching log for a mixed-grade tuition.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Register", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f0" },
    { media: "(prefers-color-scheme: dark)", color: "#171714" },
  ],
  width: "device-width",
  initialScale: 1,
  // The app is a form-heavy tool used one-handed; letting iOS zoom on an input
  // focus and leaving it zoomed makes the next tap land in the wrong place.
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {/* Applies the saved theme before first paint, so a dark-mode teacher
            never sees a frame of cream. Inline and synchronous on purpose. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()",
          }}
        />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
