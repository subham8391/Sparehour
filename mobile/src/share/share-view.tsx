// What a share that brought nothing opens (the web's /share with no words and no link): it says so, in the web's
// words, with the way to Today. A share that did bring something never shows this: it opens quick add over the Inbox
// (opening.ts). Presentational.
import { Button } from "~/ui/button";
import { Empty } from "~/ui/empty";
import { Screen } from "~/ui/screen";

export function ShareView({ onToday }: { onToday: () => void }) {
  return (
    <Screen eyebrow="Share" title="Nothing came through">
      <Empty title="The app you shared from sent no words or link.">
        <Button label="Go to Today" onPress={onToday} style={{ alignSelf: "flex-start", marginTop: 8 }} />
      </Empty>
    </Screen>
  );
}
