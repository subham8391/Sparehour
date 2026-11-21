"use client";
// The phone's bars follow the look and the theme (DECISIONS.md, amendment 2026-10-25). The status bar takes the
// look's paper from the theme-color metas, at once, whenever the look, the theme or the system scheme changes, and
// again whenever Next renders the metas afresh (a navigation puts its own back). Chrome paints an installed app's
// navigation bar only from the manifest it fetches, so the manifest is served with the tab bar's colour and the
// paper, which a cookie carries: the bar matches at an install, or once Chrome next refreshes the installed app.
// The manifest keeps one address whatever the colours (DECISIONS.md, amendment 2026-11-21): until then each look
// and theme had its own (`?bar=…&paper=…`), and Chrome's own guidance is that a manifest whose location changes
// may never update the installed app. When the colours change the link is put back where it is, which makes Chrome
// drop the manifest it read for this page and read it again, now with the new cookie. Mounted by PwaProvider in
// idle time; the pre-paint script has already set Sky's paper for the first frame.
import { useEffect } from "react";
import { barsCookie, cssToHex, hexToRgb } from "./bar-colors";

function colours(): { paper: string; bar: string } | null {
  const paper = cssToHex(getComputedStyle(document.body).backgroundColor);
  if (!paper) return null;
  // The tab bar's surface, laid over the paper when a look makes it see-through.
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:0;height:0;visibility:hidden;background-color:var(--surface)";
  document.body.appendChild(probe);
  const bar = cssToHex(getComputedStyle(probe).backgroundColor, hexToRgb(paper)) ?? paper;
  probe.remove();
  return { paper, bar };
}

export default function SystemBars() {
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const c = colours();
        if (!c) return;
        document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
          if (meta.media) {
            meta.dataset.media = meta.media;
            meta.removeAttribute("media");
          }
          if (meta.content !== c.paper) meta.content = c.paper;
        });
        // The colours go in the cookie, which the manifest's fetch carries (the link is crossorigin="use-credentials").
        const cookie = barsCookie(c.bar, c.paper);
        if (document.cookie.includes(cookie.split(";")[0])) return;
        document.cookie = cookie;
        // Same node, same address, taken out and put back: the browser forgets the manifest it read with the old
        // cookie, so an install from the menu, and the installed app's own check for a newer manifest, get these colours.
        const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        link?.parentNode?.insertBefore(link, link.nextSibling);
      });
    };
    sync();
    const root = new MutationObserver(sync);
    root.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-look", "data-daypart"] });
    // A navigation's fresh metas, and a look's stylesheet arriving.
    const head = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes].some((n) => n instanceof HTMLMetaElement || n instanceof HTMLLinkElement))) sync();
    });
    head.observe(document.head, { childList: true });
    const scheme = matchMedia("(prefers-color-scheme: dark)");
    scheme.addEventListener("change", sync);
    return () => {
      cancelAnimationFrame(frame);
      root.disconnect();
      head.disconnect();
      scheme.removeEventListener("change", sync);
    };
  }, []);
  return null;
}
