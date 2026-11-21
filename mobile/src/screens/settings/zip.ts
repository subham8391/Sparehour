// A zip archive from a handful of text files, for the Markdown export (PRODUCT_SPEC.md §19.1: "one file per project,
// zipped"). The web zips with a library (fflate, ../../../../src/features/export/build.ts) that is not among this
// app's packages; an archive whose files are stored as they are, without compression, needs none: local headers, the
// files, a central directory. Every unzip tool reads it. Pure.

/** Text as UTF-8 bytes. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return Uint8Array.from(out);
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 every zip entry carries. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Little-endian fields written one after another. */
class Writer {
  readonly bytes: Uint8Array;
  private readonly view: DataView;
  private at = 0;
  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(n: number): this {
    this.view.setUint16(this.at, n, true);
    this.at += 2;
    return this;
  }
  u32(n: number): this {
    this.view.setUint32(this.at, n >>> 0, true);
    this.at += 4;
    return this;
  }
  raw(b: Uint8Array): this {
    this.bytes.set(b, this.at);
    this.at += b.length;
    return this;
  }
  get offset(): number {
    return this.at;
  }
}

/** Names are UTF-8 (general purpose bit 11); the files are stored, not deflated (method 0). */
const UTF8_NAMES = 0x0800;
const STORED = 0;
const VERSION = 20;

/** The archive's bytes. `at` stamps every entry: a zip keeps local wall-clock time, to two seconds. */
export function zip(files: readonly { path: string; content: string }[], at: Date): Uint8Array {
  const time = (at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1);
  const date = ((Math.max(1980, at.getFullYear()) - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate();
  const entries = files.map((f) => {
    const data = utf8(f.content);
    return { name: utf8(f.path), data, crc: crc32(data) };
  });
  const body = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0);
  const directory = entries.reduce((n, e) => n + 46 + e.name.length, 0);
  const w = new Writer(body + directory + 22);
  const offsets: number[] = [];
  for (const e of entries) {
    offsets.push(w.offset);
    w.u32(0x04034b50).u16(VERSION).u16(UTF8_NAMES).u16(STORED).u16(time).u16(date).u32(e.crc).u32(e.data.length).u32(e.data.length).u16(e.name.length).u16(0).raw(e.name).raw(e.data);
  }
  entries.forEach((e, i) => {
    w.u32(0x02014b50).u16(VERSION).u16(VERSION).u16(UTF8_NAMES).u16(STORED).u16(time).u16(date).u32(e.crc).u32(e.data.length).u32(e.data.length).u16(e.name.length).u16(0).u16(0).u16(0).u16(0).u32(0).u32(offsets[i]).raw(e.name);
  });
  w.u32(0x06054b50).u16(0).u16(0).u16(entries.length).u16(entries.length).u32(directory).u32(body).u16(0);
  return w.bytes;
}
