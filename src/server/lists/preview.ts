// A list item's link preview (DECISIONS.md, amendment 2026-10-22; FEATURES.md §12): the page's title and picture,
// read on the server from its Open Graph tags or <title>. The person's link is fetched by us, so it is fetched
// carefully (OWASP SSRF): http(s) on the usual ports only, every address it resolves to — and every redirect's —
// public, the connection pinned to the address that was checked, three redirects at most, five seconds, the first
// 512 KB of an HTML answer and no more, and no cookies or credentials of anyone's.
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";

export interface LinkPreview {
  title: string | null;
  image: string | null;
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const TITLE_MAX = 300;
const IMAGE_MAX = 2048;

// Everything that is not the public internet: private, loopback, link-local, shared (CGNAT), documentation,
// benchmarking, multicast and reserved ranges, for both families.
const BLOCKED = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  BLOCKED.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const)
  BLOCKED.addSubnet(net, prefix, "ipv6");

/** The IPv4 address inside an IPv4-mapped or -compatible IPv6 one (`::ffff:10.0.0.1`, `::ffff:a00:1`), if it is one. */
function embeddedV4(address: string): string | null {
  const m = /^(?:0{0,4}:){0,5}(?:ffff:)?((?:\d{1,3}\.){3}\d{1,3})$/i.exec(address.replace(/^::/, "0::"));
  if (m) return m[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const [a, b] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
  return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
}

/** Whether an address is on the public internet (anything else is never fetched). */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !BLOCKED.check(address, "ipv4");
  if (family === 6) {
    const v4 = embeddedV4(address);
    if (v4) return isPublicAddress(v4);
    return !BLOCKED.check(address, "ipv6");
  }
  return false;
}

/** A link we would fetch: http or https, the default ports, no credentials in it, a host that is a name or a public address. */
export function fetchableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && !["80", "443"].includes(url.port)) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicAddress(host) ? url : null;
  if (!host.includes(".") || /\.(?:local|localhost|internal|lan|home|corp|test|invalid)$/i.test(host) || /^localhost$/i.test(host)) return null;
  return url;
}

/** Resolves a name and refuses it unless every address it has is public; the connection then uses the one checked. */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, family: options.family }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "", 4);
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`refused: ${hostname} resolves to a non-public address`), { code: "EBLOCKED" }), "", 4);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
};

interface Answer {
  status: number;
  location: string | null;
  contentType: string;
  body: string;
}

function getOnce(url: URL, signal: AbortSignal): Promise<Answer> {
  const lib = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.get(
      url,
      {
        lookup: safeLookup,
        signal,
        headers: { "user-agent": "SparehourLinkPreview/1.0", accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-language": "en" },
        // No pooled sockets: each request resolves and checks its own address.
        agent: false,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "");
        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location ?? null, contentType, body: "" });
        }
        if (status !== 200 || !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
          res.resume();
          return resolve({ status, location: null, contentType, body: "" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => {
          const charset = /charset=([\w-]+)/i.exec(contentType)?.[1] ?? "utf-8";
          let decoder: TextDecoder;
          try {
            decoder = new TextDecoder(charset);
          } catch {
            decoder = new TextDecoder("utf-8");
          }
          resolve({ status, location: null, contentType, body: decoder.decode(Buffer.concat(chunks)) });
        };
        res.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.length;
          // The head is all we read: stop at its end, or at the cap.
          if (size >= MAX_BYTES || /<\/head>/i.test(chunk.toString("latin1"))) {
            res.destroy();
            finish();
          }
        });
        res.on("end", finish);
        res.on("error", reject);
      },
    );
    req.on("error", reject);
  });
}

/** The page's preview, following at most three redirects, each one checked as the first; null when there is none to have. */
export async function fetchPreview(raw: string, get: (url: URL, signal: AbortSignal) => Promise<Answer> = getOnce): Promise<LinkPreview | null> {
  let url = fetchableUrl(raw);
  if (!url) return null;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let answer: Answer;
    try {
      answer = await get(url, signal);
    } catch {
      return null;
    }
    if (answer.status >= 300 && answer.status < 400 && answer.location) {
      let next: URL;
      try {
        next = new URL(answer.location, url);
      } catch {
        return null;
      }
      const checked = fetchableUrl(next.toString());
      if (!checked) return null;
      url = checked;
      continue;
    }
    if (!answer.body) return null;
    return parsePreview(answer.body, url);
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

const clean = (s: string | undefined, max: number): string | null => {
  const t = s ? decodeEntities(s).replace(/\s+/g, " ").trim() : "";
  return t ? t.slice(0, max) : null;
};

/** The title and picture a page offers: Open Graph first, then Twitter's tags, then its <title>; the picture made absolute, http(s) only. */
export function parsePreview(html: string, base: URL): LinkPreview {
  const head = html.slice(0, MAX_BYTES);
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const m of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) attrs.set(m[1].toLowerCase(), m[2] ?? m[3] ?? m[4] ?? "");
    const key = (attrs.get("property") ?? attrs.get("name") ?? "").toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1];
  const title = clean(meta.get("og:title") ?? meta.get("twitter:title") ?? titleTag, TITLE_MAX);
  const rawImage = meta.get("og:image:secure_url") ?? meta.get("og:image") ?? meta.get("og:image:url") ?? meta.get("twitter:image") ?? meta.get("twitter:image:src");
  let image: string | null = null;
  if (rawImage) {
    try {
      const u = new URL(decodeEntities(rawImage.trim()), base);
      if ((u.protocol === "https:" || u.protocol === "http:") && u.toString().length <= IMAGE_MAX) image = u.toString();
    } catch {
      image = null;
    }
  }
  return { title, image };
}
