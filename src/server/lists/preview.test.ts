// The link preview's fetch is a server reaching where a person points it, so what it refuses matters most: anything
// but http(s) on the usual ports, private and reserved addresses (also inside IPv6), names that are not on the
// internet, and a redirect to any of those. And the page's own words: Open Graph, then <title>, entities decoded.
import { describe, expect, it } from "vitest";
import { fetchPreview, fetchableUrl, isPublicAddress, parsePreview } from "./preview";

describe("isPublicAddress", () => {
  it("refuses private, loopback, link-local, shared, reserved and multicast addresses, in both families", () => {
    for (const a of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1"]) expect(isPublicAddress(a), a).toBe(false);
    for (const a of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "64:ff9b::a00:1", "2001:db8::1"]) expect(isPublicAddress(a), a).toBe(false);
  });

  it("lets the public internet through", () => {
    for (const a of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) expect(isPublicAddress(a), a).toBe(true);
  });

  it("is false for anything that is not an address", () => {
    expect(isPublicAddress("example.com")).toBe(false);
  });
});

describe("fetchableUrl", () => {
  it("takes http(s) links to names and public addresses on the usual ports", () => {
    expect(fetchableUrl("https://myanimelist.net/anime/16498")?.hostname).toBe("myanimelist.net");
    expect(fetchableUrl("http://93.184.216.34/")).not.toBeNull();
    expect(fetchableUrl("https://example.com:443/x")).not.toBeNull();
  });

  it("refuses other schemes, other ports, credentials, private hosts and names that are not on the internet", () => {
    for (const u of [
      "file:///etc/passwd",
      "ftp://example.com/",
      "javascript:alert(1)",
      "https://example.com:8443/",
      "https://user:pass@example.com/",
      "http://127.0.0.1/",
      "http://[::1]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://localhost/",
      "http://intranet/",
      "http://printer.local/",
      "http://db.internal/",
      "not a url",
    ])
      expect(fetchableUrl(u), u).toBeNull();
  });
});

describe("fetchPreview", () => {
  const page = (body: string) => ({ status: 200, location: null, contentType: "text/html; charset=utf-8", body });

  it("follows a redirect to a public page and reads it", async () => {
    const seen: string[] = [];
    const out = await fetchPreview("http://example.com/a", async (url) => {
      seen.push(url.toString());
      return url.pathname === "/a" ? { status: 301, location: "https://example.com/b", contentType: "", body: "" } : page("<title>B</title>");
    });
    expect(seen).toEqual(["http://example.com/a", "https://example.com/b"]);
    expect(out).toEqual({ title: "B", image: null });
  });

  it("never follows a redirect inside the network, and stops after three", async () => {
    const inward = await fetchPreview("https://example.com/", async () => ({ status: 302, location: "http://169.254.169.254/", contentType: "", body: "" }));
    expect(inward).toBeNull();
    let hops = 0;
    const loop = await fetchPreview("https://example.com/0", async (url) => {
      hops += 1;
      return { status: 302, location: `/${Number(url.pathname.slice(1)) + 1}`, contentType: "", body: "" };
    });
    expect(loop).toBeNull();
    expect(hops).toBe(4);
  });

  it("has nothing for a refused link, a failed fetch or a page that is not HTML", async () => {
    expect(await fetchPreview("http://10.0.0.1/", async () => page("<title>x</title>"))).toBeNull();
    expect(await fetchPreview("https://example.com/", async () => Promise.reject(new Error("refused")))).toBeNull();
    expect(await fetchPreview("https://example.com/", async () => ({ status: 200, location: null, contentType: "application/pdf", body: "" }))).toBeNull();
  });
});

describe("parsePreview", () => {
  const base = new URL("https://example.com/shows/aot");

  it("prefers Open Graph, decodes entities, makes the picture absolute", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Attack on Titan &amp; more &#8212; MyAnimeList">
      <meta content='/img/aot.jpg' property='og:image'></head>`;
    expect(parsePreview(html, base)).toEqual({ title: "Attack on Titan & more — MyAnimeList", image: "https://example.com/img/aot.jpg" });
  });

  it("falls back to Twitter's tags, then to <title>, and drops a picture that is not http(s)", () => {
    expect(parsePreview(`<meta name="twitter:title" content="Dune"><meta name="twitter:image" content="javascript:alert(1)">`, base)).toEqual({ title: "Dune", image: null });
    expect(parsePreview(`<title>\n  Piranesi\n  </title>`, base)).toEqual({ title: "Piranesi", image: null });
    expect(parsePreview(`<p>no head</p>`, base)).toEqual({ title: null, image: null });
  });

  it("keeps a title to 300 characters", () => {
    expect(parsePreview(`<title>${"a".repeat(500)}</title>`, base).title).toHaveLength(300);
  });
});
