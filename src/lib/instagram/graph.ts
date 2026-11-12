import type { FetchOutcome, FetchRequest, MediaData, MediaKind, MetricsProvider } from "./types";

// Real provider backed by the Meta Graph API.
//  - Everyone:           Business Discovery (public data of any Business/Creator account)
//  - Connected accounts: the owner's own media + insights (adds reach, views, saves, shares)
//
// NOTE: written against Meta's documented API but not yet exercised against a live account.
// Field and metric names change between Graph versions; verify them on first live run
// (see README "Going live").

export interface GraphConfig {
  version: string;
  igUserId: string; // the calling Instagram professional account (used for Business Discovery)
  accessToken: string;
  fetchImpl?: typeof fetch; // injectable for tests
  baseUrl?: string;
}

const MEDIA_FIELDS = "id,caption,like_count,comments_count,media_type,media_product_type,permalink,timestamp";
const PAGE_SIZE = 50;
const MAX_PAGES = 4; // 200 most recent posts is far beyond a 30-day window for any creator

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

export class GraphError extends Error {
  constructor(
    message: string,
    readonly code: number | undefined,
    readonly subcode: number | undefined,
    readonly status: number,
  ) {
    super(message);
  }
}

export function mapMediaKind(mediaType?: string, productType?: string): MediaKind {
  if (productType === "REELS") return "REEL";
  if (productType === "STORY") return "STORY";
  if (mediaType === "CAROUSEL_ALBUM") return "CAROUSEL";
  if (mediaType === "IMAGE") return "IMAGE";
  if (mediaType === "VIDEO") return "VIDEO"; // feed video that is not a reel
  return "OTHER";
}

interface RawMedia {
  id: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
}

export function toMediaData(m: RawMedia): MediaData {
  return {
    id: m.id,
    type: mapMediaKind(m.media_type, m.media_product_type),
    permalink: m.permalink ?? null,
    caption: m.caption ? m.caption.slice(0, 300) : null,
    timestamp: new Date(m.timestamp ?? 0),
    // The API omits like_count when the creator hides likes; keep that as "unknown", never 0.
    likeCount: typeof m.like_count === "number" ? m.like_count : null,
    commentsCount: typeof m.comments_count === "number" ? m.comments_count : null,
    reach: null,
    views: null,
    saved: null,
    shares: null,
    totalInteractions: null,
    source: "DISCOVERY",
  };
}

export function createGraphProvider(cfg: GraphConfig): MetricsProvider {
  const f = cfg.fetchImpl ?? fetch;
  const base = cfg.baseUrl ?? "https://graph.facebook.com";

  async function call<T>(path: string, params: Record<string, string>, token: string): Promise<T> {
    const url = new URL(`${base}/${cfg.version}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    // Token goes in a header, not the URL, so it never lands in logs.
    const res = await f(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
    const body = (await res.json().catch(() => ({}))) as T & GraphErrorBody;
    if (!res.ok || (body as GraphErrorBody).error) {
      const e = (body as GraphErrorBody).error;
      throw new GraphError(e?.message ?? `HTTP ${res.status}`, e?.code, e?.error_subcode, res.status);
    }
    return body;
  }

  /** Public data of any Business/Creator account. */
  async function viaDiscovery(req: FetchRequest): Promise<FetchOutcome> {
    const media: MediaData[] = [];
    let after: string | undefined;
    let profile: { followers_count?: number; media_count?: number; profile_picture_url?: string; id?: string } = {};

    for (let page = 0; page < MAX_PAGES; page++) {
      const mediaField = `media.limit(${PAGE_SIZE}${after ? `).after(${after}` : ""}){${MEDIA_FIELDS}}`;
      const fields = `business_discovery.username(${req.handle}){id,followers_count,media_count,profile_picture_url,${mediaField}}`;
      let data: { business_discovery?: typeof profile & { media?: { data?: RawMedia[]; paging?: { cursors?: { after?: string } } } } };
      try {
        data = await call(cfg.igUserId, { fields }, cfg.accessToken);
      } catch (e) {
        if (e instanceof GraphError && (e.code === 110 || e.subcode === 2207013 || /invalid user id|cannot find|does not exist/i.test(e.message))) {
          // Meta returns the same error for a personal account and for a non-existent handle.
          return { ok: false, kind: "NOT_PROFESSIONAL", message: "Not a Business/Creator account, or the handle doesn't exist" };
        }
        throw e;
      }
      const bd = data.business_discovery;
      if (!bd) return { ok: false, kind: "NOT_FOUND", message: "Instagram returned no profile" };
      profile = bd;
      const items = (bd.media?.data ?? []).map(toMediaData);
      media.push(...items);

      const oldest = items.length ? Math.min(...items.map((m) => m.timestamp.getTime())) : 0;
      after = bd.media?.paging?.cursors?.after;
      // Media come newest-first: stop as soon as a page reaches back past the window.
      if (!after || items.length < PAGE_SIZE || oldest < req.since.getTime()) break;
    }

    return {
      ok: true,
      profile: {
        igUserId: profile.id ?? null,
        followersCount: profile.followers_count ?? null,
        mediaCount: profile.media_count ?? null,
        profilePictureUrl: profile.profile_picture_url ?? null,
      },
      media: media.filter((m) => m.timestamp >= req.since),
    };
  }

  /** The owner's own data: same fields plus per-media insights. */
  async function viaOwner(req: FetchRequest, conn: { igUserId: string; accessToken: string }): Promise<FetchOutcome> {
    const profile = await call<{ followers_count?: number; media_count?: number; profile_picture_url?: string }>(
      conn.igUserId,
      { fields: "followers_count,media_count,profile_picture_url" },
      conn.accessToken,
    );
    const list = await call<{ data?: RawMedia[] }>(
      `${conn.igUserId}/media`,
      { fields: MEDIA_FIELDS, limit: String(PAGE_SIZE), since: String(Math.floor(req.since.getTime() / 1000)) },
      conn.accessToken,
    );
    const media = (list.data ?? []).map(toMediaData).filter((m) => m.timestamp >= req.since);

    // Metric names differ per media type and Graph version. Try the full set, then a safe subset.
    const METRIC_SETS = ["reach,views,saved,shares,total_interactions", "reach,saved,total_interactions", "reach"];
    for (const m of media) {
      if (m.type === "STORY") continue;
      for (const metrics of METRIC_SETS) {
        try {
          const r = await call<{ data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }>(
            `${m.id}/insights`,
            { metric: metrics },
            conn.accessToken,
          );
          const v: Record<string, number> = {};
          for (const d of r.data ?? []) v[d.name] = d.total_value?.value ?? d.values?.[0]?.value ?? 0;
          m.reach = v.reach ?? null;
          m.views = v.views ?? null;
          m.saved = v.saved ?? null;
          m.shares = v.shares ?? null;
          m.totalInteractions = v.total_interactions ?? null;
          m.source = "INSIGHTS";
          break;
        } catch (e) {
          // code 100 = a metric isn't supported for this media: fall through to the smaller set
          if (e instanceof GraphError && e.code === 100) continue;
          throw e;
        }
      }
    }

    return {
      ok: true,
      profile: {
        igUserId: conn.igUserId,
        followersCount: profile.followers_count ?? null,
        mediaCount: profile.media_count ?? null,
        profilePictureUrl: profile.profile_picture_url ?? null,
      },
      media,
    };
  }

  return {
    name: "graph",
    async fetchProfile(req) {
      try {
        return req.connection ? await viaOwner(req, req.connection) : await viaDiscovery(req);
      } catch (e) {
        if (e instanceof GraphError) {
          if (e.code === 190) return { ok: false, kind: "ERROR", message: "Instagram access token is invalid or expired. Reconnect in Settings." };
          if ([4, 17, 32, 613, 80002].includes(e.code ?? -1)) return { ok: false, kind: "ERROR", message: "Instagram rate limit reached; will retry later" };
          return { ok: false, kind: "ERROR", message: `Instagram API error: ${e.message}`.slice(0, 300) };
        }
        return { ok: false, kind: "ERROR", message: e instanceof Error ? e.message : "Network error" };
      }
    },
  };
}
