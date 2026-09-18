import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import { PAPER, THEME_BOOTSTRAP } from "@/features/commands/theme";
import "./globals.css";

// Faces (DESIGN_SYSTEM.md §3). Newsreader carries the optical-size axis so the
// same voice holds at 56 px on the hero and 22 px on a pane title; its italic
// is a separate static file that only the qualifier word needs, so it is not
// preloaded. Instrument Sans is the UI face and every numeral. No mono is
// loaded: kbd uses the system stack.
const newsreader = Newsreader({ variable: "--font-newsreader", axes: ["opsz"], style: "normal", subsets: ["latin"], display: "swap" });
const newsreaderItalic = Newsreader({ variable: "--font-newsreader-italic", weight: "400", style: "italic", subsets: ["latin"], display: "swap", preload: false });
const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"], display: "swap" });

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
    <html lang="en" className={`${newsreader.variable} ${newsreaderItalic.variable} ${instrumentSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
