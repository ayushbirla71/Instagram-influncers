import { db } from "@/lib/db";
import { decryptSecret, encryptSecret, randomToken } from "@/lib/crypto";
import { GRAPH_VERSION } from "./index";

// Lets an influencer authorise read-only access to their own Instagram insights, which is the
// only way to get real reach, views, saves and shares. Flow:
//   /connect/<invite>  ->  /api/ig/connect (sets state cookie)  ->  Facebook  ->  /api/ig/callback

const SCOPES = ["instagram_basic", "instagram_manage_insights", "pages_show_list", "pages_read_engagement"];

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export const redirectUri = () => `${appUrl()}/api/ig/callback`;

export function metaConfigured(): boolean {
  return Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET);
}

export function authorizeUrl(state: string): string {
  const u = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set("client_id", process.env.META_APP_ID!);
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  u.searchParams.set("scope", SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  return u.toString();
}

/** Creates (or returns) the invite link for an influencer. Idempotent. */
export async function ensureInvite(influencerId: string) {
  const existing = await db.igConnection.findUnique({ where: { influencerId } });
  if (existing) return existing;
  return db.igConnection.create({ data: { influencerId, inviteToken: randomToken(24) } });
}

export const inviteUrl = (token: string) => `${appUrl()}/connect/${token}`;

async function graph<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `Facebook returned HTTP ${res.status}`);
  return body;
}

export type ConnectResult = { ok: true; handle: string } | { ok: false; message: string };

/**
 * Finishes the OAuth flow for the influencer who owns `inviteToken`: exchanges the code, finds
 * their Instagram professional account, checks it is the profile we expect, stores the token encrypted.
 */
export async function completeConnection(inviteToken: string, code: string): Promise<ConnectResult> {
  const conn = await db.igConnection.findUnique({ where: { inviteToken }, include: { influencer: true } });
  if (!conn) return { ok: false, message: "This invite link is not valid any more." };

  try {
    const short = await graph<{ access_token: string }>("oauth/access_token", {
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      redirect_uri: redirectUri(),
      code,
    });
    const long = await graph<{ access_token: string }>("oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: process.env.META_APP_ID!,
      client_secret: process.env.META_APP_SECRET!,
      fb_exchange_token: short.access_token,
    });

    // Page access tokens obtained from a long-lived user token don't expire, and the Instagram
    // account is reached through its linked Page.
    const pages = await graph<{ data?: { access_token: string; instagram_business_account?: { id: string; username?: string } }[] }>(
      "me/accounts",
      { fields: "access_token,instagram_business_account{id,username}", access_token: long.access_token },
    );
    const expected = conn.influencer.handle.toLowerCase();
    const match = (pages.data ?? []).find((p) => p.instagram_business_account?.username?.toLowerCase() === expected);
    if (!match?.instagram_business_account) {
      const found = (pages.data ?? []).map((p) => p.instagram_business_account?.username).filter(Boolean);
      return {
        ok: false,
        message: found.length
          ? `You connected @${found.join(", @")}, but this invite is for @${conn.influencer.handle}. Please connect the right account.`
          : `We couldn't find an Instagram Business or Creator account linked to a Facebook Page. @${conn.influencer.handle} must be a Business/Creator account linked to a Page.`,
      };
    }

    await db.$transaction([
      db.igConnection.update({
        where: { id: conn.id },
        data: {
          igUserId: match.instagram_business_account.id,
          tokenCipher: encryptSecret(match.access_token),
          tokenExpires: null,
          connectedAt: new Date(),
        },
      }),
      db.influencer.update({
        where: { id: conn.influencerId },
        data: { connectedAt: new Date(), igUserId: match.instagram_business_account.id, lastSyncedAt: null }, // resync soon with insights
      }),
    ]);
    return { ok: true, handle: conn.influencer.handle };
  } catch (e) {
    console.error("instagram connect failed", e);
    return { ok: false, message: "Instagram did not accept the authorisation. Please try again." };
  }
}

/** Decrypted connection for an influencer, or null if they haven't connected. */
export async function getConnection(influencerId: string): Promise<{ igUserId: string; accessToken: string } | null> {
  const c = await db.igConnection.findUnique({ where: { influencerId } });
  if (!c?.tokenCipher || !c.igUserId) return null;
  try {
    return { igUserId: c.igUserId, accessToken: decryptSecret(c.tokenCipher) };
  } catch {
    return null; // key rotated or data corrupt: treat as not connected rather than crash the sync
  }
}
