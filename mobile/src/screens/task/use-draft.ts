// Words being typed into a box that saves itself (the detail has no Save button, SCREENS.md §10): the box shows the
// draft, a change that arrives from elsewhere (another device) replaces it, and leaving the box commits it. A box
// still being typed in when its screen goes away (Back) is committed too: a removed field gets no blur.
import { useEffect, useRef, useState } from "react";

/** `commit` writes the text if it should be written, and returns what the box reads afterwards. */
export function useDraft(value: string, commit: (text: string) => string) {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(value);
  }
  const live = useRef({ draft, commit, focused: false });
  useEffect(() => {
    live.current.draft = draft;
    live.current.commit = commit;
  });
  useEffect(
    () => () => {
      const now = live.current;
      if (now.focused) now.commit(now.draft);
    },
    [],
  );
  return {
    draft,
    setDraft,
    onFocus: () => {
      live.current.focused = true;
    },
    onBlur: () => {
      live.current.focused = false;
      setDraft(commit(draft));
    },
  };
}
