import type { ColumnMapping } from "./columnMap";
import type { Cell, ParsedSheet } from "./excel";
import { cleanText, extractHandle, normalizeLocations, parseBudget, parseFollowers } from "./normalize";

export interface AssignmentSeed {
  concept: string | null;
  visitOrHome: string | null;
  visitDate: Date | null;
  postingDate: Date | null;
  remarks: string | null;
}

export interface ImportRecord {
  handle: string;
  name: string | null;
  followers: number | null;
  niche: string | null;
  locations: string[];
  budget: number | null;
  outreach: string | null;
  remarks: string | null;
  assignment: AssignmentSeed | null;
  sources: string[]; // "<file> / <sheet>"
  warnings: string[];
}

export interface SkippedRow {
  source: string;
  rowNumber: number;
  reason: string;
}

export interface BuildResult {
  records: ImportRecord[]; // one per spreadsheet row, NOT yet deduped
  skipped: SkippedRow[];
}

function cellText(cell: Cell | undefined): string | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell.toISOString();
  return cleanText(cell);
}

function cellDate(cell: Cell | undefined): Date | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell;
  if (typeof cell === "number") {
    // Excel serial date (days since 1899-12-30)
    if (cell > 20000 && cell < 80000) return new Date(Math.round((cell - 25569) * 86400 * 1000));
    return null;
  }
  const d = new Date(cell);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Turns the rows of one sheet into normalised records using the given column mapping. */
export function buildRecords(sheet: ParsedSheet, mapping: ColumnMapping, fileName: string): BuildResult {
  const source = `${fileName} / ${sheet.name}`;
  const records: ImportRecord[] = [];
  const skipped: SkippedRow[] = [];

  sheet.rows.forEach((row, i) => {
    const rowNumber = sheet.rowNumbers[i];
    const get = (f: keyof ColumnMapping) => (mapping[f] === undefined ? undefined : row[mapping[f]!]);

    const warnings: string[] = [];
    let linkCell = get("link");
    let handleCell = get("handle");
    let followersCell = get("followers");

    // Some rows in the real files have the Followers and Link cells swapped (the link cell holds
    // "63k" and the followers cell holds the profile URL). "63k" is a syntactically valid handle,
    // so without this check we would create an influencer literally named "63k".
    const idCell = linkCell ?? handleCell;
    if (
      idCell !== null && idCell !== undefined &&
      parseFollowers(idCell) !== null &&
      typeof followersCell === "string" && /instagram\.com/i.test(followersCell)
    ) {
      const followersValue = idCell;
      if (linkCell !== null && linkCell !== undefined) linkCell = followersCell;
      else handleCell = followersCell;
      followersCell = followersValue;
      warnings.push("Followers and link looked swapped in this row; corrected");
    }

    const fromLink = extractHandle(linkCell);
    const fromHandle = extractHandle(handleCell);
    // The link is the ground truth: people mistype the handle column
    // (e.g. "ohinireddy_uppada" vs link ".../rohinireddy_uppada").
    const handle = fromLink ?? fromHandle;

    if (!handle) {
      // Only report rows that had something in the profile columns; rows like
      // a lone serial number ("9") are just spreadsheet leftovers.
      const unreadable = linkCell ?? handleCell;
      if (unreadable !== null && unreadable !== undefined) {
        skipped.push({ source, rowNumber, reason: `Could not read an Instagram handle from "${String(unreadable)}"` });
      }
      return;
    }
    if (fromLink && fromHandle && fromLink !== fromHandle) {
      warnings.push(`Handle column says "${fromHandle}" but link says "${fromLink}"; used the link`);
    }

    const followersRaw = followersCell;
    const followers = parseFollowers(followersRaw);
    if (followers === null && followersRaw !== null && followersRaw !== undefined) {
      warnings.push(`Could not read followers "${String(followersRaw)}"`);
    }
    const budgetRaw = get("budget");
    const budget = parseBudget(budgetRaw);
    if (budget === null && budgetRaw !== null && budgetRaw !== undefined) {
      warnings.push(`Could not read budget "${String(budgetRaw)}"`);
    }

    const visitOrHome = cellText(get("visitOrHome"));
    const visitDate = cellDate(get("visitDate"));
    const postingDate = cellDate(get("postingDate"));
    const concept = cellText(get("concept"));
    const remarks = cellText(get("remarks"));
    const assignment: AssignmentSeed | null =
      visitOrHome || visitDate || postingDate || concept
        ? { concept, visitOrHome, visitDate, postingDate, remarks }
        : null;

    records.push({
      handle,
      name: cellText(get("name")),
      followers,
      niche: cellText(get("niche")),
      locations: normalizeLocations(cellText(get("location"))),
      budget,
      outreach: cellText(get("outreach")),
      remarks,
      assignment,
      sources: [source],
      warnings,
    });
  });

  return { records, skipped };
}

function pick<T>(a: T | null, b: T | null): T | null {
  return a !== null && a !== undefined && (a as unknown) !== "" ? a : b;
}

/** Merge two records for the same handle: first non-empty wins, locations/sources unioned. */
export function mergeRecords(a: ImportRecord, b: ImportRecord): ImportRecord {
  return {
    handle: a.handle,
    name: pick(a.name, b.name),
    // different follower counts across files: keep the larger (API refresh will correct it)
    followers: a.followers !== null && b.followers !== null ? Math.max(a.followers, b.followers) : pick(a.followers, b.followers),
    niche: pick(a.niche, b.niche),
    locations: [...new Set([...a.locations, ...b.locations])],
    budget: pick(a.budget, b.budget),
    outreach: pick(a.outreach, b.outreach),
    remarks: pick(a.remarks, b.remarks),
    assignment: pick(a.assignment, b.assignment),
    sources: [...new Set([...a.sources, ...b.sources])],
    warnings: [...new Set([...a.warnings, ...b.warnings])],
  };
}

export interface DedupeResult {
  records: ImportRecord[]; // unique by handle, in first-seen order
  duplicatesMerged: number; // how many extra rows were folded into earlier ones
  duplicateHandles: string[];
}

export function dedupeRecords(records: ImportRecord[]): DedupeResult {
  const byHandle = new Map<string, ImportRecord>();
  const dupes = new Set<string>();
  let merged = 0;
  for (const r of records) {
    const existing = byHandle.get(r.handle);
    if (existing) {
      byHandle.set(r.handle, mergeRecords(existing, r));
      merged++;
      dupes.add(r.handle);
    } else {
      byHandle.set(r.handle, r);
    }
  }
  return { records: [...byHandle.values()], duplicatesMerged: merged, duplicateHandles: [...dupes] };
}
