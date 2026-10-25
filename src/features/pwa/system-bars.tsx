"use client";
// The phone's bars follow the look and the theme (DECISIONS.md, amendment 2026-10-25). The status bar takes the
// look's paper from the theme-color metas, at once, whenever the look, the theme or the system scheme changes, and
// again whenever Next renders the metas afresh (a navigation puts its own back). Chrome paints an installed app's
// navigation bar only from the manifest it fetches, so the manifest link carries the tab bar's colour and the paper:
// the bar matches once Chrome next refreshes the installed app. Mounted by PwaProvider in idle time; the pre-paint
// script has already set Sky's paper for the first frame.
import { useEffect } from "react";
import { cssToHex, hexToRgb, manifestHref } from "./bar-colors";

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
        const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
        const href = manifestHref(c.bar, c.paper);
        if (link && link.getAttribute("href") !== href) link.setAttribute("href", href);
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
