import type { Metadata } from "next";
import { connection } from "next/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSignedIn } from "@/lib/guard";
import { ago } from "@/lib/format";

// Live, signed-in, database-backed page: render per request instead of validating for an instant prerendered shell.
export const instant = false;

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await connection(); // live database content: render per request, never prerender
  await requireSignedIn();
  const provider = (process.env.METRICS_PROVIDER ?? "mock").toLowerCase();
  const graphReady = Boolean(process.env.IG_USER_ID && process.env.IG_ACCESS_TOKEN);

  const [imports, users, failures, counts] = await Promise.all([
    db.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.user.findMany({ orderBy: { lastLogin: { sort: "desc", nulls: "last" } }, take: 20 }),
    db.syncRun.findMany({ where: { status: "FAILED" }, orderBy: { createdAt: "desc" }, take: 8, include: { influencer: { select: { handle: true } } } }),
    db.influencer.groupBy({ by: ["eligibility"], _count: true }),
  ]);

  return (
    <>
      <PageHeader title="Settings" subtitle="Instagram connection, import history and team." />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Instagram data source">
          <div className="flex items-center gap-2">
            <Badge tone={provider === "graph" ? "good" : "warn"}>{provider === "graph" ? "Meta Graph API" : "Demo data (simulated)"}</Badge>
          </div>
          {provider === "mock" ? (
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>Numbers on every page are generated, not real. To use real data:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>Use an Instagram Business or Creator account linked to a Facebook Page.</li>
                <li>Create a Meta developer app (Business type) and add the Instagram Graph API.</li>
                <li>
                  Set <code>METRICS_PROVIDER=graph</code>, <code>META_APP_ID</code>, <code>META_APP_SECRET</code>, <code>IG_USER_ID</code> and <code>IG_ACCESS_TOKEN</code>.
                </li>
              </ol>
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted">
              {graphReady ? "Credentials are present." : "Credentials are missing. Set IG_USER_ID and IG_ACCESS_TOKEN."}
            </p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4 text-sm">
            {counts.map((c) => (
              <div key={c.eligibility} className="flex justify-between gap-2">
                <dt className="text-muted">{c.eligibility.replaceAll("_", " ").toLowerCase()}</dt>
                <dd className="tabular font-medium">{c._count}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Recent imports">
          {imports.length === 0 ? (
            <p className="text-sm text-muted">No imports yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {imports.map((i) => (
                <li key={i.id} className="py-2">
                  <div className="font-medium">{i.filename}</div>
                  <div className="text-xs text-muted">
                    {i.created} new · {i.merged} merged · {i.skipped} skipped · {ago(i.createdAt)}
                    {i.createdBy ? ` · ${i.createdBy}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent sync failures">
          {failures.length === 0 ? (
            <p className="text-sm text-muted">No failures.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {failures.map((f) => (
                <li key={f.id} className="py-2">
                  <span className="font-medium">@{f.influencer.handle}</span>
                  <span className="ml-2 text-xs text-muted">{ago(f.createdAt)}</span>
                  <div className="text-xs text-bad">{f.error}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Team">
          <p className="mb-2 text-xs text-muted">Anyone with a company Google account can sign in. These people have.</p>
          <ul className="divide-y divide-line text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex justify-between py-2">
                <span>{u.email}</span>
                <span className="text-xs text-muted">{ago(u.lastLogin)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
