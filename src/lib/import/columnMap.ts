// Maps spreadsheet header text to our canonical import fields.
// Alias lists come from the two real files ("Follwers", "INSTA ID", "Costing"...).

export const IMPORT_FIELDS = [
  "handle",
  "link",
  "name",
  "followers",
  "niche",
  "location",
  "budget",
  "outreach",
  "remarks",
  "visitOrHome",
  "visitDate",
  "postingDate",
  "concept",
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

/** field -> column index (into the sheet's header row), or undefined if unmapped */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export const FIELD_LABELS: Record<ImportField, string> = {
  handle: "Instagram handle",
  link: "Profile link / URL",
  name: "Name",
  followers: "Followers",
  niche: "Niche / category",
  location: "Location",
  budget: "Budget / costing",
  outreach: "Outreach status (Message, Yes/No)",
  remarks: "Remarks / notes",
  visitOrHome: "Visit / Home",
  visitDate: "Visit date",
  postingDate: "Posting date",
  concept: "Concept",
};

const ALIASES: Record<ImportField, string[]> = {
  handle: ["instagramhandle", "instahandle", "handle", "username", "instaid", "instagramid", "igid", "ighandle"],
  link: ["link", "instalink", "instagramlink", "url", "profilelink", "profileurl", "iglink"],
  name: ["name", "influencername", "fullname", "creator"],
  followers: ["followers", "follwers", "follower", "followerscount", "followercount"],
  niche: ["niche", "category", "type", "genre"],
  location: ["location", "city", "place", "area"],
  budget: ["budget", "costing", "cost", "price", "rate", "charges"],
  outreach: ["message", "yesno", "response", "outreach", "replied"],
  remarks: ["remarks", "remark", "comments", "comment", "notes", "note"],
  visitOrHome: ["visithome", "visitorhome", "visithomeshoot"],
  visitDate: ["visitdate"],
  postingDate: ["postingdate", "postdate", "dateofposting"],
  concept: ["concept", "idea", "campaign"],
};

/** "Visit/Home" -> "visithome", "Follwers " -> "follwers" */
export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<number>();
  // Exact alias matching, first alias wins in alias-list order per field.
  for (const field of IMPORT_FIELDS) {
    for (const alias of ALIASES[field]) {
      const idx = headers.findIndex((h, i) => !used.has(i) && normalizeHeader(h) === alias);
      if (idx !== -1) {
        mapping[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return mapping;
}

/** A sheet is importable if it can identify a profile from at least one column. */
export function hasProfileColumn(mapping: ColumnMapping): boolean {
  return mapping.handle !== undefined || mapping.link !== undefined;
}
