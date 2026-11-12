// Pure metric calculations. No database, no framework: input rows in, numbers out.

export const WINDOW_DAYS = 30;
const DAY = 86_400_000;

export interface MediaRow {
  id: string;
  type: "REEL" | "IMAGE" | "CAROUSEL" | "VIDEO" | "STORY" | "OTHER";
  timestamp: Date;
  likeCount: number | null;
  commentsCount: number | null;
  reach: number | null;
  views: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
}

/**
 * Total interactions for one post/reel. Uses the owner's `totalInteractions` when we have it,
 * otherwise sums what is public (likes + comments, plus saves/shares if known).
 *
 * Returns null when the like count is hidden: comments alone would badly understate engagement
 * and unfairly penalise creators who hide likes, so such posts are "unmeasured", never zero.
 */
export function interactions(m: MediaRow): number | null {
  if (m.totalInteractions !== null) return m.totalInteractions;
  if (m.likeCount === null) return null;
  return m.likeCount + (m.commentsCount ?? 0) + (m.saved ?? 0) + (m.shares ?? 0);
}

/**
 * Engagement rate for one post as a fraction (0.04 = 4%).
 * With reach known (connected account) it is interactions / reach, the stricter and more
 * meaningful measure. Otherwise interactions / followers.
 */
export function engagementRate(m: MediaRow, followers: number | null): number | null {
  const i = interactions(m);
  if (i === null) return null;
  if (m.reach !== null && m.reach > 0) return i / m.reach;
  if (followers !== null && followers > 0) return i / followers;
  return null;
}

export interface Summary {
  windowDays: number;
  posts: number;
  reels: number;
  carousels: number;
  images: number;
  otherPosts: number;
  postsPerWeek: number;
  /** distinct 7-day buckets (out of 4) containing at least one post */
  activeWeeks: number;
  lastPostAt: Date | null;
  daysSinceLastPost: number | null;

  totalInteractions: number;
  /** posts where interactions are known */
  measuredPosts: number;
  avgInteractions: number | null;
  /** avg interactions per post / followers */
  engagementRate: number | null;

  reelAvgInteractions: number | null;
  /** interactions / reach over reels when reach is known (connected), otherwise avg interactions / followers */
  reelEngagementRate: number | null;
  reelRateBasis: "reach" | "followers" | null;

  /** reach is only known for connected accounts */
  hasReach: boolean;
  reachPosts: number;
  totalReach: number | null;
  avgReach: number | null;
  /** avg reach per post / followers */
  reachRate: number | null;
  totalViews: number | null;
}

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarize(media: MediaRow[], followers: number | null, now: Date = new Date(), windowDays = WINDOW_DAYS): Summary {
  const start = now.getTime() - windowDays * DAY;
  const inWindow = media.filter((m) => m.timestamp.getTime() >= start && m.timestamp.getTime() <= now.getTime());
  // Stories vanish in 24h and are not part of "posts/reels made"; exclude from counts.
  const posts = inWindow.filter((m) => m.type !== "STORY");

  const reels = posts.filter((m) => m.type === "REEL");
  const weeks = new Set(posts.map((m) => Math.min(3, Math.floor((now.getTime() - m.timestamp.getTime()) / (7 * DAY)))));

  const lastPostAt = posts.reduce<Date | null>((acc, m) => (acc === null || m.timestamp > acc ? m.timestamp : acc), null);

  const known = posts.map((m) => interactions(m)).filter((x): x is number => x !== null);
  const reelKnown = reels.map((m) => interactions(m)).filter((x): x is number => x !== null);
  const avgInter = avg(known);
  const reelAvg = avg(reelKnown);

  const withReach = posts.filter((m) => m.reach !== null);
  const withViews = posts.filter((m) => m.views !== null);
  const avgReach = avg(withReach.map((m) => m.reach as number));

  // Reel rate prefers the stricter interactions/reach when the owner's insights exist.
  const reelsMeasuredWithReach = reels.filter((m) => m.reach !== null && m.reach > 0 && interactions(m) !== null);
  const reelRateFromReach = reelsMeasuredWithReach.length
    ? reelsMeasuredWithReach.reduce((a, m) => a + (interactions(m) as number), 0) / reelsMeasuredWithReach.reduce((a, m) => a + (m.reach as number), 0)
    : null;

  const rate = (x: number | null) => (x !== null && followers !== null && followers > 0 ? x / followers : null);

  return {
    windowDays,
    posts: posts.length,
    reels: reels.length,
    carousels: posts.filter((m) => m.type === "CAROUSEL").length,
    images: posts.filter((m) => m.type === "IMAGE").length,
    otherPosts: posts.filter((m) => !["REEL", "CAROUSEL", "IMAGE"].includes(m.type)).length,
    postsPerWeek: posts.length / (windowDays / 7),
    activeWeeks: weeks.size,
    lastPostAt,
    daysSinceLastPost: lastPostAt ? Math.floor((now.getTime() - lastPostAt.getTime()) / DAY) : null,

    totalInteractions: known.reduce((a, b) => a + b, 0),
    measuredPosts: known.length,
    avgInteractions: avgInter,
    engagementRate: rate(avgInter),

    reelAvgInteractions: reelAvg,
    reelEngagementRate: reelRateFromReach ?? rate(reelAvg),
    reelRateBasis: reelRateFromReach !== null ? "reach" : rate(reelAvg) !== null ? "followers" : null,

    hasReach: withReach.length > 0,
    reachPosts: withReach.length,
    totalReach: withReach.length ? withReach.reduce((a, m) => a + (m.reach as number), 0) : null,
    avgReach,
    reachRate: rate(avgReach),
    totalViews: withViews.length ? withViews.reduce((a, m) => a + (m.views as number), 0) : null,
  };
}
