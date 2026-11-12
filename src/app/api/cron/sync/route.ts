import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncBatch } from "@/lib/instagram/sync";

export const maxDuration = 300;

function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // never run unauthenticated
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. Each run works through
// whatever is due, in small batches, until its time budget is spent; the next run continues.
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deadline = Date.now() + 240_000;
  let processed = 0;
  let remaining = 0;
  do {
    const r = await syncBatch({ limit: 10 });
    processed += r.processed.length;
    remaining = r.remaining;
    if (r.processed.length === 0) break;
  } while (remaining > 0 && Date.now() < deadline);

  return NextResponse.json({ processed, remaining });
}
