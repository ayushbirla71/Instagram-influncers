import { db } from "@/lib/db";
import { requireSignedIn } from "@/lib/guard";
import { nicheTags } from "@/lib/niche";
import type { Eligibility, InfluencerStatus } from "@/generated/prisma/enums";
import { computeScores, tierOf, type ScoreResult, type Tier } from "@/lib/metrics/score";
import { summarize, WINDOW_DAYS, type MediaRow, type Summary } from "@/lib/metrics/summary";

export interface InfluencerView {
  id: string;
  handle: string;
  name: string | null;
  niche: string | null;
  /** clean filterable tags derived from the free-text niche */
  niches: string[];
  locations: string[];
  /** latest API follower count, else the number from the spreadsheet */
  followers: number | null;
  followersDeclared: number | null;
  budget: number | null;
  status: InfluencerStatus;
  eligibility: Eligibility;
  eligibilityNote: string | null;
  lastSyncedAt: Date | null;
  notes: string | null;
  outreachStatus: string | null;
  sources: string[];
  tier: Tier;
  /** null until the profile has been successfully synced */
  summary: Summary | null;
  score: ScoreResult | null;
}

const DAY = 86_400_000;

/** Every influencer with their last-30-day metrics and a popularity score relative to the cohort. */
export async function loadCohort(nowOverride?: Date): Promise<InfluencerView[]> {
  await requireSignedIn();
  // Read the clock only after the (request-bound) sign-in check, so it is never prerendered.
  const now = nowOverride ?? new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const rows = await db.influencer.findMany({
    include: { media: { where: { timestamp: { gte: since } } } },
    orderBy: { createdAt: "asc" },
  });

  const views: InfluencerView[] = rows.map((r) => {
    const followers = r.followersCount ?? r.followersDeclared;
    const synced = r.eligibility === "OK" && r.lastSyncedAt !== null;
    const summary = synced ? summarize(r.media as MediaRow[], followers, now) : null;
    return {
      id: r.id,
      handle: r.handle,
      name: r.name,
      niche: r.niche,
      niches: nicheTags(r.niche),
      locations: r.locations,
      followers,
      followersDeclared: r.followersDeclared,
      budget: r.budget,
      status: r.status,
      eligibility: r.eligibility,
      eligibilityNote: r.eligibilityNote,
      lastSyncedAt: r.lastSyncedAt,
      notes: r.notes,
      outreachStatus: r.outreachStatus,
      sources: r.sources,
      tier: tierOf(followers),
      summary,
      score: null,
    };
  });

  const scorable = views.filter((v) => v.summary !== null);
  const scores = computeScores(scorable.map((v) => ({ id: v.id, followers: v.followers, summary: v.summary! })));
  for (const v of views) v.score = scores.get(v.id) ?? null;
  return views;
}

export type SortKey = "score" | "followers" | "posts" | "reels" | "er" | "reach" | "name";

export interface Filters {
  q?: string;
  location?: string;
  niche?: string;
  status?: InfluencerStatus;
  eligibility?: Eligibility;
  tier?: Tier;
  minFollowers?: number;
  maxFollowers?: number;
  sort: SortKey;
  dir: "asc" | "desc";
}

const STATUSES = ["NEW", "SHORTLISTED", "SELECTED", "REJECTED", "ON_HOLD"];
const ELIGIBILITIES = ["UNKNOWN", "OK", "NOT_PROFESSIONAL", "NOT_FOUND", "ERROR"];
const TIERS = ["nano", "micro", "mid", "macro", "unknown"];
const SORTS: SortKey[] = ["score", "followers", "posts", "reels", "er", "reach", "name"];

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
const num = (v: string | undefined) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Parses (untrusted) URL params into validated filters. Unknown values are ignored. */
export function parseFilters(raw: Raw): Filters {
  const status = one(raw.status);
  const elig = one(raw.eligibility);
  const tier = one(raw.tier);
  const sort = one(raw.sort) as SortKey | undefined;
  return {
    q: one(raw.q)?.trim().toLowerCase() || undefined,
    location: one(raw.location),
    niche: one(raw.niche),
    status: status && STATUSES.includes(status) ? (status as InfluencerStatus) : undefined,
    eligibility: elig && ELIGIBILITIES.includes(elig) ? (elig as Eligibility) : undefined,
    tier: tier && TIERS.includes(tier) ? (tier as Tier) : undefined,
    minFollowers: num(one(raw.minFollowers)),
    maxFollowers: num(one(raw.maxFollowers)),
    sort: sort && SORTS.includes(sort) ? sort : "score",
    dir: one(raw.dir) === "asc" ? "asc" : "desc",
  };
}

export function applyFilters(views: InfluencerView[], f: Filters): InfluencerView[] {
  const out = views.filter((v) => {
    if (f.q && !`${v.handle} ${v.name ?? ""}`.toLowerCase().includes(f.q)) return false;
    if (f.location && !v.locations.includes(f.location)) return false;
    if (f.niche && !v.niches.includes(f.niche)) return false;
    if (f.status && v.status !== f.status) return false;
    if (f.eligibility && v.eligibility !== f.eligibility) return false;
    if (f.tier && v.tier !== f.tier) return false;
    if (f.minFollowers !== undefined && (v.followers ?? 0) < f.minFollowers) return false;
    if (f.maxFollowers !== undefined && (v.followers ?? Infinity) > f.maxFollowers) return false;
    return true;
  });

  const value = (v: InfluencerView): number | string | null => {
    switch (f.sort) {
      case "score": return v.score?.score ?? null;
      case "followers": return v.followers;
      case "posts": return v.summary?.posts ?? null;
      case "reels": return v.summary?.reels ?? null;
      case "er": return v.summary?.engagementRate ?? null;
      case "reach": return v.summary?.avgReach ?? null;
      case "name": return (v.name ?? v.handle).toLowerCase();
    }
  };
  const sign = f.dir === "asc" ? 1 : -1;
  return out.sort((a, b) => {
    const x = value(a);
    const y = value(b);
    // Unknowns always sink to the bottom regardless of direction.
    if (x === null && y === null) return a.handle.localeCompare(b.handle);
    if (x === null) return 1;
    if (y === null) return -1;
    if (x < y) return -1 * sign;
    if (x > y) return 1 * sign;
    return a.handle.localeCompare(b.handle);
  });
}

/** Option lists for the filter dropdowns. Niches are tags used by at least 2 influencers, most common first. */
export function filterOptions(views: InfluencerView[]) {
  const locations = new Set<string>();
  const nicheCounts = new Map<string, number>();
  for (const v of views) {
    v.locations.forEach((l) => locations.add(l));
    v.niches.forEach((n) => nicheCounts.set(n, (nicheCounts.get(n) ?? 0) + 1));
  }
  const niches = [...nicheCounts].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
  return { locations: [...locations].sort(), niches };
}

/** One influencer with everything the detail page needs (30-day media, follower snapshots, assignments). */
export async function loadInfluencerDetail(handle: string, nowOverride?: Date) {
  await requireSignedIn();
  const now = nowOverride ?? new Date();
  return db.influencer.findUnique({
    where: { handle },
    include: {
      media: { where: { timestamp: { gte: new Date(now.getTime() - WINDOW_DAYS * DAY) } }, orderBy: { timestamp: "desc" } },
      snapshots: { orderBy: { syncedAt: "asc" }, take: 120 },
      assignments: { orderBy: { createdAt: "desc" } },
      connection: { select: { inviteToken: true, connectedAt: true } },
    },
  });
}
