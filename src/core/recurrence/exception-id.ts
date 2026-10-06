// The id of a series exception (SYSTEM_DESIGN.md §5.2 "Series edits") is made
// from the series and the occurrence it is about, so every device names the
// same exception the same way. Postgres keeps one row per (series, occurrence)
// even once it is soft-deleted, and the upload is an upsert by id: a second
// "just this once" on the same occurrence — here, on another device, or after
// an undo — lands on that row instead of colliding with it. Pure.

/** cyrb128: four 32-bit lanes of a fast non-cryptographic hash. */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A version-8 UUID (RFC 9562) for the exception on `occurrence` (an ISO date) of the series `seriesId`. */
export function exceptionId(seriesId: string, occurrence: string): string {
  const hex = cyrb128(`${seriesId.toLowerCase()}|${occurrence}`)
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
