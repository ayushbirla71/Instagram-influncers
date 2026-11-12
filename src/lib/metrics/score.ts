import type { Summary } from "./summary";

// ---- Tunable configuration: the only place the scoring recipe lives -----------------

export const WEIGHTS = {
  engagementRate: 0.35, // percentile within follower-size tier
  avgInteractions: 0.25, // percentile across the whole cohort
  consistency: 0.2, // posting regularly through the window
  reelActivity: 0.1,
  followerSize: 0.1, // log scale, 1k = 0 ... 1M = 1
  /** Only counted when the account is connected (real reach known). Others renormalise without it. */
  reach: 0.15,
} as const;

export const TARGET_POSTS_PER_WINDOW = 12; // ~3 a week counts as fully consistent
export const TARGET_REELS_PER_WINDOW = 6;
/** reach/followers at which the reach component maxes out */
export const REACH_RATE_FULL_MARKS = 0.6;
/** below this many peers in a tier we compare against everyone instead */
export const MIN_TIER_SIZE = 5;

export type Tier = "nano" | "micro" | "mid" | "macro" | "unknown";
export type Confidence = "high" | "medium" | "low";

export function tierOf(followers: number | null): Tier {
  if (followers === null || followers <= 0) return "unknown";
  if (followers < 10_000) return "nano";
  if (followers < 50_000) return "micro";
  if (followers < 200_000) return "mid";
  return "macro";
}

export const TIER_LABELS: Record<Tier, string> = {
  nano: "Nano (<10K)",
  micro: "Micro (10K-50K)",
  mid: "Mid (50K-200K)",
  macro: "Macro (200K+)",
  unknown: "Unknown",
};

export interface ScoreInput {
  id: string;
  followers: number | null;
  summary: Summary;
}

export interface ScoreResult {
  /** 0-100, or null when we cannot score (unknown follower count) */
  score: number | null;
  confidence: Confidence | null;
  tier: Tier;
  /** each component 0-1, null when not applicable (e.g. reach for unconnected accounts) */
  components: {
    engagementRate: number;
    avgInteractions: number;
    consistency: number;
    reelActivity: number;
    followerSize: number;
    reach: number | null;
  };
}

/** Fraction of `sortedAsc` below `v`, counting ties as half. Single-member cohorts score 0.5. */
export function percentileRank(v: number, sortedAsc: number[]): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return 0.5;
  let below = 0;
  let equal = 0;
  for (const x of sortedAsc) {
    if (x < v) below++;
    else if (x === v) equal++;
  }
  return (below + equal / 2) / n;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function confidenceOf(posts: number): Confidence {
  if (posts >= 8) return "high";
  if (posts >= 3) return "medium";
  return "low";
}

/** Score every influencer against the cohort passed in. Percentiles depend on who is in `inputs`. */
export function computeScores(inputs: ScoreInput[]): Map<string, ScoreResult> {
  const withPosts = inputs.filter((i) => i.summary.posts > 0 && i.summary.engagementRate !== null && i.followers);

  const erAll = withPosts.map((i) => i.summary.engagementRate as number).sort((a, b) => a - b);
  const erByTier = new Map<Tier, number[]>();
  for (const i of withPosts) {
    const t = tierOf(i.followers);
    erByTier.set(t, [...(erByTier.get(t) ?? []), i.summary.engagementRate as number]);
  }
  for (const arr of erByTier.values()) arr.sort((a, b) => a - b);
  const interAll = withPosts.map((i) => i.summary.avgInteractions ?? 0).sort((a, b) => a - b);

  const out = new Map<string, ScoreResult>();

  for (const i of inputs) {
    const s = i.summary;
    const tier = tierOf(i.followers);
    const hasPosts = s.posts > 0 && s.engagementRate !== null && !!i.followers;

    const tierPeers = erByTier.get(tier) ?? [];
    const erPeers = tierPeers.length >= MIN_TIER_SIZE ? tierPeers : erAll;

    const engagementRate = hasPosts ? percentileRank(s.engagementRate as number, erPeers) : 0;
    const avgInteractions = hasPosts ? percentileRank(s.avgInteractions ?? 0, interAll) : 0;
    const consistency = clamp01(s.posts / TARGET_POSTS_PER_WINDOW) * 0.7 + (s.activeWeeks / 4) * 0.3;
    const reelActivity = clamp01(s.reels / TARGET_REELS_PER_WINDOW);
    const followerSize = i.followers ? clamp01((Math.log10(i.followers) - 3) / 3) : 0;
    const reach = s.hasReach && s.reachRate !== null ? clamp01(s.reachRate / REACH_RATE_FULL_MARKS) : null;

    const parts: [number, number][] = [
      [WEIGHTS.engagementRate, engagementRate],
      [WEIGHTS.avgInteractions, avgInteractions],
      [WEIGHTS.consistency, consistency],
      [WEIGHTS.reelActivity, reelActivity],
      [WEIGHTS.followerSize, followerSize],
    ];
    if (reach !== null) parts.push([WEIGHTS.reach, reach]);

    const totalWeight = parts.reduce((a, [w]) => a + w, 0);
    const raw = parts.reduce((a, [w, c]) => a + w * c, 0) / totalWeight;

    out.set(i.id, {
      score: i.followers ? Math.round(raw * 100) : null,
      confidence: i.followers ? confidenceOf(s.posts) : null,
      tier,
      components: { engagementRate, avgInteractions, consistency, reelActivity, followerSize, reach },
    });
  }
  return out;
}
