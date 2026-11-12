import type { FetchOutcome, FetchRequest, MediaData, MediaKind, MetricsProvider } from "./types";

// Deterministic demo data: the same handle always yields the same account
// "personality", so repeated syncs are stable and tests can rely on it.

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);
const lognormal = (r: () => number, sigma: number) => {
  // Box-Muller
  const u = Math.max(r(), 1e-9);
  const v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.exp(sigma * z);
};

const DAY = 86_400_000;

export const mockProvider: MetricsProvider = {
  name: "mock",
  async fetchProfile(req: FetchRequest): Promise<FetchOutcome> {
    const r = mulberry32(hash(req.handle));

    // Account personality
    const bucket = r();
    if (bucket >= 0.93) return { ok: false, kind: "NOT_FOUND", message: "Demo: handle not found" };
    if (bucket >= 0.78) {
      return { ok: false, kind: "NOT_PROFESSIONAL", message: "Demo: personal account, not readable via the Graph API" };
    }

    const followers = Math.max(500, Math.round((req.followersHint ?? 30_000) * between(r, 0.95, 1.08)));
    const inactive = r() < 0.1;
    const postsPerDay = inactive ? between(r, 0, 0.06) : between(r, 0.12, 0.85);
    const reelShare = between(r, 0.15, 0.9);
    const baseEr = 0.005 + 0.07 * Math.pow(r(), 2); // most accounts low, a few strong
    const hasInsights = r() < 0.25;
    const hiddenLikes = r() < 0.04;

    const windowDays = Math.max(1, Math.round((Date.now() - req.since.getTime()) / DAY));
    const count = Math.round(postsPerDay * windowDays * between(r, 0.8, 1.2));

    const media: MediaData[] = [];
    for (let i = 0; i < count; i++) {
      const ageDays = r() * windowDays;
      const timestamp = new Date(Date.now() - ageDays * DAY);
      const roll = r();
      const type: MediaKind = roll < reelShare ? "REEL" : roll < reelShare + (1 - reelShare) * 0.55 ? "CAROUSEL" : "IMAGE";
      const reelBoost = type === "REEL" ? 1.5 : 1;
      const likes = Math.round(followers * baseEr * reelBoost * lognormal(r, 0.55));
      const comments = Math.round(likes * between(r, 0.008, 0.04));

      const m: MediaData = {
        id: `mock_${req.handle}_${i}`,
        type,
        permalink: `https://www.instagram.com/${type === "REEL" ? "reel" : "p"}/mock${hash(req.handle + i).toString(36)}/`,
        caption: null,
        timestamp,
        likeCount: hiddenLikes ? null : likes,
        commentsCount: comments,
        reach: null,
        views: null,
        saved: null,
        shares: null,
        totalInteractions: null,
        source: "DISCOVERY",
      };

      if (hasInsights) {
        const reach = Math.round(followers * (type === "REEL" ? between(r, 0.35, 2.4) : between(r, 0.12, 0.6)));
        const saved = Math.round(likes * between(r, 0.05, 0.25));
        const shares = Math.round(likes * between(r, 0.03, 0.15));
        m.reach = reach;
        m.views = Math.round(reach * between(r, 1.15, 1.8));
        m.saved = saved;
        m.shares = shares;
        m.totalInteractions = likes + comments + saved + shares;
        m.source = "INSIGHTS";
      }
      media.push(m);
    }
    media.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      ok: true,
      profile: {
        igUserId: `mock_${hash(req.handle)}`,
        followersCount: followers,
        mediaCount: Math.round(followers / 120 + count + between(r, 20, 400)),
        profilePictureUrl: null,
      },
      media,
    };
  },
};
