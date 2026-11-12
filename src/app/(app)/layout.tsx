import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth, signOut, isAllowedEmail } from "@/auth";
import { Nav } from "@/components/nav";
import { PageSkeleton } from "@/components/ui";

// Every page in this group is personalised and database-backed, so it renders on request.
export const instant = false;

async function AuthGate({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email)) redirect("/login");
  return <>{children}</>;
}

async function UserMenu() {
  const session = await auth();
  return (
    <div className="border-t border-line pt-3">
      <div className="truncate px-3 text-xs text-muted" title={session?.user?.email ?? ""}>
        {session?.user?.email}
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button type="submit" className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-text">
          Sign out
        </button>
      </form>
    </div>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const demo = (process.env.METRICS_PROVIDER ?? "mock") === "mock";
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-line bg-surface p-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0 md:p-4">
        <div className="mb-3 px-3 text-base font-semibold tracking-tight md:mb-6">Influencer Hub</div>
        <div className="flex flex-col gap-3 md:h-[calc(100%-3rem)] md:justify-between">
          <Nav />
          <Suspense fallback={<div className="h-12" />}>
            <UserMenu />
          </Suspense>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">
        {demo ? (
          <div role="status" className="mb-5 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            <strong>Demo data.</strong> Instagram metrics are simulated. Connect the Graph API in Settings to see real numbers.
          </div>
        ) : null}
        <Suspense fallback={<PageSkeleton />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </main>
    </div>
  );
}
