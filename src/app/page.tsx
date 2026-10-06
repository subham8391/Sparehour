import { redirect } from "next/navigation";

/**
 * The app is the product: the root goes to Today (the proxy sends a signed-out visitor to /login), marked as an
 * app open so the shell can go on to the view chosen in Settings › Planning "Open to" (`features/shell/open-to`).
 */
export default function Home() {
  redirect("/today?src=home");
}
