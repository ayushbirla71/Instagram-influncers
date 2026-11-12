import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { db } from "@/lib/db";
import { metaConfigured } from "@/lib/instagram/oauth";

export const metadata: Metadata = { title: "Connect your Instagram", robots: { index: false } };

type Params = Promise<{ token: string }>;
type Search = Promise<{ status?: string; message?: string }>;

async function Content({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { token } = await params;
  const { status, message } = await searchParams;
  const conn = await db.igConnection.findUnique({
    where: { inviteToken: token },
    include: { influencer: { select: { handle: true, name: true } } },
  });

  if (!conn) {
    return (
      <Shell title="This link isn't valid">
        <p className="text-sm text-muted">It may have been replaced. Please ask the Demokrito team for a new link.</p>
      </Shell>
    );
  }
  const who = conn.influencer.name ?? `@${conn.influencer.handle}`;

  if (status === "ok" || conn.connectedAt) {
    return (
      <Shell title="You're connected">
        <p className="text-sm text-muted">
          Thank you, {who}. Demokrito can now see the reach and engagement of your posts. You can remove access any time in Instagram under
          Settings, then Apps and websites.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={`Connect @${conn.influencer.handle}`}>
      {status === "failed" ? (
        <p role="alert" className="mb-4 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {message ?? "Something went wrong. Please try again."}
        </p>
      ) : null}
      <p className="text-sm text-muted">
        Demokrito would like to see how your posts and reels perform, so we can plan paid collaborations fairly.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
        <li>
          We can read your <strong className="text-text">reach, views, saves, shares and likes</strong>.
        </li>
        <li>
          We <strong className="text-text">cannot post, message or change anything</strong> on your account.
        </li>
        <li>You can remove access at any time in Instagram.</li>
      </ul>
      <p className="mt-3 text-xs text-muted">Your account must be a Business or Creator account linked to a Facebook Page.</p>
      {metaConfigured() ? (
        <a
          href={`/api/ig/connect?token=${encodeURIComponent(token)}`}
          className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Continue with Instagram
        </a>
      ) : (
        <p className="mt-5 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Connecting isn&apos;t available yet. Please try again later.</p>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
        <p className="mb-1 text-xs font-medium tracking-wide text-muted uppercase">Demokrito</p>
        <h1 className="mb-3 text-xl font-semibold tracking-tight">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export default function ConnectPage({ params, searchParams }: PageProps<"/connect/[token]">) {
  return (
    <Suspense
      fallback={
        <Shell title="Loading…">
          <p className="text-sm text-muted">One moment.</p>
        </Shell>
      }
    >
      <Content params={params} searchParams={searchParams as Search} />
    </Suspense>
  );
}
