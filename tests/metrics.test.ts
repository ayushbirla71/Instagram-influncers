import { describe, expect, it } from "vitest";
import { engagementRate, interactions, summarize, type MediaRow } from "@/lib/metrics/summary";
import { computeScores, confidenceOf, percentileRank, tierOf, WEIGHTS, type ScoreInput } from "@/lib/metrics/score";

const NOW = new Date("2026-06-30T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

function media(p: Partial<MediaRow> & { id: string }): MediaRow {
  return {
    type: "IMAGE",
    timestamp: daysAgo(1),
    likeCount: 0,
    commentsCount: 0,
    reach: null,
    views: null,
    saved: null,
    shares: null,
    totalInteractions: null,
    ...p,
  };
}

describe("interactions / engagementRate", () => {
  it("sums likes and comments for public data", () => {
    expect(interactions(media({ id: "a", likeCount: 100, commentsCount: 10 }))).toBe(110);
  });
  it("prefers the owner's totalInteractions when present", () => {
    expect(interactions(media({ id: "a", likeCount: 100, commentsCount: 10, totalInteractions: 250 }))).toBe(250);
  });
  it("adds saves and shares when known", () => {
    expect(interactions(media({ id: "a", likeCount: 100, commentsCount: 10, saved: 5, shares: 3 }))).toBe(118);
  });
  it("returns null (not zero) when likes are hidden", () => {
    expect(interactions(media({ id: "a", likeCount: null, commentsCount: 40 }))).toBeNull();
  });
  it("uses interactions/reach when reach is known, else interactions/followers", () => {
    const withReach = media({ id: "a", totalInteractions: 100, reach: 500 });
    expect(engagementRate(withReach, 10_000)).toBeCloseTo(0.2);
    const pub = media({ id: "b", likeCount: 90, commentsCount: 10 });
    expect(engagementRate(pub, 1000)).toBeCloseTo(0.1);
    expect(engagementRate(pub, null)).toBeNull();
    expect(engagementRate(pub, 0)).toBeNull();
  });
});

describe("summarize (hand-computed)", () => {
  const rows: MediaRow[] = [
    media({ id: "A", type: "REEL", timestamp: daysAgo(2), likeCount: 100, commentsCount: 10 }), // 110
    media({ id: "B", type: "IMAGE", timestamp: daysAgo(10), likeCount: 50, commentsCount: 5 }), // 55
    media({ id: "C", type: "CAROUSEL", timestamp: daysAgo(20), likeCount: 30, commentsCount: 0 }), // 30
    media({ id: "D", type: "REEL", timestamp: daysAgo(40), likeCount: 999, commentsCount: 99 }), // outside window
    media({ id: "E", type: "STORY", timestamp: daysAgo(1), likeCount: 5, commentsCount: 0 }), // stories excluded
    media({ id: "F", type: "REEL", timestamp: daysAgo(3), likeCount: null, commentsCount: null }), // likes hidden
  ];
  const s = summarize(rows, 1000, NOW);

  it("counts posts and reels in the last 30 days only", () => {
    expect(s.posts).toBe(4); // A, B, C, F
    expect(s.reels).toBe(2); // A, F
    expect(s.carousels).toBe(1);
    expect(s.images).toBe(1);
    expect(s.postsPerWeek).toBeCloseTo(4 / (30 / 7), 5);
  });
  it("measures engagement over posts where it is known", () => {
    expect(s.measuredPosts).toBe(3);
    expect(s.avgInteractions).toBeCloseTo((110 + 55 + 30) / 3, 5); // 65
    expect(s.engagementRate).toBeCloseTo(0.065, 5);
    expect(s.reelAvgInteractions).toBe(110);
    expect(s.reelEngagementRate).toBeCloseTo(0.11, 5);
  });
  it("tracks recency and weekly activity", () => {
    expect(s.daysSinceLastPost).toBe(2);
    expect(s.activeWeeks).toBe(3); // weeks 0 (A,F), 1 (B), 2 (C)
  });
  it("does not invent reach for unconnected accounts", () => {
    expect(s.hasReach).toBe(false);
    expect(s.totalReach).toBeNull();
    expect(s.avgReach).toBeNull();
    expect(s.reachRate).toBeNull();
  });
  it("reports real reach when insights exist", () => {
    const r = summarize(
      [
        media({ id: "X", type: "REEL", timestamp: daysAgo(1), totalInteractions: 100, reach: 500, views: 800 }),
        media({ id: "Y", type: "REEL", timestamp: daysAgo(5), totalInteractions: 150, reach: 1500, views: 2000 }),
      ],
      2000,
      NOW,
    );
    expect(r.hasReach).toBe(true);
    expect(r.totalReach).toBe(2000);
    expect(r.avgReach).toBe(1000);
    expect(r.reachRate).toBeCloseTo(0.5);
    expect(r.totalViews).toBe(2800);
  });
  it("reel engagement uses interactions/reach when reach is known, else followers", () => {
    expect(s.reelRateBasis).toBe("followers");
    const r = summarize(
      [
        media({ id: "X", type: "REEL", timestamp: daysAgo(1), totalInteractions: 100, reach: 500 }),
        media({ id: "Y", type: "REEL", timestamp: daysAgo(5), totalInteractions: 150, reach: 1500 }),
      ],
      2000,
      NOW,
    );
    expect(r.reelRateBasis).toBe("reach");
    expect(r.reelEngagementRate).toBeCloseTo(250 / 2000); // sum interactions / sum reach = 0.125
  });
  it("handles an inactive account", () => {
    const z = summarize([], 5000, NOW);
    expect(z.posts).toBe(0);
    expect(z.avgInteractions).toBeNull();
    expect(z.engagementRate).toBeNull();
    expect(z.daysSinceLastPost).toBeNull();
  });
});

describe("tiers, percentiles, confidence", () => {
  it("assigns tiers at the boundaries", () => {
    expect(tierOf(9_999)).toBe("nano");
    expect(tierOf(10_000)).toBe("micro");
    expect(tierOf(49_999)).toBe("micro");
    expect(tierOf(50_000)).toBe("mid");
    expect(tierOf(200_000)).toBe("macro");
    expect(tierOf(null)).toBe("unknown");
  });
  it("computes percentile rank with ties as half", () => {
    expect(percentileRank(3, [1, 2, 3, 4, 5])).toBeCloseTo(0.5);
    expect(percentileRank(1, [1, 2, 3, 4, 5])).toBeCloseTo(0.1);
    expect(percentileRank(5, [1, 2, 3, 4, 5])).toBeCloseTo(0.9);
    expect(percentileRank(7, [7])).toBe(0.5);
  });
  it("maps post counts to confidence", () => {
    expect(confidenceOf(0)).toBe("low");
    expect(confidenceOf(2)).toBe("low");
    expect(confidenceOf(3)).toBe("medium");
    expect(confidenceOf(7)).toBe("medium");
    expect(confidenceOf(8)).toBe("high");
  });
  it("weights are sensible", () => {
    const base = WEIGHTS.engagementRate + WEIGHTS.avgInteractions + WEIGHTS.consistency + WEIGHTS.reelActivity + WEIGHTS.followerSize;
    expect(base).toBeCloseTo(1);
  });
});

describe("computeScores", () => {
  // Six micro accounts, identical activity, differing only in engagement
  const mk = (id: string, followers: number, perPostLikes: number, extra: Partial<MediaRow> = {}): ScoreInput => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      media({ id: `${id}-${i}`, type: i % 2 ? "REEL" : "IMAGE", timestamp: daysAgo(i * 2.4 + 0.5), likeCount: perPostLikes, commentsCount: 0, ...extra }),
    );
    return { id, followers, summary: summarize(rows, followers, NOW) };
  };

  it("ranks higher engagement above lower, all else equal", () => {
    const cohort = [mk("a", 20000, 200), mk("b", 20000, 400), mk("c", 20000, 600), mk("d", 20000, 800), mk("e", 20000, 1000), mk("f", 20000, 1200)];
    const r = computeScores(cohort);
    const scores = ["a", "b", "c", "d", "e", "f"].map((k) => r.get(k)!.score!);
    expect([...scores].sort((x, y) => x - y)).toEqual(scores); // strictly non-decreasing
    expect(scores[5]).toBeGreaterThan(scores[0]);
    expect(r.get("a")!.tier).toBe("micro");
    expect(r.get("a")!.confidence).toBe("high");
  });

  it("scores stay within 0-100 and a perfect account hits the top", () => {
    const cohort = [mk("a", 1_000_000, 10), mk("b", 1_000_000, 5000), mk("c", 1_000_000, 90000), mk("d", 1_000_000, 100), mk("e", 1_000_000, 200), mk("star", 1_000_000, 500_000)];
    const r = computeScores(cohort);
    for (const v of r.values()) {
      expect(v.score!).toBeGreaterThanOrEqual(0);
      expect(v.score!).toBeLessThanOrEqual(100);
    }
    expect(r.get("star")!.score!).toBeGreaterThanOrEqual(85);
  });

  it("an inactive account scores low with low confidence", () => {
    const cohort = [mk("a", 20000, 500), mk("b", 20000, 600), mk("c", 20000, 700), mk("d", 20000, 800), mk("e", 20000, 900)];
    const idle: ScoreInput = { id: "idle", followers: 20000, summary: summarize([], 20000, NOW) };
    const r = computeScores([...cohort, idle]);
    expect(r.get("idle")!.confidence).toBe("low");
    expect(r.get("idle")!.score!).toBeLessThan(Math.min(...cohort.map((c) => r.get(c.id)!.score!)));
  });

  it("connected reach adds a component; unconnected renormalises without it (no fabricated reach)", () => {
    const plain = mk("plain", 20000, 600);
    const connected = mk("conn", 20000, 600, { reach: 14_000, totalInteractions: 600 });
    const r = computeScores([plain, connected, mk("x", 20000, 300), mk("y", 20000, 900), mk("z", 20000, 1200)]);
    expect(r.get("plain")!.components.reach).toBeNull();
    expect(r.get("conn")!.components.reach).not.toBeNull();
    // reach rate 0.7 >= 0.6 full marks, so connected must not be penalised relative to plain
    expect(r.get("conn")!.components.reach).toBe(1);
  });

  it("returns a null score when followers are unknown", () => {
    const r = computeScores([{ id: "u", followers: null, summary: summarize([], null, NOW) }]);
    expect(r.get("u")!.score).toBeNull();
    expect(r.get("u")!.tier).toBe("unknown");
  });
});
