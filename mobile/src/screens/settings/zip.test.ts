// The Markdown export's archive: a zip any tool reads, with the files stored as they are.
import { crc32, utf8, zip } from "./zip";

const AT = new Date(2026, 10, 22, 10, 30, 12);
const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) => (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const text = (b: Uint8Array) => decodeURIComponent(Array.from(b, (c) => `%${c.toString(16).padStart(2, "0")}`).join(""));

/** Reads an archive back the way an unzip tool does: from the end record, through the directory, to each file. */
function read(bytes: Uint8Array): { path: string; content: string; crc: number }[] {
  const end = bytes.length - 22;
  expect(u32(bytes, end)).toBe(0x06054b50);
  const count = u16(bytes, end + 10);
  let at = u32(bytes, end + 16);
  expect(u32(bytes, end + 12)).toBe(end - at);
  const files = [];
  for (let i = 0; i < count; i++) {
    expect(u32(bytes, at)).toBe(0x02014b50);
    const size = u32(bytes, at + 24);
    const nameLength = u16(bytes, at + 28);
    const local = u32(bytes, at + 42);
    const path = text(bytes.slice(at + 46, at + 46 + nameLength));
    expect(u32(bytes, local)).toBe(0x04034b50);
    // Stored, UTF-8 names, and both headers agree.
    expect(u16(bytes, local + 8)).toBe(0);
    expect(u16(bytes, local + 6) & 0x0800).toBe(0x0800);
    expect(u32(bytes, local + 18)).toBe(size);
    expect(u32(bytes, local + 22)).toBe(size);
    const from = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const data = bytes.slice(from, from + size);
    expect(crc32(data)).toBe(u32(bytes, at + 16));
    files.push({ path, content: text(data), crc: u32(bytes, local + 14) });
    at += 46 + nameLength;
  }
  expect(at).toBe(end);
  return files;
}

describe("zip", () => {
  it("knows the checksum every zip tool checks", () => {
    // The standard check value of CRC-32.
    expect(crc32(utf8("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it("writes text as UTF-8, accents and emoji included", () => {
    expect(Array.from(utf8("é"))).toEqual([0xc3, 0xa9]);
    expect(Array.from(utf8("✓"))).toEqual([0xe2, 0x9c, 0x93]);
    expect(Array.from(utf8("🙂"))).toEqual([0xf0, 0x9f, 0x99, 0x82]);
  });

  it("holds every file under its path, whole, and reads back as it went in", () => {
    const files = [
      { path: "sparehour-markdown-2026-11-22/README.md", content: "# Export\n\nCafé — naïve ✓ 🙂\n" },
      { path: "sparehour-markdown-2026-11-22/projects/acme-launch.md", content: "# Acme launch\n\n- [ ] Draft the proposal\n" },
      { path: "sparehour-markdown-2026-11-22/empty.md", content: "" },
    ];
    const back = read(zip(files, AT));
    expect(back.map(({ path, content }) => ({ path, content }))).toEqual(files);
    expect(back[0].crc).toBe(crc32(utf8(files[0].content)));
  });

  it("stamps the entries with the time of the export", () => {
    const bytes = zip([{ path: "a.md", content: "a" }], AT);
    expect(u16(bytes, 10)).toBe((10 << 11) | (30 << 5) | 6);
    expect(u16(bytes, 12)).toBe(((2026 - 1980) << 9) | (11 << 5) | 22);
  });

  it("an export with no files is still an archive", () => {
    expect(read(zip([], AT))).toEqual([]);
  });
});
