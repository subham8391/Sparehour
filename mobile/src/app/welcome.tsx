// The first run. Its screen is not built for the phone yet (ANDROID_APP_SPEC.md §10).
import { ComingSoon } from "~/screens/coming-soon";

export default function Route() {
  return <ComingSoon title="Welcome" back />;
}
