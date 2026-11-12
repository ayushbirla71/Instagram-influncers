import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ScoreBadge } from "@/components/badges";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";
import { requireSignedIn } from "@/lib/guard";
import { compact, dateShort, pct, rupees } from "@/lib/format";
import { loadCohort } from "@/lib/queries";
import type { InfluencerStatus } from "@/generated/prisma/enums";

// Live, signed-in, database-backed page: render per request instead of validating for an instant prerendered shell.
export const instant = false;

export const metadata: Metadata = { title: "Shortlist" };

const COLUMNS: { status: InfluencerStatus; title: string }[] = [
  { status: "SHORTLISTED", title: "Shortlisted" },
  { status: "SELECTED", title: "Selected" },
  { status: "ON_HOLD", title: "On hold" },
  { status: "REJECTED", title: "Rejected" },
];

export default async function ShortlistPage() {
  await connection(); // live database content: render per request, never prerender
  await requireSignedIn();
  const [views, assignments] = await Promise.all([
    loadCohort(),
    db.assignment.findMany({ include: { influencer: { select: { handle: true, name: true } } }, orderBy: [{ postingDate: "asc" }, { createdAt: "desc" }] }),
  ]);
  const picked = views.filter((v) => COLUMNS.some((c) => c.status === v.status));

  return (
    <>
      <PageHeader
        title="Shortlist"
        subtitle="Everyone you have marked, grouped by decision, and the work assigned to them."
        actions={
          <a href="/api/export?scope=shortlist" className={buttonClass("secondary")}>
            Export shortlist to Excel
          </a>
        }
      />

      {picked.length === 0 ? (
        <EmptyState
          title="Nobody is shortlisted yet"
          action={
            <Link href="/influencers" className={buttonClass("primary")}>
              Browse influencers
            </Link>
          }
        >
          Select influencers in the list and mark them as Shortlisted, or open a profile and set a decision.
        </EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = picked.filter((v) => v.status === col.status).sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1));
            return (
              <section key={col.status} aria-label={col.title} className="rounded-xl border border-line bg-surface-2 p-3">
                <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                  {col.title}
                  <Badge>{items.length}</Badge>
                </h2>
                <ul className="space-y-2">
                  {items.map((v) => (
                    <li key={v.id} className="rounded-lg border border-line bg-surface p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/influencers/${encodeURIComponent(v.handle)}`} className="font-medium hover:text-accent">
                          {v.name ?? v.handle}
                        </Link>
                        <ScoreBadge score={v.score?.score} confidence={v.score?.confidence} />
                      </div>
                      <div className="text-xs text-muted">@{v.handle}</div>
                      <div className="tabular mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
                        <span>{compact(v.followers)} followers</span>
                        {v.summary ? <span>{pct(v.summary.engagementRate)} eng.</span> : null}
                        {v.budget ? <span>{rupees(v.budget)}</span> : null}
                      </div>
                    </li>
                  ))}
                  {items.length === 0 && <li className="px-1 py-4 text-center text-xs text-muted">None</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <h2 className="mt-10 mb-3 text-lg font-semibold">Assignments</h2>
      {assignments.length === 0 ? (
        <p className="text-sm text-muted">No work assigned yet. Add an assignment from an influencer’s page.</p>
      ) : (
        <Card>
          <div className="-m-4 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Influencer</th>
                  <th className="px-2 py-2.5 font-medium">Concept</th>
                  <th className="px-2 py-2.5 font-medium">Visit / Home</th>
                  <th className="px-2 py-2.5 font-medium">Visit date</th>
                  <th className="px-2 py-2.5 font-medium">Posting date</th>
                  <th className="px-2 py-2.5 font-medium">Status</th>
                  <th className="px-2 py-2.5 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/influencers/${encodeURIComponent(a.influencer.handle)}`} className="font-medium hover:text-accent">
                        {a.influencer.name ?? a.influencer.handle}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">{a.concept ?? "—"}</td>
                    <td className="px-2 py-2.5">{a.visitOrHome ?? "—"}</td>
                    <td className="px-2 py-2.5">{dateShort(a.visitDate)}</td>
                    <td className="px-2 py-2.5">{dateShort(a.postingDate)}</td>
                    <td className="px-2 py-2.5">
                      <Badge tone={a.status === "POSTED" ? "good" : a.status === "CANCELLED" ? "bad" : "info"}>{a.status.toLowerCase()}</Badge>
                    </td>
                    <td className="px-2 py-2.5 text-muted">{a.remarks ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
