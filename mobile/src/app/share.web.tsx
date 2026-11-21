// The browser preview of the page a share with nothing in it opens (npm run preview, /share): the real view. See
// _layout.web.tsx.
import { ShareView } from "~/share/share-view";

export default function Preview() {
  return <ShareView onToday={() => undefined} />;
}
