// For the tests of the quick-add line: the words the box holds, exactly as they are in it (every space kept). The
// box's words are its children, in runs of their own colour (token-line.tsx), so there is no `value` to read.
type Drawn = string | { children?: readonly Drawn[] | null };

export function wordsIn(box: Drawn): string {
  return typeof box === "string" ? box : (box.children ?? []).map(wordsIn).join("");
}
