// The pre-paint script (THEME_BOOTSTRAP), apart from theme.ts: only the root layout, a server component, imports it,
// so neither the script nor the expressions that build it ride in a client bundle (theme.ts is in every shell).
import { PREFS } from "@/features/shell/panes";
import { DEFAULT_LOOK, LOOK_KEY, LOOK_LINK_ID, lookHref } from "@/features/looks/look";
import { MOTION_KEY, PAPER, THEME_KEY } from "./theme";

// The look's stylesheet as a template: the id is filled in on the device, the build's version here.
const LOOK_HREF = lookHref("__LOOK__");

// The context pane's widths (features/shell/pane-resizer.tsx, a client island the server cannot read values from):
// its storage key and range, kept equal by panes.test.ts.
const PANES_KEY = "sparehour.panes";
const PANE_MIN = 320;
const PANE_MAX = 560;

/**
 * Inline in `<head>`, before any paint: stamps `data-motion="reduce"` when this
 * device asked for less motion, the layout choices (`data-sidebar="rail"`,
 * `data-day-pane="hidden"`, shell/panes.ts), the context pane's width per view as one
 * <style> (shell/pane-resizer.tsx), the part of the day (`data-daypart`, for the
 * looks that paint a sky), the chosen look (`data-look` and its stylesheet,
 * render-blocking where the browser allows, features/looks/look.ts) and
 * `data-theme` from the stored choice, then points the theme-color metas at
 * that paper once the head has parsed (pages without the app shell never run
 * `applyTheme`). Kept tiny.
 */
export const THEME_BOOTSTRAP = `(function(){try{var d=document.documentElement;var h=new Date().getHours();d.dataset.daypart=h>=5&&h<12?"morning":h>=12&&h<17?"afternoon":h>=17&&h<21?"evening":"night";try{var l=localStorage.getItem("${LOOK_KEY}");if(l&&l!=="${DEFAULT_LOOK}"&&/^[a-z][a-z-]{0,23}$/.test(l)){d.dataset.look=l;var k=document.createElement("link");k.id="${LOOK_LINK_ID}";k.rel="stylesheet";k.setAttribute("blocking","render");k.href=${JSON.stringify(LOOK_HREF)}.replace("__LOOK__",l);document.head.appendChild(k)}}catch(e){}if(localStorage.getItem("${MOTION_KEY}")==="reduce")d.dataset.motion="reduce";${Object.keys(PREFS).map((k) => `var ${k}=localStorage.getItem("sparehour.${k}");if(${k})d.dataset.${k}=${k};`).join("")}try{var p=JSON.parse(localStorage.getItem("${PANES_KEY}")||"{}"),s="";for(var k in p)if(/^[a-z-]+$/.test(k))s+='[data-view="'+k+'"]{--pane-w:'+Math.min(${PANE_MAX},Math.max(${PANE_MIN},+p[k]||0))+'px}';if(s){var e=document.createElement("style");e.id="pane-w";e.textContent=s;document.head.appendChild(e)}}catch(e){}var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")return;d.dataset.theme=t;var c=t==="dark"?"${PAPER.dark}":"${PAPER.light}";document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.dataset.media=m.media;m.removeAttribute("media");m.content=c;});});}catch(e){}})();`;
