import { db } from "@/lib/db";
import type { Eligibility, Prisma } from "@/generated/prisma/client";
import { getProvider } from "./index";
import { getConnection } from "./oauth";
import type { MetricsProvider } from "./types";

/** We fetch a little more than the 30-day window so edge posts aren't missed by clock skew. */
export const FETCH_DAYS = 35;

const HOUR = 3_600_000;
// How long before we re-check a profile, by what we learned last time.
const STALE_AFTER_MS: Record<Eligibility, number> = {
  UNKNOWN: 0,
  OK: 20 * HOUR,
  ERROR: 1 * HOUR,
  NOT_PROFESSIONAL: 7 * 24 * HOUR, // personal accounts rarely switch
  NOT_FOUND: 7 * 24 * HOUR,
};

export interface SyncOutcome {
  influencerId: string;
  handle: string;
  eligibility: Eligibility;
  mediaCount: number;
  message?: string;
}

export async function syncInfluencer(influencerId: string, provider: MetricsProvider = getProvider()): Promise<SyncOutcome> {
  const inf = await db.influencer.findUniqueOrThrow({ where: { id: influencerId } });
  const run = await db.syncRun.create({
    data: { influencerId, kind: "discovery", status: "RUNNING", startedAt: new Date() },
  });

  try {
    const since = new Date(Date.now() - FETCH_DAYS * 86_400_000);
    const result = await provider.fetchProfile({
      handle: inf.handle,
      since,
      followersHint: inf.followersDeclared,
      connection: await getConnection(influencerId),
    });

    if (!result.ok) {
      await db.$transaction([
        db.influencer.update({
          where: { id: inf.id },
          data: { eligibility: result.kind, eligibilityNote: result.message, lastSyncedAt: new Date() },
        }),
        db.syncRun.update({
          where: { id: run.id },
          data: { status: result.kind === "ERROR" ? "FAILED" : "DONE", error: result.message, finishedAt: new Date() },
        }),
      ]);
      return { influencerId, handle: inf.handle, eligibility: result.kind, mediaCount: 0, message: result.message };
    }

    const { profile, media } = result;

    // Don't store more than one snapshot per ~12h so the trend chart stays meaningful.
    const lastSnap = await db.profileSnapshot.findFirst({ where: { influencerId }, orderBy: { syncedAt: "desc" } });
    const snapDue = !lastSnap || Date.now() - lastSnap.syncedAt.getTime() > 12 * HOUR;

    const ops: Prisma.PrismaPromise<unknown>[] = [
      db.influencer.update({
        where: { id: inf.id },
        data: {
          eligibility: "OK",
          eligibilityNote: null,
          igUserId: profile.igUserId ?? undefined,
          followersCount: profile.followersCount,
          mediaCount: profile.mediaCount,
          profilePictureUrl: profile.profilePictureUrl,
          lastSyncedAt: new Date(),
        },
      }),
    ];

    if (snapDue) {
      ops.push(
        db.profileSnapshot.create({
          data: { influencerId, followersCount: profile.followersCount, mediaCount: profile.mediaCount },
        }),
      );
    }

    for (const m of media) {
      const base = {
        type: m.type,
        permalink: m.permalink,
        caption: m.caption,
        timestamp: m.timestamp,
        likeCount: m.likeCount,
        commentsCount: m.commentsCount,
        fetchedAt: new Date(),
      };
      // Public (DISCOVERY) data must never wipe reach/views we previously got from the owner's insights.
      const insights =
        m.source === "INSIGHTS"
          ? {
              reach: m.reach,
              views: m.views,
              saved: m.saved,
              shares: m.shares,
              totalInteractions: m.totalInteractions,
              source: "INSIGHTS" as const,
            }
          : {};
      ops.push(
        db.media.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            influencerId,
            ...base,
            reach: m.reach,
            views: m.views,
            saved: m.saved,
            shares: m.shares,
            totalInteractions: m.totalInteractions,
            source: m.source,
          },
          update: { ...base, ...insights },
        }),
      );
    }

    ops.push(db.syncRun.update({ where: { id: run.id }, data: { status: "DONE", finishedAt: new Date() } }));
    await db.$transaction(ops);
    return { influencerId, handle: inf.handle, eligibility: "OK", mediaCount: media.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.$transaction([
      db.influencer.update({
        where: { id: inf.id },
        data: { eligibility: "ERROR", eligibilityNote: message.slice(0, 300), lastSyncedAt: new Date() },
      }),
      db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message.slice(0, 500), finishedAt: new Date() } }),
    ]);
    return { influencerId, handle: inf.handle, eligibility: "ERROR", mediaCount: 0, message };
  }
}

export interface BatchResult {
  processed: SyncOutcome[];
  /** profiles still waiting after this batch */
  remaining: number;
}

/**
 * Syncs up to `limit` profiles that are due, oldest first. Designed to be called
 * repeatedly (by the UI progress loop or by cron) until `remaining` hits 0, so no
 * single request has to run long.
 *
 * - `ids`: restrict to these influencers (and treat them as due regardless of freshness when `force`)
 * - `force`: ignore freshness
 */
export async function syncBatch(opts: { limit?: number; ids?: string[]; force?: boolean } = {}): Promise<BatchResult> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const candidates = await db.influencer.findMany({
    where: opts.ids ? { id: { in: opts.ids } } : undefined,
    select: { id: true, eligibility: true, lastSyncedAt: true },
    orderBy: [{ lastSyncedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
  });

  const now = Date.now();
  const due = candidates.filter((c) => {
    if (opts.force && opts.ids) return true;
    if (!c.lastSyncedAt) return true;
    return now - c.lastSyncedAt.getTime() >= STALE_AFTER_MS[c.eligibility];
  });

  // For forced syncs of explicit ids, a profile synced earlier in this same loop must not repeat:
  // callers pass the not-yet-done ids each round.
  const slice = due.slice(0, limit);
  const provider = getProvider();
  const processed: SyncOutcome[] = [];
  for (const c of slice) processed.push(await syncInfluencer(c.id, provider));

  return { processed, remaining: Math.max(0, due.length - slice.length) };
}

/** How many profiles are currently due, without syncing anything. */
export async function countDue(): Promise<number> {
  const rows = await db.influencer.findMany({ select: { eligibility: true, lastSyncedAt: true } });
  const now = Date.now();
  return rows.filter((c) => !c.lastSyncedAt || now - c.lastSyncedAt.getTime() >= STALE_AFTER_MS[c.eligibility]).length;
}
