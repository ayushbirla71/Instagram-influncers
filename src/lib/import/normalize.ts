// Pure normalisation helpers for messy spreadsheet values.
// Every function is total: bad input yields null/[] rather than throwing.

const RESERVED_PATHS = new Set([
  "p",
  "reel",
  "reels",
  "tv",
  "stories",
  "explore",
  "accounts",
  "direct",
  "s",
]);

const HANDLE_RE = /^[a-z0-9._]{1,30}$/;

/**
 * "15.6k" -> 15600, "50 k" -> 50000, "612K" -> 612000, "1.2M" -> 1200000,
 * "1.2L"/"1.2 lakh" -> 120000 (Indian numbering), "12,345" -> 12345.
 */
export function parseCount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null;
  }
  const s = String(raw).trim().toLowerCase().replace(/[,\s]/g, "");
  // `\.?` tolerates a stray dot before the suffix ("151.k" -> 151K), seen in the real files.
  const m = s.match(/^(\d+(?:\.\d+)?)\.?(k|m|l|lakh|lakhs|cr|crore)?\+?$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult =
    m[2] === "k"
      ? 1_000
      : m[2] === "m"
        ? 1_000_000
        : m[2] === "l" || m[2] === "lakh" || m[2] === "lakhs"
          ? 100_000
          : m[2] === "cr" || m[2] === "crore"
            ? 10_000_000
            : 1;
  return Math.round(n * mult);
}

export const parseFollowers = parseCount;
export const parseBudget = parseCount;

/**
 * Extracts a lowercase Instagram handle from a full URL (with tracking
 * params), a bare handle, or "@handle". Returns null if nothing valid.
 */
export function extractHandle(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;

  if (/instagram\.com/i.test(s) || /^https?:\/\//i.test(s)) {
    try {
      const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
      const first = url.pathname.split("/").filter(Boolean)[0];
      if (!first || RESERVED_PATHS.has(first.toLowerCase())) return null;
      s = first;
    } catch {
      return null;
    }
  }

  // A bare handle never contains whitespace. Reject free text such as
  // "need to go with saree" instead of grabbing its first word.
  if (/\s/.test(s)) return null;

  s = s.replace(/^@+/, "").split(/[?#/]/)[0].toLowerCase();
  return HANDLE_RE.test(s) ? s : null;
}

const LOCATION_ALIASES: Record<string, string> = {
  vijayawada: "Vijayawada",
  bezawada: "Vijayawada",
  vja: "Vijayawada",
  guntur: "Guntur",
  hyderabad: "Hyderabad",
  hyd: "Hyderabad",
  secunderabad: "Hyderabad",
  vizag: "Visakhapatnam",
  visakhapatnam: "Visakhapatnam",
  vishakapatnam: "Visakhapatnam",
  vishakhapatnam: "Visakhapatnam",
  visakhapatanam: "Visakhapatnam",
  vijayanagaram: "Vizianagaram",
  vizianagaram: "Vizianagaram",
  vijayanagram: "Vizianagaram",
  kakinada: "Kakinada",
  eluru: "Eluru",
  rajhamundry: "Rajahmundry",
  rajamundry: "Rajahmundry",
  rajahmundry: "Rajahmundry",
  rajamahendravaram: "Rajahmundry",
  tirupati: "Tirupati",
  nellore: "Nellore",
  bhimavaram: "Bhimavaram",
  machilipatanam: "Machilipatnam",
  machilipatnam: "Machilipatnam",
  machilipatam: "Machilipatnam",
};

function titleCase(s: string): string {
  return s.replace(/\b([a-z])/g, (c) => c.toUpperCase());
}

/** "vijayawada,hyderabad" -> ["Vijayawada","Hyderabad"]; typos and aliases canonicalised. */
export function normalizeLocations(raw: unknown): string[] {
  if (raw === null || raw === undefined) return [];
  const parts = String(raw)
    .split(/[,;/&|]|\band\b/i)
    .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    const canon = LOCATION_ALIASES[p] ?? titleCase(p);
    if (!out.includes(canon)) out.push(canon);
  }
  return out;
}

export function cleanText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/\s+/g, " ").trim();
  return s ? s : null;
}
