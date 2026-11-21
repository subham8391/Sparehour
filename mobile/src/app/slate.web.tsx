// The browser preview of Clear the slate (npm run preview, /slate): the real view, made-up counts. `?state=counting`
// is the moment before the counts are in, `?state=none` a day with nothing to archive, `?state=fail` a write that
// could not be made. Nothing here writes. See _layout.web.tsx.
import { useLocalSearchParams } from "expo-router";
import { SlateView } from "~/screens/slate/slate-view";

export default function Preview() {
  const q = useLocalSearchParams<{ state?: string }>();
  const counts = q.state === "counting" ? undefined : q.state === "none" ? { today: 0, backlog: 0 } : { today: 12, backlog: 35 };
  return (
    <SlateView
      counts={counts}
      onConfirm={(scope) => (q.state === "fail" ? Promise.reject(new Error("preview")) : Promise.resolve(console.log(`[preview] archive ${scope}`)))}
      onClose={() => console.log("[preview] close")}
    />
  );
}
