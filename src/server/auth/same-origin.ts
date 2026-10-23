// A state-changing request from one of our own pages: the browser's Origin header (or, without one, Sec-Fetch-Site)
// says so. The consent decision and Settings › Connected apps refuse anything else, so another site cannot approve
// an app or widen its access on a signed-in person's behalf.
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin) return origin === new URL(req.url).origin;
  const site = req.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}
