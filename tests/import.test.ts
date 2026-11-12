import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nicheTags } from "@/lib/niche";
import { extractHandle, normalizeLocations, parseCount } from "@/lib/import/normalize";
import { readWorkbook } from "@/lib/import/excel";
import { buildRecords, dedupeRecords, type ImportRecord } from "@/lib/import/records";

const fixture = (f: string) => readFileSync(path.join(__dirname, "fixtures", f));

describe("parseCount", () => {
  it.each([
    ["15.6k", 15600],
    ["50 k", 50000],
    ["612K", 612000],
    ["58.4k", 58400],
    ["12.2K", 12200],
    ["1.2M", 1200000],
    ["1.2L", 120000],
    ["12,345", 12345],
    ["60K", 60000],
    [9000, 9000],
    ["151.k", 151000], // stray dot seen in the real file
  ])("%s -> %s", (input, expected) => {
    expect(parseCount(input)).toBe(expected);
  });
  it.each(["", "abc", null, undefined, "k", "-5"])("rejects %s", (input) => {
    expect(parseCount(input)).toBeNull();
  });
});

describe("extractHandle", () => {
  it("reads bare handles", () => {
    expect(extractHandle("taste_n_trends_vijayawada_")).toBe("taste_n_trends_vijayawada_");
    expect(extractHandle("  _.harshitha.naidu._ ")).toBe("_.harshitha.naidu._");
    expect(extractHandle("@Raga_Kopparapu")).toBe("raga_kopparapu");
  });
  it("reads full URLs and drops tracking params", () => {
    expect(
      extractHandle("https://www.instagram.com/bezawada_mastan_official?utm_source=ig_web_button_share_sheet&igsh=ZDNl=="),
    ).toBe("bezawada_mastan_official");
    expect(extractHandle("https://www.instagram.com/likkyyyyy_/")).toBe("likkyyyyy_");
    expect(extractHandle("instagram.com/foo.bar")).toBe("foo.bar");
  });
  it("rejects non-profile URLs and junk", () => {
    expect(extractHandle("https://www.instagram.com/reel/ABC123/")).toBeNull();
    expect(extractHandle("not a handle!")).toBeNull();
    expect(extractHandle("")).toBeNull();
    expect(extractHandle(null)).toBeNull();
  });
});

describe("normalizeLocations", () => {
  it("splits and canonicalises", () => {
    expect(normalizeLocations("vijayawada,hyderabad")).toEqual(["Vijayawada", "Hyderabad"]);
    expect(normalizeLocations("eluru,vijayawada,vizag,hyd")).toEqual(["Eluru", "Vijayawada", "Visakhapatnam", "Hyderabad"]);
    expect(normalizeLocations("rajhamundry")).toEqual(["Rajahmundry"]);
    expect(normalizeLocations("Vizag")).toEqual(["Visakhapatnam"]);
    expect(normalizeLocations("bezawada")).toEqual(["Vijayawada"]);
  });
  it("dedupes and handles empties / unknown places", () => {
    expect(normalizeLocations("vijayawada, Vijayawada")).toEqual(["Vijayawada"]);
    expect(normalizeLocations("")).toEqual([]);
    expect(normalizeLocations(null)).toEqual([]);
    expect(normalizeLocations("machilipatanam")).toEqual(["Machilipatnam"]);
    expect(normalizeLocations("some town")).toEqual(["Some Town"]);
  });
});

describe("real fixture: vijayawada.xlsx", () => {
  it("detects both sheets as importable with mapped columns", async () => {
    const sheets = await readWorkbook(fixture("vijayawada.xlsx"));
    expect(sheets.map((s) => s.name)).toEqual(["Sheet1", "Sheet2"]);
    expect(sheets.every((s) => s.importable)).toBe(true);
    const s1 = sheets[0];
    expect(s1.mapping.link).toBe(2);
    expect(s1.mapping.followers).toBe(1);
    expect(s1.mapping.location).toBe(3);
    expect(s1.mapping.outreach).toBe(4);
  });

  it("imports 123 rows from Sheet1 and dedupes to 109 unique profiles", async () => {
    const [s1] = await readWorkbook(fixture("vijayawada.xlsx"));
    const { records } = buildRecords(s1, s1.mapping, "vijayawada.xlsx");
    expect(records.length).toBe(123);
    const d = dedupeRecords(records);
    // Raw cell text has 114 distinct strings, but from row 57 down the cells hold full URLs
    // while earlier rows hold bare handles. Normalising both to a handle exposes 5 more
    // duplicates: e.g. divya_deevi (rows 32 + 71), that_telugu.girl (26 + 89), raga_kopparapu (6 + 99).
    expect(d.records.length).toBe(109);
    expect(d.duplicatesMerged).toBe(14);
    for (const h of ["divya_deevi", "that_telugu.girl", "raga_kopparapu"]) {
      expect(d.duplicateHandles).toContain(h);
      expect(d.records.filter((r) => r.handle === h)).toHaveLength(1);
    }
    // The link target, not the visible label, decides the handle (label said "priyanka_rukmin")
    expect(d.records.some((r) => r.handle === "priyanka_rukmini")).toBe(true);
    expect(d.records.some((r) => r.handle === "priyanka_rukmin")).toBe(false);
    const iswarya = d.records.find((r) => r.handle === "taste_n_trends_vijayawada_")!;
    expect(iswarya.followers).toBe(15600);
    expect(iswarya.locations).toEqual(["Vijayawada"]);
    expect(d.records.find((r) => r.handle === "itsbv_official")!.followers).toBe(50000); // "50 k"
  });

  it("turns Sheet2 remarks into remarks and reads a URL-in-link row", async () => {
    const sheets = await readWorkbook(fixture("vijayawada.xlsx"));
    const s2 = sheets[1];
    const { records } = buildRecords(s2, s2.mapping, "vijayawada.xlsx");
    const prashu = records.find((r) => r.handle === "_prashu_3125_")!;
    expect(prashu.remarks).toMatch(/need to go with sare/);
    expect(records.some((r) => r.handle === "likkyyyyy_")).toBe(true);
    // no dates/concepts filled in the file => no assignment seeds
    expect(records.every((r) => r.assignment === null)).toBe(true);
  });
});

describe("real fixture: ap-tg-200.xlsx", () => {
  it("maps both sheets", async () => {
    const sheets = await readWorkbook(fixture("ap-tg-200.xlsx"));
    expect(sheets.map((s) => s.name)).toEqual(["Insta influencers data", "Sheet1"]);
    expect(sheets.every((s) => s.importable)).toBe(true);
    const premium = sheets[1];
    expect(premium.mapping.handle).toBe(1); // INSTA ID
    expect(premium.mapping.link).toBe(3); // Insta Link
    expect(premium.mapping.followers).toBe(4); // "Follwers " (typo)
    expect(premium.mapping.budget).toBe(2);
  });

  it("imports the main list with followers, niche, location, outreach", async () => {
    const [main] = await readWorkbook(fixture("ap-tg-200.xlsx"));
    const { records, skipped } = buildRecords(main, main.mapping, "ap-tg-200.xlsx");
    expect(records.length).toBeGreaterThanOrEqual(198);
    const mastan = records.find((r) => r.handle === "bezawada_mastan_official")!;
    expect(mastan.followers).toBe(212300);
    expect(mastan.niche).toBe("Comedy/Entertainment");
    expect(mastan.locations).toEqual(["Vijayawada"]);
    expect(mastan.outreach).toBe("Sent");
    expect(skipped.length).toBeLessThanOrEqual(3);
  });

  it("uses the link handle when the handle column is mistyped", async () => {
    const sheets = await readWorkbook(fixture("ap-tg-200.xlsx"));
    const premium = sheets[1];
    const { records } = buildRecords(premium, premium.mapping, "ap-tg-200.xlsx");
    expect(records.some((r) => r.handle === "rohinireddy_uppada")).toBe(true);
    expect(records.some((r) => r.handle === "ohinireddy_uppada")).toBe(false);
    const roh = records.find((r) => r.handle === "rohinireddy_uppada")!;
    expect(roh.budget).toBe(35000);
    expect(roh.followers).toBe(283000);
    expect(roh.warnings.some((w) => /used the link/.test(w))).toBe(true);
  });
});

describe("both files merged", () => {
  it("yields a few hundred unique influencers with the same people merged across files", async () => {
    const all: ImportRecord[] = [];
    for (const [file, name] of [
      ["vijayawada.xlsx", "vijayawada.xlsx"],
      ["ap-tg-200.xlsx", "ap-tg-200.xlsx"],
    ] as const) {
      for (const sheet of await readWorkbook(fixture(file))) {
        if (!sheet.importable) continue;
        all.push(...buildRecords(sheet, sheet.mapping, name).records);
      }
    }
    const d = dedupeRecords(all);
    expect(d.records.length).toBeGreaterThan(250);
    expect(d.records.length).toBeLessThan(all.length);
    // food_and_the_city___ appears in both files with different follower counts (17K vs 18.5k)
    const both = d.records.find((r) => r.handle === "food_and_the_city___")!;
    expect(both.sources.length).toBeGreaterThanOrEqual(2);
    expect(both.followers).toBe(18500);
    // every handle unique
    expect(new Set(d.records.map((r) => r.handle)).size).toBe(d.records.length);
  });
});

describe("swapped Followers/Link cells (real data problem in vijayawada.xlsx Sheet1)", () => {
  it("never creates an influencer whose handle is really a follower count", async () => {
    const all: ImportRecord[] = [];
    for (const [file, name] of [
      ["vijayawada.xlsx", "vijayawada.xlsx"],
      ["ap-tg-200.xlsx", "ap-tg-200.xlsx"],
    ] as const) {
      for (const sheet of await readWorkbook(fixture(file))) {
        if (sheet.importable) all.push(...buildRecords(sheet, sheet.mapping, name).records);
      }
    }
    const bogus = all.filter((r) => parseCount(r.handle) !== null).map((r) => r.handle);
    expect(bogus).toEqual([]);
  });

  it("corrects swapped rows: real handle, real follower count, and a warning", async () => {
    const sheets = await readWorkbook(fixture("vijayawada.xlsx"));
    const s1 = sheets[0];
    const { records } = buildRecords(s1, s1.mapping, "vijayawada.xlsx");
    expect(records.filter((x) => x.warnings.some((w) => /swapped/.test(w))).length).toBe(16);
    const r = records.find((x) => x.handle === "ilove_guntur")!;
    expect(r).toBeDefined();
    expect(r.followers).toBe(63000);
    expect(r.warnings.some((w) => /swapped/.test(w))).toBe(true);
    const khaju = records.find((x) => x.handle === "khajuhoneysk")!;
    expect(khaju.followers).toBe(92000);
  });

  it("reads a typo'd follower value like 151.k", async () => {
    const sheets = await readWorkbook(fixture("vijayawada.xlsx"));
    const { records } = buildRecords(sheets[0], sheets[0].mapping, "vijayawada.xlsx");
    expect(records.find((x) => x.handle === "sravanireddy_pulusu")!.followers).toBe(151000);
  });
});

describe("nicheTags (real values from ap-tg-200.xlsx)", () => {
  it.each([
    ["Lifestyle/Entertainment", ["Lifestyle", "Entertainment"]],
    ["Travel • Food • Culture • Lifestyle", ["Travel", "Food", "Culture", "Lifestyle"]],
    ["Food - Travel - Lifestyle", ["Food", "Travel", "Lifestyle"]],
    ["Fashion | Lifestyle ✨", ["Fashion", "Lifestyle"]],
    ["Food🍔 Travel🚂 Lifestyle 👔 Temples", ["Food", "Travel", "Lifestyle", "Temples"]],
    ["Fashion & Lifestyle vlogger", ["Fashion", "Lifestyle"]],
    ["Telugu Lifestyle Creator", ["Lifestyle"]],
    ["??Fashion | Lifestyle | Actor", ["Fashion", "Lifestyle", "Actor"]],
  ])("%s", (input, expected) => {
    expect(nicheTags(input)).toEqual(expected);
  });
  it("handles empty input", () => {
    expect(nicheTags(null)).toEqual([]);
    expect(nicheTags("  ")).toEqual([]);
  });
});
