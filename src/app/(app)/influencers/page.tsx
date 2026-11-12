import type { Metadata } from "next";
import Link from "next/link";
import { bulkSetStatus } from "@/app/actions";
import { EligibilityBadge, ELIGIBILITY_OPTIONS, ScoreBadge, STATUS_OPTIONS, StatusBadge } from "@/components/badges";
import { SelectAll } from "@/components/select-all";
import { SyncButton } from "@/components/sync-button";
import { buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { compact, pct } from "@/lib/format";
import { TIER_LABELS } from "@/lib/metrics/score";
import { applyFilters, filterOptions, loadCohort, parseFilters, type SortKey } from "@/lib/queries";

// Live, signed-in, database-backed page: render per request instead of validating for an instant prerendered shell.
export const instant = false;

export const metadata: Metadata = { title: "Influencers" };

const SORT_LABELS: Record<SortKey, string> = {
  score: "Popularity score",
  followers: "Followers",
  posts: "Posts (30 days)",
  reels: "Reels (30 days)",
  er: "Engagement rate",
  reach: "Avg reach",
  name: "Name",
};

export default async function InfluencersPage({ searchParams }: PageProps<"/influencers">) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const all = await loadCohort();
  const rows = applyFilters(all, filters);
  const options = filterOptions(all);
  const shown = rows.slice(0, 1000);

  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) exportQuery.set(k, val);
  }

  const notFetched = all.filter((v) => v.eligibility === "UNKNOWN").length;

  return (
    <>
      <PageHeader
        title="Influencers"
        subtitle="Last-30-days activity and engagement for every profile. Sort by popularity score, filter by place or size, then shortlist the ones you want to work with."
        actions={<SyncButton />}
      />

      {all.length === 0 ? (
        <EmptyState
          title="No influencers yet"
          action={
            <Link href="/import" className={buttonClass("primary")}>
              Import an Excel file
            </Link>
          }
        >
          Upload your influencer list to get started.
        </EmptyState>
      ) : (
        <>
          {notFetched > 0 && (
            <p role="status" className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-sm text-info">
              {notFetched} influencers have no Instagram data yet. Press <strong>Fetch Instagram data</strong> to load their posts and engagement.
            </p>
          )}

          <form method="get" className="mb-4 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search">
              <input name="q" defaultValue={raw.q as string | undefined} placeholder="Name or @handle" className={inputCls} />
            </Field>
            <Field label="Location">
              <Select name="location" value={filters.location} options={options.locations.map((l) => ({ value: l, label: l }))} />
            </Field>
            <Field label="Niche">
              <Select name="niche" value={filters.niche} options={options.niches.map((l) => ({ value: l, label: l }))} />
            </Field>
            <Field label="Status">
              <Select name="status" value={filters.status} options={STATUS_OPTIONS} />
            </Field>
            <Field label="Data availability">
              <Select name="eligibility" value={filters.eligibility} options={ELIGIBILITY_OPTIONS} />
            </Field>
            <Field label="Audience size">
              <Select name="tier" value={filters.tier} options={Object.entries(TIER_LABELS).filter(([k]) => k !== "unknown").map(([value, label]) => ({ value, label }))} />
            </Field>
            <Field label="Followers (min – max)">
              <div className="flex gap-2">
                <input name="minFollowers" type="number" min={0} defaultValue={filters.minFollowers} placeholder="Min" className={inputCls} />
                <input name="maxFollowers" type="number" min={0} defaultValue={filters.maxFollowers} placeholder="Max" className={inputCls} />
              </div>
            </Field>
            <Field label="Sort by">
              <div className="flex gap-2">
                <select name="sort" defaultValue={filters.sort} className={inputCls}>
                  {Object.entries(SORT_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                <select name="dir" defaultValue={filters.dir} className={inputCls + " max-w-28"} aria-label="Direction">
                  <option value="desc">High → low</option>
                  <option value="asc">Low → high</option>
                </select>
              </div>
            </Field>
            <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
              <button type="submit" className={buttonClass("primary")}>
                Apply filters
              </button>
              <Link href="/influencers" className={buttonClass("ghost")}>
                Reset
              </Link>
              <span className="ml-auto text-sm text-muted">
                {rows.length} of {all.length} shown
              </span>
              <a href={`/api/export?${exportQuery.toString()}`} className={buttonClass("secondary")}>
                Export to Excel
              </a>
            </div>
          </form>

          {rows.length === 0 ? (
            <EmptyState title="No influencers match these filters">
              Try widening the follower range or clearing a filter.
            </EmptyState>
          ) : (
            <form>
              <Card>
                <div className="-m-4 overflow-x-auto">
                  <table className="w-full min-w-[56rem] text-left text-sm">
                    <thead className="border-b border-line text-xs text-muted">
                      <tr>
                        <th className="w-10 px-4 py-2.5">
                          <SelectAll />
                        </th>
                        <th className="px-2 py-2.5 font-medium">Influencer</th>
                        <th className="px-2 py-2.5 font-medium">Location</th>
                        <th className="px-2 py-2.5 text-right font-medium">Followers</th>
                        <th className="px-2 py-2.5 text-right font-medium">Posts</th>
                        <th className="px-2 py-2.5 text-right font-medium">Reels</th>
                        <th className="px-2 py-2.5 text-right font-medium">Eng. rate</th>
                        <th className="px-2 py-2.5 text-right font-medium">Avg reach</th>
                        <th className="px-2 py-2.5 font-medium">Score</th>
                        <th className="px-2 py-2.5 font-medium">Status</th>
                        <th className="px-2 py-2.5 font-medium">Data</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((v) => (
                        <tr key={v.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                          <td className="px-4 py-2.5">
                            <input type="checkbox" name="ids" value={v.id} aria-label={`Select ${v.handle}`} />
                          </td>
                          <td className="px-2 py-2.5">
                            <Link href={`/influencers/${encodeURIComponent(v.handle)}`} className="font-medium hover:text-accent">
                              {v.name ?? v.handle}
                            </Link>
                            <div className="text-xs text-muted">@{v.handle}</div>
                          </td>
                          <td className="px-2 py-2.5 text-muted">{v.locations.join(", ") || "—"}</td>
                          <td className="tabular px-2 py-2.5 text-right">{compact(v.followers)}</td>
                          <td className="tabular px-2 py-2.5 text-right">{v.summary ? v.summary.posts : "—"}</td>
                          <td className="tabular px-2 py-2.5 text-right">{v.summary ? v.summary.reels : "—"}</td>
                          <td className="tabular px-2 py-2.5 text-right">{pct(v.summary?.engagementRate)}</td>
                          <td className="tabular px-2 py-2.5 text-right">
                            {v.summary ? (v.summary.hasReach ? compact(v.summary.avgReach) : <span className="text-xs text-muted">Not connected</span>) : "—"}
                          </td>
                          <td className="px-2 py-2.5">
                            <ScoreBadge score={v.score?.score} confidence={v.score?.confidence} />
                          </td>
                          <td className="px-2 py-2.5">
                            <StatusBadge status={v.status} />
                          </td>
                          <td className="px-2 py-2.5">
                            <EligibilityBadge eligibility={v.eligibility} note={v.eligibilityNote} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="sticky bottom-3 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3 shadow-sm">
                <span className="text-sm text-muted">With selected:</span>
                <select name="status" aria-label="New status" className={inputCls + " max-w-44"} defaultValue="SHORTLISTED">
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      Mark as {s.label}
                    </option>
                  ))}
                </select>
                <button type="submit" formAction={bulkSetStatus} className={buttonClass("primary")}>
                  Apply
                </button>
                {rows.length > shown.length && <span className="ml-auto text-xs text-muted">Showing the first {shown.length}. Narrow the filters to see the rest.</span>}
              </div>
            </form>
          )}
        </>
      )}
    </>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <div className="mt-1 text-text">{children}</div>
    </label>
  );
}

function Select({ name, value, options }: { name: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={inputCls}>
      <option value="">All</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
