import { Suspense } from "react";
import { signIn, devLoginEnabled } from "@/auth";
import { buttonClass } from "@/components/ui";

const ERRORS: Record<string, string> = {
  AccessDenied: "That account isn't allowed. Sign in with your @demokrito.com Google account.",
  CredentialsSignin: "That email isn't allowed. Use an @demokrito.com address.",
  Configuration: "Sign-in isn't configured yet. Ask an admin to set the Google OAuth credentials.",
};

async function ErrorNote({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (!error) return null;
  return (
    <p role="alert" className="mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
      {ERRORS[error] ?? "Sign-in failed. Please try again."}
    </p>
  );
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">Influencer Hub</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          Sign in with your Demokrito account to review and shortlist influencers.
        </p>

        <Suspense>
          <ErrorNote searchParams={searchParams as Promise<{ error?: string }>} />
        </Suspense>

        {googleConfigured ? (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <button type="submit" className={buttonClass("primary") + " w-full"}>
              Continue with Google
            </button>
          </form>
        ) : (
          <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            Google sign-in is not configured. Set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code>.
          </p>
        )}

        {devLoginEnabled ? (
          <form
            className="mt-6 border-t border-line pt-5"
            action={async (formData: FormData) => {
              "use server";
              await signIn("dev-login", { email: String(formData.get("email") ?? ""), redirectTo: "/dashboard" });
            }}
          >
            <label htmlFor="email" className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">
              Development login (local only)
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              defaultValue="it@demokrito.com"
              className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
            />
            <button type="submit" className={buttonClass("secondary") + " w-full"}>
              Sign in without Google
            </button>
          </form>
        ) : null}
      </div>
    </main>
  );
}
