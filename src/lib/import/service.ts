import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { IMPORT_FIELDS, hasProfileColumn, type ColumnMapping, type ImportField } from "./columnMap";
import { readWorkbook, type ParsedSheet } from "./excel";
import { buildRecords, dedupeRecords, type ImportRecord, type SkippedRow } from "./records";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface SheetConfig {
  name: string;
  include: boolean;
  mapping: ColumnMapping;
}

export interface ImportPlan {
  rowsRead: number;
  /** unique profiles after merging duplicates within the upload */
  unique: number;
  duplicatesInFile: number;
  duplicateHandles: string[];
  willCreate: number;
  willUpdate: number;
  skipped: SkippedRow[];
  warnings: { handle: string; messages: string[] }[];
  sample: ImportRecord[];
}

/** Parses the config sent by the client, ignoring anything that is not a valid mapping. */
export function parseSheetConfigs(raw: unknown, sheets: ParsedSheet[]): SheetConfig[] {
  const byName = new Map<string, Record<string, unknown>>();
  if (Array.isArray(raw)) {
    for (const c of raw) if (c && typeof c === "object" && typeof (c as { name?: unknown }).name === "string") byName.set((c as { name: string }).name, c as Record<string, unknown>);
  }
  return sheets.map((s) => {
    const given = byName.get(s.name);
    if (!given) return { name: s.name, include: s.importable, mapping: s.mapping };
    const mapping: ColumnMapping = {};
    const m = (given.mapping ?? {}) as Record<string, unknown>;
    for (const f of IMPORT_FIELDS) {
      const v = m[f];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < s.headers.length) mapping[f as ImportField] = v;
    }
    return { name: s.name, include: given.include === true && hasProfileColumn(mapping), mapping };
  });
}

export async function buildPlan(sheets: ParsedSheet[], configs: SheetConfig[], fileName: string) {
  const all: ImportRecord[] = [];
  const skipped: SkippedRow[] = [];
  let rowsRead = 0;
  for (const cfg of configs) {
    if (!cfg.include) continue;
    const sheet = sheets.find((s) => s.name === cfg.name);
    if (!sheet) continue;
    const built = buildRecords(sheet, cfg.mapping, fileName);
    all.push(...built.records);
    skipped.push(...built.skipped);
    rowsRead += built.records.length + built.skipped.length;
  }
  const d = dedupeRecords(all);
  const existing = new Set(
    (await db.influencer.findMany({ where: { handle: { in: d.records.map((r) => r.handle) } }, select: { handle: true } })).map((e) => e.handle),
  );
  const plan: ImportPlan = {
    rowsRead,
    unique: d.records.length,
    duplicatesInFile: d.duplicatesMerged,
    duplicateHandles: d.duplicateHandles,
    willCreate: d.records.filter((r) => !existing.has(r.handle)).length,
    willUpdate: d.records.filter((r) => existing.has(r.handle)).length,
    skipped,
    warnings: d.records.filter((r) => r.warnings.length).map((r) => ({ handle: r.handle, messages: r.warnings })),
    sample: d.records.slice(0, 8),
  };
  return { plan, records: d.records };
}

/**
 * Writes the records. Existing influencers are only ever *filled in*: a value already in the
 * database (including anything the team edited, like status, notes and budget) is never overwritten.
 */
export async function commitRecords(records: ImportRecord[], fileName: string, userEmail: string, plan: ImportPlan) {
  const CHUNK = 50;
  let created = 0;
  let merged = 0;

  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const existing = new Map(
      (await db.influencer.findMany({ where: { handle: { in: chunk.map((r) => r.handle) } } })).map((e) => [e.handle, e]),
    );
    const ops: Prisma.PrismaPromise<unknown>[] = [];

    for (const r of chunk) {
      const cur = existing.get(r.handle);
      if (!cur) {
        created++;
        ops.push(
          db.influencer.create({
            data: {
              handle: r.handle,
              name: r.name,
              niche: r.niche,
              locations: r.locations,
              followersDeclared: r.followers,
              budget: r.budget,
              outreachStatus: r.outreach,
              notes: r.remarks,
              sources: r.sources,
              assignments: r.assignment ? { create: [r.assignment] } : undefined,
            },
          }),
        );
      } else {
        merged++;
        ops.push(
          db.influencer.update({
            where: { id: cur.id },
            data: {
              name: cur.name ?? r.name,
              niche: cur.niche ?? r.niche,
              followersDeclared: cur.followersDeclared ?? r.followers,
              budget: cur.budget ?? r.budget,
              outreachStatus: cur.outreachStatus ?? r.outreach,
              notes: cur.notes ?? r.remarks,
              locations: [...new Set([...cur.locations, ...r.locations])],
              sources: [...new Set([...cur.sources, ...r.sources])],
            },
          }),
        );
        if (r.assignment) {
          ops.push(db.assignment.create({ data: { influencerId: cur.id, ...r.assignment } }));
        }
      }
    }
    await db.$transaction(ops);
  }

  const batch = await db.importBatch.create({
    data: {
      filename: fileName,
      rowsRead: plan.rowsRead,
      created,
      merged: merged + plan.duplicatesInFile,
      skipped: plan.skipped.length,
      createdBy: userEmail,
    },
  });
  return { batchId: batch.id, created, merged };
}

export async function parseUpload(file: File) {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new UserError("Please upload an .xlsx file. If yours is .xls or .csv, open it in Excel and Save As .xlsx.");
  }
  if (file.size > MAX_UPLOAD_BYTES) throw new UserError("That file is larger than 10 MB.");
  try {
    return await readWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch {
    throw new UserError("That file could not be read as an Excel workbook. Is it corrupted or password-protected?");
  }
}

export class UserError extends Error {}
