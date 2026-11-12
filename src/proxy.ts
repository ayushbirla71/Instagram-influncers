import { NextResponse } from "next/server";
import { auth } from "@/auth";

// First line of defence: verifies the session JWT (signature + expiry), so a forged or expired
// cookie is rejected here. The data layer (requireSignedIn) and route handlers check again.
export const proxy = auth((req) => {
  if (!req.auth?.user?.email) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
});

export const config = {
  // Everything except the login page, Auth.js endpoints, the cron endpoint (own secret),
  // the public influencer connect flow, and static assets.
  matcher: ["/((?!login|api/auth|api/cron|api/ig|connect|_next/static|_next/image|favicon.ico).*)"],
};
