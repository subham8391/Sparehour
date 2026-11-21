// The quick-add line with its tokens painted in place as they are recognised (SCREENS.md §11): a date, a time, an
// ~estimate, a @tag, !priority and a repeat step back to ink-2, a #project is the meet token, a note is ink-3, and the
// title's own words stay ink. Which token takes which tone is the web's rule (features/quickadd/token-tone.ts) over
// the web's runs (`segments`); only the colours' values are the phone's look.
//
// The web paints a second line under a see-through box. A phone's box takes coloured runs itself: the words are its
// children, not its `value` (React Native allows one or the other), so the caret, the selection and a long line's
// sideways scroll are the box's own and can never drift from the paint. One thing follows from that. React Native
// writes to the box only when what React draws in it changes, so a change the line refuses (a pasted list, the
// Backspace that turns a token back into words) would leave the box holding it. `holds` is what the box was left
// with: it is drawn once, as the box has it, and the drawing after that is the line again, which is then written.
import { Platform, Text, type TextInputProps } from "react-native";
import type { Segment } from "@/features/quickadd/interpret";
import { TOKEN_TONE, type TokenTone } from "@/features/quickadd/token-tone";
import { TextField } from "~/ui/text-field";
import { useColours, type Colours } from "~/ui/theme";

/** A tone of the web's line as the look's colour. */
export function toneColour(tone: TokenTone, c: Pick<Colours, "ink" | "ink2" | "ink3" | "meet">): string {
  return tone === "meet" ? c.meet : tone === "ink-2" ? c.ink2 : tone === "ink-3" ? c.ink3 : c.ink;
}

export interface TokenLineProps extends Omit<TextInputProps, "value" | "defaultValue" | "children"> {
  accessibilityLabel: string;
  /** The line. */
  value: string;
  /** The line cut into plain and token runs (`segments`). */
  painted: readonly Segment[];
  /** What the box holds when that is not the line; null once the two agree. */
  holds?: string | null;
}

export function TokenLine({ value, painted, holds = null, ...box }: TokenLineProps) {
  const c = useColours();
  // The browser preview's box is an <input>, which holds plain words only.
  if (Platform.OS === "web") return <TextField {...box} value={holds ?? value} />;
  const words = holds ?? value;
  return (
    <TextField {...box}>
      {words === "" ? null : (
        <Text>
          {holds !== null
            ? holds
            : painted.map((run, i) =>
                run.kind ? (
                  <Text key={i} style={{ color: toneColour(TOKEN_TONE[run.kind], c) }}>
                    {run.text}
                  </Text>
                ) : (
                  run.text
                ),
              )}
        </Text>
      )}
    </TextField>
  );
}
