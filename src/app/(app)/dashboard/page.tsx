import type { Metadata } from "next";
import Link from "next/link";
import { ScoreBadge, STATUS_OPTIONS, StatusBadge } from "@/components/badges";
import { EngagementScatter, PostsVsReels, RankedBars, ScoreHistogram } from "@/components/charts";
import { SyncButton } from "@/components/sync-button";
import { buttonClass, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { ago, compact, pct } from "@/lib/format";
import { TIER_LABELS } from "@/lib/metrics/score";
import { applyFilters, filterOptions, loadCohort, parseFilters } from "@/lib/queries";

// Live, signed-in, database-backed page: render per request instead of validating for an instant prerendered shell.
export const instant = false;

export const metadata: Metadata = { title: "Dashboard" };

const inputCls = "w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const raw = await searchParams;
  const filters = parseFilters(raw);
  const everyone = await loadCohort();
  const options = filterOptions(everyone);
  const views = applyFilters(everyone, { ...filters, sort: "score", dir: "desc" });

  if (everyone.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <EmptyState
          title="Import your influencer lists to get started"
          action={
            <Link href="/import" className={buttonClass("primary")}>
              Import an Excel file
            </Link>
          }
        >
          Upload the Excel files, fetch their Instagram data, and this page shows who is posting, how often, and how well it performs.
        </EmptyState>
      </>
    );
  }

  const synced = views.filter((v) => v.summary !== null);
  const total = views.length;
  const fetched = views.filter((v) => v.eligibility !== "UNKNOWN").length;
  const readable = synced.length;
  const personal = views.filter((v) => v.eligibility === "NOT_PROFESSIONAL").length;
  const notFound = views.filter((v) => v.eligibility === "NOT_FOUND").length;
  const errored = views.filter((v) => v.eligibility === "ERROR").length;

  const totalPosts = synced.reduce((a, v) => a + v.summary!.posts, 0);
  const totalReels = synced.reduce((a, v) => a + v.summary!.reels, 0);
  const ers = synced.map((v) => v.summary!.engagementRate).filter((x): x is number => x !== null);
  const avgEr = ers.length ? ers.reduce((a, b) => a + b, 0) / ers.length : null;
  const connected = synced.filter((v) => v.summary!.hasReach);
  const totalReach = connected.reduce((a, v) => a + (v.summary!.totalReach ?? 0), 0);
  const inactive = synced.filter((v) => v.summary!.posts === 0).length;
  const lastSync = views.reduce<Date | null>((a, v) => (v.lastSyncedAt && (!a || v.lastSyncedAt > a) ? v.lastSyncedAt : a), null);

  const top = synced
    .filter((v) => v.score?.score !== null && v.score !== null)
    .slice(0, 10);

  const chartRows = synced.filter((v) => v.score?.score != null).slice(0, 12).map((v) => ({
    label: v.name ?? `@${v.handle}`,
    reels: v.summary!.reels,
    other: v.summary!.posts - v.summary!.reels,
  }));

  const scatter = synced
    .filter((v) => v.summary!.engagementRate !== null && v.followers)
    .map((v) => ({
      handle: v.handle,
      followers: v.followers as number,
      er: +((v.summary!.engagementRate as number) * 100).toFixed(2),
      score: v.score?.score ?? null,
    }));

  const bins = Array.from({ length: 10 }, (_, i) => ({ range: `${i * 10}-${i === 9 ? 100 : i * 10 + 9}`, count: 0 }));
  for (const v of synced) {
    const s = v.score?.score;
    if (s !== null && s !== undefined) bins[Math.min(9, Math.floor(s / 10))].count++;
  }

  const byLocation = new Map<string, number>();
  for (const v of views) for (const l of v.locations) byLocation.set(l, (byLocation.get(l) ?? 0) + 1);
  const locationData = [...byLocation].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`Activity and engagement over the last 30 days. Last refreshed ${ago(lastSync)}.`}
        actions={<SyncButton />}
      />

      <form method="get" className="mb-6 grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
        <FilterSelect label="Location" name="location" value={filters.location} options={options.locations.map((l) => ({ value: l, label: l }))} />
        <FilterSelect label="Niche" name="niche" value={filters.niche} options={options.niches.map((l) => ({ value: l, label: l }))} />
        <FilterSelect label="Status" name="status" value={filters.status} options={STATUS_OPTIONS} />
        <FilterSelect label="Audience size" name="tier" value={filters.tier} options={Object.entries(TIER_LABELS).filter(([k]) => k !== "unknown").map(([value, label]) => ({ value, label }))} />
        <div className="flex items-end gap-2">
          <button type="submit" className={buttonClass("primary")}>
            Apply
          </button>
          <Link href="/dashboard" className={buttonClass("ghost")}>
            Reset
          </Link>
        </div>
      </form>

      {/* Coverage first: the Graph API cannot read personal accounts, and the team must know how much of the list is measurable. */}
      <Card title="Data coverage" className="mb-6">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <span className="tabular text-3xl font-semibold">{total === 0 ? "—" : Math.round((readable / total) * 100)}%</span>
            <span className="ml-2 text-sm text-muted">
              of {total} influencers have readable Instagram data
            </span>
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <li>{readable} readable</li>
            <li>{personal} not readable</li>
            <li>{notFound} handles not found</li>
            {errored > 0 && <li>{errored} errors</li>}
            <li>{total - fetched} not fetched yet</li>
          </ul>
        </div>
        {personal > 0 && (
          <p className="mt-3 text-sm text-muted">
            Instagram only shares data for <strong className="text-text">Business or Creator</strong> accounts. “Not readable” profiles are either personal accounts (switchable in Instagram under Settings, Account type) or have a wrong handle.
          </p>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Posts + reels" value={compact(totalPosts)} hint={`${compact(totalReels)} reels · last 30 days`} />
        <StatTile label="Avg engagement rate" value={pct(avgEr)} hint="likes + comments ÷ followers" />
        <StatTile
          label="Total reach"
          value={connected.length ? compact(totalReach) : "—"}
          hint={connected.length ? `from ${connected.length} connected profiles` : "Only for connected accounts"}
        />
        <StatTile label="Inactive" value={inactive} hint="no posts in 30 days" />
        <StatTile label="Shortlisted" value={views.filter((v) => v.status === "SHORTLISTED" || v.status === "SELECTED").length} hint="shortlisted + selected" />
      </div>

      {synced.length === 0 ? (
        <EmptyState title="No Instagram data yet">
          Press <strong>Fetch Instagram data</strong> above to load posts and engagement for your influencers.
        </EmptyState>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Card
            title="Top influencers by popularity score"
            className="xl:col-span-2"
            action={
              <Link href="/influencers" className="text-xs font-medium text-accent hover:underline">
                See all
              </Link>
            }
          >
            <div className="-m-4 overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">#</th>
                    <th className="px-2 py-2.5 font-medium">Influencer</th>
                    <th className="px-2 py-2.5 text-right font-medium">Followers</th>
                    <th className="px-2 py-2.5 text-right font-medium">Posts</th>
                    <th className="px-2 py-2.5 text-right font-medium">Reels</th>
                    <th className="px-2 py-2.5 text-right font-medium">Eng. rate</th>
                    <th className="px-2 py-2.5 font-medium">Score</th>
                    <th className="px-2 py-2.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((v, i) => (
                    <tr key={v.id} className="border-b border-line last:border-0 hover:bg-surface-2">
                      <td className="tabular px-4 py-2.5 text-muted">{i + 1}</td>
                      <td className="px-2 py-2.5">
                        <Link href={`/influencers/${encodeURIComponent(v.handle)}`} className="font-medium hover:text-accent">
                          {v.name ?? v.handle}
                        </Link>
                        <div className="text-xs text-muted">@{v.handle}</div>
                      </td>
                      <td className="tabular px-2 py-2.5 text-right">{compact(v.followers)}</td>
                      <td className="tabular px-2 py-2.5 text-right">{v.summary!.posts}</td>
                      <td className="tabular px-2 py-2.5 text-right">{v.summary!.reels}</td>
                      <td className="tabular px-2 py-2.5 text-right">{pct(v.summary!.engagementRate)}</td>
                      <td className="px-2 py-2.5">
                        <ScoreBadge score={v.score?.score} confidence={v.score?.confidence} />
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusBadge status={v.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Reels and posts, top 12 by score (last 30 days)">
            <PostsVsReels data={chartRows} />
          </Card>
          <Card title="Engagement rate vs followers">
            <EngagementScatter data={scatter} />
          </Card>
          <Card title="Popularity score distribution">
            <ScoreHistogram data={bins} />
          </Card>
          <Card title="Influencers by location (top 10)">
            <RankedBars data={locationData} />
          </Card>
        </div>
      )}
    </>
  );
}

function FilterSelect({ label, name, value, options }: { label: string; name: string; value?: string; options: { value: string; label: string }[] }) {
  return (
    <label className="block text-xs font-medium text-muted">
      {label}
      <select name={name} defaultValue={value ?? ""} className={inputCls + " mt-1 text-text"}>
        <option value="">All</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
