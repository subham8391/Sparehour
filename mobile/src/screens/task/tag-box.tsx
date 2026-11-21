// The task's tags on the phone (SCREENS.md §10 "Tags"): each a neutral chip with its own 44-point way off, then a box
// to add one by name. While the box is in use it offers the space's tags the task does not have yet, the best match
// first, as the web's box suggests them; a tap takes one. A name that is new makes the tag (TagRepo's rule).
// Presentational; which tags are offered and how a typed name is read are the web's (features/tasks/detail-rules.ts).
import { useState, type RefObject } from "react";
import { Pressable, StyleSheet, View, type TextInputInstance } from "react-native";
import { Text, TextInput } from "~/ui/text";
import type { TagRef } from "@/core/types";
import { fuzzyScore } from "@/features/commands/fuzzy";
import { tagDraft, unattachedTags } from "@/features/tasks/detail-rules";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Icon } from "~/ui/icon";
import { SectionLabel } from "~/ui/section-label";
import { TARGET, font, useColours } from "~/ui/theme";

/** How many tags the box offers at once: two lines of them at 360 points. */
const OFFERED = 6;

export interface TagBoxProps {
  tags: readonly TagRef[];
  /** Every tag in the space, for suggestions. */
  allTags: readonly TagRef[];
  onAdd?: (name: string) => void;
  onRemove?: (tagId: string) => void;
  /** The box itself, so "Add a tag…" in the footer's menu can put the cursor in it. */
  inputRef?: RefObject<TextInputInstance | null>;
}

export function TagBox({ tags, allTags, onAdd, onRemove, inputRef }: TagBoxProps) {
  const c = useColours();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const name = tagDraft(draft);
  const add = (tag: string) => {
    if (!tag) return;
    onAdd?.(tag);
    setDraft("");
  };
  const offered =
    focused || name
      ? unattachedTags(allTags, tags)
          .map((t) => ({ t, score: fuzzyScore(name, t.name) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score || a.t.name.localeCompare(b.t.name))
          .slice(0, OFFERED)
          .map((x) => x.t)
      : [];
  return (
    <View>
      <SectionLabel label="Tags" />
      <Card style={styles.card}>
        <View style={styles.wrap}>
          {tags.map((t) => (
            <View key={t.id} style={[styles.tag, { backgroundColor: c.surface2 }]}>
              <Text style={[styles.tagText, { color: c.ink2 }]}>@{t.name}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove tag ${t.name}`} onPress={() => onRemove?.(t.id)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }} style={styles.remove}>
                <Icon name="close" size={13} color={c.ink3} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
          <TextInput
            ref={inputRef}
            accessibilityLabel="Add a tag"
            placeholder={tags.length ? "add" : "add tag"}
            placeholderTextColor={c.ink4}
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoCorrect={false}
            autoCapitalize="none"
            // The keyboard stays up after a tag is added, so the next one can be typed straight away.
            submitBehavior="submit"
            returnKeyType="done"
            onSubmitEditing={() => add(name)}
            style={[styles.input, { color: c.ink }]}
          />
        </View>
        {offered.length > 0 ? (
          <View accessibilityLabel="Suggested tags" style={styles.offers}>
            {offered.map((t) => (
              <Button key={t.id} label={`@${t.name}`} accessibilityLabel={`Add tag ${t.name}`} onPress={() => add(t.name)} style={styles.offer} />
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 14, paddingVertical: 4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8 },
  tag: { height: 32, flexDirection: "row", alignItems: "center", borderRadius: 8, paddingLeft: 10, marginVertical: 6 },
  tagText: { fontFamily: font.medium, fontSize: 15 },
  remove: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  input: { flexGrow: 1, minWidth: 96, minHeight: TARGET, paddingVertical: 8, paddingHorizontal: 0, fontFamily: font.medium, fontSize: 17 },
  offers: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 10 },
  offer: { minHeight: TARGET, paddingHorizontal: 14 },
});
