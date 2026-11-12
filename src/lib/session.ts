import { auth, isAllowedEmail } from "@/auth";

/** For route handlers and server actions: returns the signed-in company user's email or null. */
export async function currentUserEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  return isAllowedEmail(email) ? email!.toLowerCase() : null;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
  }
}

export async function requireUser(): Promise<string> {
  const email = await currentUserEmail();
  if (!email) throw new UnauthorizedError();
  return email;
}
