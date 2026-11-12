import { redirect } from "next/navigation";
import { currentUserEmail } from "@/lib/session";

/**
 * Authorisation for pages and data loaders. Call this FIRST in every server component that reads
 * data, and inside every data loader.
 *
 * Why not just rely on the layout's <AuthGate>? A layout and its page render concurrently, so the
 * page could finish querying and start streaming data before the layout's redirect lands. The only
 * safe place to authorise is in front of the data itself.
 */
export async function requireSignedIn(): Promise<string> {
  const email = await currentUserEmail();
  if (!email) redirect("/login");
  return email;
}
