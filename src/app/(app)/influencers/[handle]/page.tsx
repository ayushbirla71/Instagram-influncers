import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addAssignment, createConnectInvite, deleteAssignment, saveDetails, updateAssignmentStatus } from "@/app/actions";
import { EligibilityBadge, ScoreBadge, STATUS_OPTIONS, StatusBadge } from "@/components/badges";
import { FollowerTrend, PostsTimeline } from "@/components/charts";
import { SyncButton } from "@/components/sync-button";
import { Badge, buttonClass, Card, PageHeader, StatTile } from "@/components/ui";
import { ago, compact, dateShort, num1, pct, rupees } from "@/lib/format";
import { inviteUrl, metaConfigured } from "@/lib/instagram/oauth";
import { TIER_LABELS } from "@/lib/metrics/score";
import { engagementRate, interactions, summarize, type MediaRow } from "@/lib/metrics/summary";
import { loadCohort, loadInfluencerDetail } from "@/lib/queries";

// Live, signed-in, database-backed page: render per request instead of validating for an instant prerendered shell.
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/influencers/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  return { title: `@${decodeURIComponent(handle)}` };
}

const inputCls = "w-full rounded-lg border border-line bg-bg px-2.5 py-1.5 text-sm";

export default async function InfluencerPage({ params }: PageProps<"/influencers/[handle]">) {
  const handle = decodeURIComponent((await params).handle).toLowerCase();
  const inf = await loadInfluencerDetail(handle);
  if (!inf) notFound();

  // Score is relative to the whole cohort, so take it from the shared loader.
  const view = (await loadCohort()).find((v) => v.id === inf.id);
  const followers = inf.followersCount ?? inf.followersDeclared;
  const synced = inf.eligibility === "OK" && inf.lastSyncedAt !== null;
  const media = inf.media as MediaRow[];
  const s = synced ? summarize(media, followers) : null;

  const timeline = [...media]
    .filter((m) => m.type !== "STORY")
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((m) => {
      const i = interactions(m);
      return {
        date: m.timestamp.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        reel: m.type === "REEL" ? i : null,
        other: m.type !== "REEL" ? i : null,
      };
    });

  const trendByDay = new Map<string, number>();
  for (const sn of inf.snapshots) {
    if (sn.followersCount !== null) trendByDay.set(sn.syncedAt.toISOString().slice(0, 10), sn.followersCount);
  }
  const trend = [...trendByDay].map(([d, f]) => ({
    date: new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    followers: f,
  }));

  return (
    <>
      <PageHeader
        title={inf.name ?? `@${inf.handle}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a href={`https://www.instagram.com/${inf.handle}/`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              @{inf.handle}
            </a>
            <span>{inf.locations.join(", ") || "No location"}</span>
            {inf.niche ? <span>{inf.niche}</span> : null}
            <span>{TIER_LABELS[view?.tier ?? "unknown"]}</span>
          </span>
        }
        actions={<SyncButton ids={[inf.id]} label="Refresh data" variant="secondary" />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={inf.status} />
        <EligibilityBadge eligibility={inf.eligibility} note={inf.eligibilityNote} />
        <ScoreBadge score={view?.score?.score} confidence={view?.score?.confidence} />
        <span className="text-xs text-muted">Last fetched {ago(inf.lastSyncedAt)}</span>
        <Link href="/influencers" className="ml-auto text-sm text-muted hover:text-text">
          ← All influencers
        </Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {!synced ? (
            <Card>
              <h2 className="font-semibold">
                {inf.eligibility === "UNKNOWN" ? "Instagram data hasn't been fetched yet" : "Instagram data isn't available for this profile"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {inf.eligibility === "UNKNOWN" && "Press “Refresh data” to load the last 30 days of posts and engagement."}
                {inf.eligibility === "NOT_PROFESSIONAL" && "Instagram would not share this profile. Either it is a personal account (only Business or Creator accounts can be read; the influencer can switch in Settings, Account type and tools), or the handle in your spreadsheet is wrong. Check the link, then refresh."}
                {inf.eligibility === "NOT_FOUND" && "No account exists with this handle. It may be misspelled or renamed; check the link in your spreadsheet."}
                {inf.eligibility === "ERROR" && `A temporary error stopped the fetch${inf.eligibilityNote ? `: ${inf.eligibilityNote}` : ""}. Try refreshing again.`}
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatTile label="Followers" value={compact(followers)} hint={inf.followersDeclared ? `${compact(inf.followersDeclared)} in spreadsheet` : undefined} />
                <StatTile label="Posts + reels" value={s!.posts} hint={`${s!.reels} reels · ${num1(s!.postsPerWeek)}/week`} />
                <StatTile label="Eng. rate" value={pct(s!.engagementRate)} hint={`${compact(s!.avgInteractions)} avg interactions/post`} />
                <StatTile label="Reel eng. rate" value={pct(s!.reelEngagementRate)} hint={s!.reels ? `${compact(s!.reelAvgInteractions)} avg per reel · ${s!.reelRateBasis === "reach" ? "÷ reach" : "÷ followers"}` : "no reels"} />
                <StatTile
                  label="Avg reach"
                  value={s!.hasReach ? compact(s!.avgReach) : "—"}
                  hint={s!.hasReach ? `${compact(s!.totalReach)} total · ${pct(s!.reachRate)} of followers` : "Not connected. Real reach needs the influencer's permission."}
                />
                <StatTile label="Total views" value={s!.totalViews !== null ? compact(s!.totalViews) : "—"} hint={s!.totalViews !== null ? undefined : "Not connected"} />
                <StatTile label="Last post" value={s!.daysSinceLastPost === null ? "—" : s!.daysSinceLastPost === 0 ? "Today" : `${s!.daysSinceLastPost}d ago`} hint={`${s!.activeWeeks} of 4 weeks active`} />
                <StatTile label="Score" value={view?.score?.score ?? "—"} hint={view?.score?.confidence === "low" ? "Low confidence (<3 posts)" : view?.score ? `${view.score.confidence} confidence` : undefined} />
              </div>

              <Card title="Interactions per post, last 30 days">
                <PostsTimeline data={timeline} />
              </Card>

              <Card title={`Posts and reels (${s!.posts})`}>
                {media.filter((m) => m.type !== "STORY").length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">No posts or reels in the last 30 days.</p>
                ) : (
                  <div className="-m-4 overflow-x-auto">
                    <table className="w-full min-w-[44rem] text-left text-sm">
                      <thead className="border-b border-line text-xs text-muted">
                        <tr>
                          <th className="px-4 py-2.5 font-medium">Date</th>
                          <th className="px-2 py-2.5 font-medium">Type</th>
                          <th className="px-2 py-2.5 text-right font-medium">Likes</th>
                          <th className="px-2 py-2.5 text-right font-medium">Comments</th>
                          <th className="px-2 py-2.5 text-right font-medium">Saves</th>
                          <th className="px-2 py-2.5 text-right font-medium">Shares</th>
                          <th className="px-2 py-2.5 text-right font-medium">Views</th>
                          <th className="px-2 py-2.5 text-right font-medium">Reach</th>
                          <th className="px-2 py-2.5 text-right font-medium" title="Interactions ÷ reach when reach is known, otherwise ÷ followers">Eng. rate</th>
                          <th className="px-2 py-2.5 font-medium"><span className="sr-only">Open</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {inf.media
                          .filter((m) => m.type !== "STORY")
                          .map((m) => (
                            <tr key={m.id} className="border-b border-line last:border-0">
                              <td className="px-4 py-2.5 whitespace-nowrap">{dateShort(m.timestamp)}</td>
                              <td className="px-2 py-2.5">
                                <Badge tone={m.type === "REEL" ? "accent" : "neutral"}>{m.type === "REEL" ? "Reel" : m.type === "CAROUSEL" ? "Carousel" : m.type === "IMAGE" ? "Photo" : "Post"}</Badge>
                              </td>
                              <td className="tabular px-2 py-2.5 text-right">{m.likeCount === null ? <span className="text-xs text-muted" title="The creator hides like counts">hidden</span> : compact(m.likeCount)}</td>
                              <td className="tabular px-2 py-2.5 text-right">{compact(m.commentsCount)}</td>
                              <td className="tabular px-2 py-2.5 text-right">{compact(m.saved)}</td>
                              <td className="tabular px-2 py-2.5 text-right">{compact(m.shares)}</td>
                              <td className="tabular px-2 py-2.5 text-right">{compact(m.views)}</td>
                              <td className="tabular px-2 py-2.5 text-right">{compact(m.reach)}</td>
                              <td className="tabular px-2 py-2.5 text-right">{pct(engagementRate(m as MediaRow, followers))}</td>
                              <td className="px-2 py-2.5">
                                {m.permalink ? (
                                  <a href={m.permalink} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
                                    Open
                                  </a>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!s!.hasReach && (
                  <p className="mt-6 text-xs text-muted">
                    Reach, views, saves and shares are private to the account owner, so they show “—” until this influencer connects their account.
                  </p>
                )}
              </Card>

              <Card title="Follower trend">
                <FollowerTrend data={trend} />
              </Card>
            </>
          )}
        </div>

        <aside className="space-y-6">
          <Card title="Decision">
            <form action={saveDetails} className="space-y-3">
              <input type="hidden" name="id" value={inf.id} />
              <input type="hidden" name="handle" value={inf.handle} />
              <label className="block text-xs font-medium text-muted">
                Status
                <select name="status" defaultValue={inf.status} className={inputCls + " mt-1 text-text"}>
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-muted">
                Budget / rate (₹){inf.budget ? <span className="ml-1 font-normal">· now {rupees(inf.budget)}</span> : null}
                <input name="budget" type="number" min={0} step={500} defaultValue={inf.budget ?? ""} className={inputCls + " mt-1 text-text"} />
              </label>
              <label className="block text-xs font-medium text-muted">
                Notes
                <textarea name="notes" rows={4} maxLength={2000} defaultValue={inf.notes ?? ""} className={inputCls + " mt-1 text-text"} />
              </label>
              {inf.outreachStatus ? <p className="text-xs text-muted">Outreach in spreadsheet: {inf.outreachStatus}</p> : null}
              <button type="submit" className={buttonClass("primary") + " w-full"}>
                Save
              </button>
            </form>
          </Card>

          <Card title="Real reach and insights">
            {inf.connection?.connectedAt ? (
              <p className="text-sm text-muted">
                <Badge tone="good">Connected</Badge> on {dateShort(inf.connection.connectedAt)}. Reach, views, saves and shares are included for this influencer.
              </p>
            ) : inf.connection ? (
              <div className="space-y-2 text-sm">
                <p className="text-muted">Send this link to the influencer. They sign in with Instagram and share read-only insights.</p>
                <input readOnly value={inviteUrl(inf.connection.inviteToken)} aria-label="Connect link" className={inputCls} />
                {!metaConfigured() && <p className="text-xs text-warn">The Meta app is not configured yet, so this link will not work until META_APP_ID and META_APP_SECRET are set.</p>}
              </div>
            ) : (
              <form action={createConnectInvite.bind(null, inf.id, inf.handle)} className="space-y-2">
                <p className="text-sm text-muted">Only the influencer can share their real reach. Create a link for them to connect their account.</p>
                <button type="submit" className={buttonClass("secondary") + " w-full"}>Create connect link</button>
              </form>
            )}
          </Card>

          <Card title={`Work assigned (${inf.assignments.length})`}>
            <ul className="space-y-3">
              {inf.assignments.map((a) => (
                <li key={a.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium">{a.concept ?? "No concept yet"}</div>
                    <Badge tone={a.status === "POSTED" ? "good" : a.status === "CANCELLED" ? "bad" : "info"}>{a.status.toLowerCase()}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {a.visitOrHome ?? "—"} · visit {dateShort(a.visitDate)} · post {dateShort(a.postingDate)}
                  </div>
                  {a.remarks ? <p className="mt-1 text-xs text-muted">{a.remarks}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(["CONFIRMED", "VISITED", "POSTED", "CANCELLED"] as const)
                      .filter((st) => st !== a.status)
                      .map((st) => (
                        <form key={st} action={updateAssignmentStatus.bind(null, a.id, inf.handle, st)}>
                          <button className={buttonClass("secondary", "sm")}>Mark {st.toLowerCase()}</button>
                        </form>
                      ))}
                    <form action={deleteAssignment.bind(null, a.id, inf.handle)}>
                      <button className={buttonClass("ghost", "sm")}>Remove</button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>

            <form action={addAssignment} className="mt-4 space-y-3 border-t border-line pt-4">
              <input type="hidden" name="influencerId" value={inf.id} />
              <input type="hidden" name="handle" value={inf.handle} />
              <label className="block text-xs font-medium text-muted">
                Concept
                <input name="concept" maxLength={500} placeholder="e.g. Saree shoot reel" className={inputCls + " mt-1 text-text"} />
              </label>
              <div className="grid grid-cols-3 gap-2">
                <label className="block text-xs font-medium text-muted">
                  Type
                  <select name="visitOrHome" className={inputCls + " mt-1 text-text"} defaultValue="">
                    <option value="">—</option>
                    <option value="Visit">Visit</option>
                    <option value="Home">Home</option>
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Visit date
                  <input name="visitDate" type="date" className={inputCls + " mt-1 text-text"} />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Post date
                  <input name="postingDate" type="date" className={inputCls + " mt-1 text-text"} />
                </label>
              </div>
              <label className="block text-xs font-medium text-muted">
                Remarks
                <input name="remarks" maxLength={1000} className={inputCls + " mt-1 text-text"} />
              </label>
              <button type="submit" className={buttonClass("secondary") + " w-full"}>
                Add assignment
              </button>
            </form>
          </Card>
        </aside>
      </div>
    </>
  );
}
