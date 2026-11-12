import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUserEmail } from "@/lib/session";
import { applyFilters, loadCohort, parseFilters } from "@/lib/queries";
import { engagementRate, WINDOW_DAYS, type MediaRow } from "@/lib/metrics/summary";
import { TIER_LABELS } from "@/lib/metrics/score";

// GET /api/export?<same filters as the influencers page>   or   ?scope=shortlist
// Cells that start with = + - @ are prefixed with ' so spreadsheet formulas can't be injected from imported text.
function safe(v: string | null | undefined): string {
  if (!v) return "";
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

export async function GET(request: Request) {
  if (!(await currentUserEmail())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams);
  const filters = parseFilters(raw);
  const all = await loadCohort();
  let rows = applyFilters(all, filters);
  const shortlist = url.searchParams.get("scope") === "shortlist";
  if (shortlist) rows = rows.filter((v) => v.status === "SHORTLISTED" || v.status === "SELECTED");

  const ids = rows.map((r) => r.id);
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  const [media, assignments] = await Promise.all([
    db.media.findMany({ where: { influencerId: { in: ids }, timestamp: { gte: since } }, orderBy: { timestamp: "desc" }, include: { influencer: { select: { handle: true, followersCount: true, followersDeclared: true } } } }),
    db.assignment.findMany({ where: { influencerId: { in: ids } }, include: { influencer: { select: { handle: true, name: true } } } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Influencer Hub";
  wb.created = new Date();

  const p = wb.addWorksheet("Profiles");
  p.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Instagram", key: "handle", width: 28 },
    { header: "Location", key: "loc", width: 22 },
    { header: "Niche", key: "niche", width: 22 },
    { header: "Audience size", key: "tier", width: 18 },
    { header: "Followers", key: "followers", width: 12 },
    { header: "Status", key: "status", width: 14 },
    { header: "Data availability", key: "elig", width: 18 },
    { header: "Score (0-100)", key: "score", width: 13 },
    { header: "Posts + reels (30d)", key: "posts", width: 18 },
    { header: "Reels (30d)", key: "reels", width: 12 },
    { header: "Engagement rate", key: "er", width: 15 },
    { header: "Avg interactions / post", key: "avgi", width: 20 },
    { header: "Avg reach (connected only)", key: "reach", width: 24 },
    { header: "Budget (INR)", key: "budget", width: 13 },
    { header: "Notes", key: "notes", width: 40 },
  ];
  for (const v of rows) {
    const s = v.summary;
    const row = p.addRow({
      name: safe(v.name),
      handle: { text: `@${v.handle}`, hyperlink: `https://www.instagram.com/${v.handle}/` },
      loc: safe(v.locations.join(", ")),
      niche: safe(v.niche),
      tier: TIER_LABELS[v.tier],
      followers: v.followers ?? "",
      status: v.status,
      elig: v.eligibility,
      score: v.score?.score ?? "",
      posts: s?.posts ?? "",
      reels: s?.reels ?? "",
      er: s?.engagementRate ?? "",
      avgi: s?.avgInteractions !== null && s?.avgInteractions !== undefined ? Math.round(s.avgInteractions) : "",
      reach: s?.hasReach ? Math.round(s.avgReach ?? 0) : "",
      budget: v.budget ?? "",
      notes: safe(v.notes),
    });
    row.getCell("er").numFmt = "0.0%";
  }
  p.getRow(1).font = { bold: true };
  p.views = [{ state: "frozen", ySplit: 1 }];
  p.autoFilter = { from: "A1", to: "P1" };

  const m = wb.addWorksheet("Posts and reels (30d)");
  m.columns = [
    { header: "Instagram", key: "handle", width: 28 },
    { header: "Date", key: "date", width: 12 },
    { header: "Type", key: "type", width: 10 },
    { header: "Likes", key: "likes", width: 10 },
    { header: "Comments", key: "comments", width: 11 },
    { header: "Saves", key: "saved", width: 9 },
    { header: "Shares", key: "shares", width: 9 },
    { header: "Views", key: "views", width: 10 },
    { header: "Reach", key: "reach", width: 10 },
    { header: "Engagement rate", key: "er", width: 15 },
    { header: "Link", key: "link", width: 40 },
  ];
  for (const x of media) {
    if (x.type === "STORY") continue;
    const f = x.influencer.followersCount ?? x.influencer.followersDeclared;
    const er = engagementRate(x as MediaRow, f);
    const r = m.addRow({
      handle: `@${x.influencer.handle}`,
      date: x.timestamp,
      type: x.type,
      likes: x.likeCount ?? "hidden",
      comments: x.commentsCount ?? "",
      saved: x.saved ?? "",
      shares: x.shares ?? "",
      views: x.views ?? "",
      reach: x.reach ?? "",
      er: er ?? "",
      link: x.permalink ? { text: x.permalink, hyperlink: x.permalink } : "",
    });
    r.getCell("date").numFmt = "dd-mmm-yyyy";
    r.getCell("er").numFmt = "0.0%";
  }
  m.getRow(1).font = { bold: true };
  m.views = [{ state: "frozen", ySplit: 1 }];

  const a = wb.addWorksheet("Assignments");
  a.columns = [
    { header: "Influencer", key: "who", width: 26 },
    { header: "Concept", key: "concept", width: 32 },
    { header: "Visit / Home", key: "voh", width: 13 },
    { header: "Visit date", key: "vd", width: 13 },
    { header: "Posting date", key: "pd", width: 13 },
    { header: "Status", key: "status", width: 12 },
    { header: "Remarks", key: "remarks", width: 36 },
  ];
  for (const x of assignments) {
    const r = a.addRow({
      who: safe(x.influencer.name ?? x.influencer.handle),
      concept: safe(x.concept),
      voh: x.visitOrHome ?? "",
      vd: x.visitDate ?? "",
      pd: x.postingDate ?? "",
      status: x.status,
      remarks: safe(x.remarks),
    });
    r.getCell("vd").numFmt = "dd-mmm-yyyy";
    r.getCell("pd").numFmt = "dd-mmm-yyyy";
  }
  a.getRow(1).font = { bold: true };

  const buffer = await wb.xlsx.writeBuffer();
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${shortlist ? "shortlist" : "influencers"}-${stamp}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
