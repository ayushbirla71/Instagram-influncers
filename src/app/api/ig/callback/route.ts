import { NextResponse } from "next/server";
import { appUrl, completeConnection } from "@/lib/instagram/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)ig_state=([^;]+)/)?.[1];

  const back = (status: "ok" | "failed", message?: string) => {
    const u = new URL(`${appUrl()}/connect/${encodeURIComponent(state)}`);
    u.searchParams.set("status", status);
    if (message) u.searchParams.set("message", message.slice(0, 300));
    const res = NextResponse.redirect(u);
    res.cookies.delete({ name: "ig_state", path: "/api/ig" });
    return res;
  };

  if (!state || cookie !== state) {
    return NextResponse.json({ error: "Session expired. Open your invite link again." }, { status: 400 });
  }
  if (!code) return back("failed", url.searchParams.get("error_description") ?? "Authorisation was cancelled.");

  const result = await completeConnection(state, code);
  return result.ok ? back("ok") : back("failed", result.message);
}
