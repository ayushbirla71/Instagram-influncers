import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import type { Provider } from "next-auth/providers";

const allowedDomain = (process.env.ALLOWED_EMAIL_DOMAIN ?? "demokrito.com").toLowerCase();

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  return at > 0 && email.slice(at + 1).toLowerCase() === allowedDomain;
}

// Passwordless login for local development ONLY. Hard-disabled in production
// regardless of the env flag so it can never ship by accident.
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN === "1";

const providers: Provider[] = [];

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      // `hd` only hints Google's account chooser; the real check is in the signIn callback.
      authorization: { params: { hd: allowedDomain } },
    }),
  );
}

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        if (!isAllowedEmail(email)) return null;
        return { id: email, email, name: email.split("@")[0] };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "google") {
        return profile?.email_verified === true && isAllowedEmail(profile.email);
      }
      return isAllowedEmail(user.email);
    },
  },
  events: {
    // Keep a record of who has used the platform (lazy import: avoids loading Prisma at module init).
    async signIn({ user }) {
      if (!user.email) return;
      const { db } = await import("@/lib/db");
      await db.user.upsert({
        where: { email: user.email.toLowerCase() },
        create: { email: user.email.toLowerCase(), name: user.name, image: user.image, lastLogin: new Date() },
        update: { name: user.name ?? undefined, image: user.image ?? undefined, lastLogin: new Date() },
      });
    },
  },
});
