import { afterEach, describe, expect, it, vi } from "vitest";
import { createGraphProvider, mapMediaKind, toMediaData } from "@/lib/instagram/graph";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

const SINCE = new Date("2026-10-10T00:00:00Z");
const cfg = (fetchImpl: typeof fetch) => ({ version: "v23.0", igUserId: "111", accessToken: "TOKEN", fetchImpl });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("mapMediaKind", () => {
  it.each([
    ["VIDEO", "REELS", "REEL"],
    ["IMAGE", "FEED", "IMAGE"],
    ["CAROUSEL_ALBUM", "FEED", "CAROUSEL"],
    ["VIDEO", "FEED", "VIDEO"],
    ["IMAGE", "STORY", "STORY"],
    [undefined, undefined, "OTHER"],
  ])("%s / %s -> %s", (mt, pt, expected) => {
    expect(mapMediaKind(mt, pt)).toBe(expected);
  });
});

describe("toMediaData", () => {
  it("keeps hidden likes as null, never zero", () => {
    const m = toMediaData({ id: "1", comments_count: 5, media_type: "IMAGE", timestamp: "2026-11-01T00:00:00+0000" });
    expect(m.likeCount).toBeNull();
    expect(m.commentsCount).toBe(5);
    expect(m.reach).toBeNull();
    expect(m.source).toBe("DISCOVERY");
  });
  it("keeps a real zero", () => {
    expect(toMediaData({ id: "1", like_count: 0, comments_count: 0, timestamp: "2026-11-01T00:00:00+0000" }).likeCount).toBe(0);
  });
});

describe("Business Discovery", () => {
  it("returns profile and only media inside the window, and sends the token in a header", async () => {
    const calls: { url: URL; init?: RequestInit }[] = [];
    const f = vi.fn(async (url: URL | string, init?: RequestInit) => {
      calls.push({ url: new URL(String(url)), init });
      return json({
        business_discovery: {
          id: "999",
          followers_count: 20500,
          media_count: 340,
          profile_picture_url: "https://x/pic.jpg",
          media: {
            data: [
              { id: "m1", media_type: "VIDEO", media_product_type: "REELS", like_count: 900, comments_count: 40, timestamp: "2026-11-05T10:00:00+0000", permalink: "https://instagram.com/reel/a/" },
              { id: "m2", media_type: "IMAGE", media_product_type: "FEED", like_count: 300, comments_count: 10, timestamp: "2026-10-20T10:00:00+0000" },
              { id: "old", media_type: "IMAGE", like_count: 1, comments_count: 0, timestamp: "2026-08-01T10:00:00+0000" },
            ],
            paging: { cursors: { after: "CUR" } },
          },
        },
      });
    }) as unknown as typeof fetch;

    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "someone", since: SINCE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.followersCount).toBe(20500);
    expect(r.profile.igUserId).toBe("999");
    expect(r.media.map((m) => m.id)).toEqual(["m1", "m2"]); // "old" is outside the window
    expect(r.media[0].type).toBe("REEL");
    // only one page requested because the page already reached back past the window start
    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname).toBe("/v23.0/111");
    expect(calls[0].url.searchParams.get("fields")).toContain("business_discovery.username(someone)");
    expect(calls[0].url.search).not.toContain("TOKEN"); // never in the URL
    expect((calls[0].init?.headers as Record<string, string>).authorization).toBe("Bearer TOKEN");
  });

  it("paginates until the window is covered", async () => {
    const page = (n: number, ts: string, after?: string) => ({
      business_discovery: {
        followers_count: 10,
        media: {
          data: Array.from({ length: 50 }, (_, i) => ({ id: `p${n}-${i}`, media_type: "IMAGE", like_count: 1, comments_count: 0, timestamp: ts })),
          paging: after ? { cursors: { after } } : {},
        },
      },
    });
    const seen: string[] = [];
    const f = vi.fn(async (url: URL | string) => {
      const fields = new URL(String(url)).searchParams.get("fields")!;
      seen.push(fields);
      return json(fields.includes(".after(C1)") ? page(2, "2026-10-12T00:00:00+0000") : page(1, "2026-11-08T00:00:00+0000", "C1"));
    }) as unknown as typeof fetch;
    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "busy", since: SINCE });
    expect(r.ok && r.media.length).toBe(100);
    expect(f).toHaveBeenCalledTimes(2);
    expect(seen[1]).toContain("media.limit(50).after(C1)");
  });

  it("maps Meta's invalid-user error to NOT_PROFESSIONAL", async () => {
    const f = (async () =>
      json({ error: { message: "Invalid user id", type: "OAuthException", code: 110, error_subcode: 2207013 } }, 400)) as unknown as typeof fetch;
    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "personal_acct", since: SINCE });
    expect(r).toMatchObject({ ok: false, kind: "NOT_PROFESSIONAL" });
  });

  it("reports an expired token as a retryable ERROR with guidance", async () => {
    const f = (async () => json({ error: { message: "Error validating access token", code: 190 } }, 401)) as unknown as typeof fetch;
    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "x", since: SINCE });
    expect(r).toMatchObject({ ok: false, kind: "ERROR" });
    expect(!r.ok && r.message).toMatch(/token/i);
  });

  it("explains the common mistake of using a Facebook Page id as IG_USER_ID", async () => {
    const f = (async () => json({ error: { message: "(#100) Tried accessing nonexisting field (business_discovery) on node type (Page)", code: 100 } }, 400)) as unknown as typeof fetch;
    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "x", since: SINCE });
    expect(r).toMatchObject({ ok: false, kind: "ERROR" });
    expect(!r.ok && r.message).toMatch(/IG_USER_ID is not an Instagram account id/);
  });

  it("treats rate limits as ERROR (retry later), not as a missing account", async () => {
    const f = (async () => json({ error: { message: "Application request limit reached", code: 4 } }, 429)) as unknown as typeof fetch;
    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "x", since: SINCE });
    expect(r).toMatchObject({ ok: false, kind: "ERROR" });
    expect(!r.ok && r.message).toMatch(/rate limit/i);
  });

  it("survives a network failure without throwing", async () => {
    const f = (async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "x", since: SINCE });
    expect(r).toMatchObject({ ok: false, kind: "ERROR", message: "socket hang up" });
  });
});

describe("owner insights (connected account)", () => {
  it("adds reach, views, saves, shares and total interactions, marked as INSIGHTS", async () => {
    const f = vi.fn(async (url: URL | string) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/insights")) {
        return json({
          data: [
            { name: "reach", values: [{ value: 5000 }] },
            { name: "views", values: [{ value: 8000 }] },
            { name: "saved", values: [{ value: 120 }] },
            { name: "shares", values: [{ value: 60 }] },
            { name: "total_interactions", total_value: { value: 1500 } },
          ],
        });
      }
      if (u.pathname.endsWith("/media")) {
        return json({ data: [{ id: "m1", media_type: "VIDEO", media_product_type: "REELS", like_count: 1200, comments_count: 40, timestamp: "2026-11-05T10:00:00+0000" }] });
      }
      return json({ followers_count: 20600, media_count: 341 });
    }) as unknown as typeof fetch;

    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "owner", since: SINCE, connection: { igUserId: "555", accessToken: "OWNER" } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const m = r.media[0];
    expect(m).toMatchObject({ reach: 5000, views: 8000, saved: 120, shares: 60, totalInteractions: 1500, source: "INSIGHTS" });
    expect(r.profile.igUserId).toBe("555");
  });

  it("falls back to a smaller metric set when Meta rejects one (code 100)", async () => {
    const asked: string[] = [];
    const f = vi.fn(async (url: URL | string) => {
      const u = new URL(String(url));
      if (u.pathname.endsWith("/insights")) {
        const metric = u.searchParams.get("metric")!;
        asked.push(metric);
        if (metric.includes("views")) return json({ error: { message: "metric not supported", code: 100 } }, 400);
        return json({ data: [{ name: "reach", values: [{ value: 700 }] }, { name: "saved", values: [{ value: 9 }] }, { name: "total_interactions", values: [{ value: 90 }] }] });
      }
      if (u.pathname.endsWith("/media")) return json({ data: [{ id: "m1", media_type: "IMAGE", like_count: 80, comments_count: 5, timestamp: "2026-11-05T10:00:00+0000" }] });
      return json({ followers_count: 1000 });
    }) as unknown as typeof fetch;

    const r = await createGraphProvider(cfg(f)).fetchProfile({ handle: "o", since: SINCE, connection: { igUserId: "5", accessToken: "T" } });
    expect(asked).toEqual(["reach,views,saved,shares,total_interactions", "reach,saved,total_interactions"]);
    expect(r.ok && r.media[0]).toMatchObject({ reach: 700, views: null, totalInteractions: 90, source: "INSIGHTS" });
  });
});

describe("token encryption", () => {
  const original = process.env.TOKEN_ENCRYPTION_KEY;
  afterEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = original;
  });

  it("round-trips and never stores plaintext", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
    const enc = encryptSecret("EAAG-secret-page-token");
    expect(enc).not.toContain("EAAG");
    expect(decryptSecret(enc)).toBe("EAAG-secret-page-token");
    expect(encryptSecret("same")).not.toBe(encryptSecret("same")); // random IV
  });

  it("detects tampering and wrong keys", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "ab".repeat(32);
    const enc = encryptSecret("secret");
    const parts = enc.split(".");
    parts[2] = Buffer.from("tampered!").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
    process.env.TOKEN_ENCRYPTION_KEY = "cd".repeat(32);
    expect(() => decryptSecret(enc)).toThrow();
  });

  it("rejects a missing or malformed key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "short";
    expect(() => encryptSecret("x")).toThrow(/64 hex/);
  });
});
