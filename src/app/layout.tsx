import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader, Plus_Jakarta_Sans } from "next/font/google";
import { PAPER } from "@/features/commands/theme";
import { THEME_BOOTSTRAP } from "@/features/commands/theme-bootstrap";
import "./globals.css";

// Faces (DESIGN_SYSTEM.md §3). Plus Jakarta Sans is Sky's, the default look, for everything: preloaded. The Daylight
// look's faces (Newsreader with its optical-size axis and its italic for the qualifier word, Instrument Sans for the
// UI) stay declared here because that look's stylesheet names them, but nothing preloads them: a browser fetches a
// face only when a page uses it. Every other look brings its own faces (public/fonts/). No mono is loaded: kbd uses
// the system stack.
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const newsreader = Newsreader({ variable: "--font-newsreader", axes: ["opsz"], style: "normal", subsets: ["latin"], display: "swap", preload: false });
const newsreaderItalic = Newsreader({ variable: "--font-newsreader-italic", weight: "400", style: "italic", subsets: ["latin"], display: "swap", preload: false });
const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  appleWebApp: { title: "Sparehour", capable: true, statusBarStyle: "default" },
  title: "Sparehour",
  description: "A calm planner that knows how much free time you really have.",
};

export const viewport: Viewport = {
  // Sheets dock above the on-screen keyboard: let the keyboard shrink the layout viewport.
  interactiveWidget: "resizes-content",
  viewportFit: "cover",
  // The system state; `applyTheme` repoints these when a theme is chosen.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: PAPER.light },
    { media: "(prefers-color-scheme: dark)", color: PAPER.dark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the bootstrap script stamps data-theme before React hydrates.
    <html lang="en" className={`${jakarta.variable} ${newsreader.variable} ${newsreaderItalic.variable} ${instrumentSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
