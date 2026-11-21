// The page a share with nothing in it lands on (/share): the view, and the way to Today.
import { useRouter } from "expo-router";
import { ShareView } from "./share-view";

export function Share() {
  const router = useRouter();
  return <ShareView onToday={() => router.replace("/")} />;
}
