// A route whose screen is not built for the phone yet (ANDROID_APP_SPEC.md §10): it says so plainly rather than
// show an empty list. It stands in only while the screens are being built; no build is given out with one in it.
import { Empty } from "~/ui/empty";
import { Screen } from "~/ui/screen";

export function ComingSoon({ title, back = false }: { title: string; back?: boolean }) {
  return (
    <Screen title={title} back={back}>
      <Empty title="Not in the app yet." line="It is safe in your account. Open Sparehour on the web to use it for now." />
    </Screen>
  );
}
