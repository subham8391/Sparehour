import { redirect } from "next/navigation";

/** The app is the product: the root goes to Today (the proxy sends a signed-out visitor to /login). */
export default function Home() {
  redirect("/today");
}
