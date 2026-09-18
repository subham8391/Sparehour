/** Joins class names, dropping the falsy ones. The whole helper; no merge library (bundle budget). */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
