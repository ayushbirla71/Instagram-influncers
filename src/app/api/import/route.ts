import { NextResponse } from "next/server";
import { currentUserEmail } from "@/lib/session";
import { buildPlan, commitRecords, parseSheetConfigs, parseUpload, UserError } from "@/lib/import/service";

// POST multipart: file, mode = "preview" | "plan" | "commit", config = JSON [{name, include, mapping}]
export async function POST(request: Request) {
  const email = await currentUserEmail();
  if (!email) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    const mode = String(form.get("mode") ?? "preview");

    const sheets = await parseUpload(file);

    if (mode === "preview") {
      return NextResponse.json({
        fileName: file.name,
        sheets: sheets.map((s) => ({
          name: s.name,
          headers: s.headers,
          mapping: s.mapping,
          importable: s.importable,
          rowCount: s.rows.length,
          sample: s.rows.slice(0, 3).map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c === null ? "" : String(c)))),
        })),
      });
    }

    let rawConfig: unknown = null;
    try {
      rawConfig = JSON.parse(String(form.get("config") ?? "null"));
    } catch {
      return NextResponse.json({ error: "Invalid column configuration" }, { status: 400 });
    }
    const configs = parseSheetConfigs(rawConfig, sheets);
    if (!configs.some((c) => c.include)) {
      return NextResponse.json({ error: "Select at least one sheet that has an Instagram handle or link column." }, { status: 400 });
    }

    const { plan, records } = await buildPlan(sheets, configs, file.name);
    if (mode === "plan") return NextResponse.json({ plan });
    if (mode === "commit") {
      const result = await commitRecords(records, file.name, email, plan);
      return NextResponse.json({ plan, result });
    }
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (err) {
    if (err instanceof UserError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("import failed", err);
    return NextResponse.json({ error: "Import failed unexpectedly. Some rows may already be saved; running the same file again is safe, because it only fills in blanks." }, { status: 500 });
  }
}
