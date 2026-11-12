import { NextResponse } from "next/server";
import { currentUserEmail } from "@/lib/session";
import { countDue, syncBatch } from "@/lib/instagram/sync";

export const maxDuration = 60;

// GET  -> how many profiles are currently due for a refresh
// POST {ids?: string[], force?: boolean, limit?: number} -> syncs one small batch; call repeatedly until remaining = 0
export async function GET() {
  if (!(await currentUserEmail())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ due: await countDue() });
}

export async function POST(request: Request) {
  if (!(await currentUserEmail())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { ids?: unknown; force?: unknown; limit?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : undefined;
  try {
    const result = await syncBatch({
      ids,
      force: body.force === true,
      limit: typeof body.limit === "number" ? body.limit : 10,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("sync failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
