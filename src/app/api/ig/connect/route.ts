import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeUrl, metaConfigured } from "@/lib/instagram/oauth";

// Public (influencers are not Demokrito users). Protected by the unguessable invite token.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!metaConfigured()) return NextResponse.json({ error: "Instagram connection is not set up yet" }, { status: 503 });
  const conn = token ? await db.igConnection.findUnique({ where: { inviteToken: token }, select: { id: true } }) : null;
  if (!conn) return NextResponse.json({ error: "Invalid invite" }, { status: 404 });

  const res = NextResponse.redirect(authorizeUrl(token));
  // State cookie: the callback must present the same value, which defeats forged callbacks (CSRF).
  res.cookies.set("ig_state", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/api/ig",
  });
  return res;
}
