import ExcelJS from "exceljs";
import { autoMapColumns, hasProfileColumn, type ColumnMapping } from "./columnMap";

export type Cell = string | number | Date | null;

export interface ParsedSheet {
  name: string;
  headers: string[];
  rows: Cell[][]; // data rows only, header excluded
  /** 1-based sheet row number for each entry of `rows` (for error messages) */
  rowNumbers: number[];
  mapping: ColumnMapping;
  importable: boolean;
}

function toCell(v: ExcelJS.CellValue): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number" || typeof v === "string") {
    if (typeof v === "string") {
      const t = v.trim();
      return t === "" ? null : t;
    }
    return v;
  }
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "object") {
    const o = v as unknown as Record<string, unknown>;
    // hyperlink cell: { text, hyperlink }
    if ("hyperlink" in o && typeof o.hyperlink === "string") {
      const text = typeof o.text === "string" ? o.text : "";
      // Prefer the real URL if the visible text is empty or not itself a URL
      return /instagram\.com/i.test(text) ? text : o.hyperlink;
    }
    if ("richText" in o && Array.isArray(o.richText)) {
      const s = (o.richText as { text: string }[]).map((r) => r.text).join("").trim();
      return s === "" ? null : s;
    }
    if ("result" in o) return toCell(o.result as ExcelJS.CellValue);
    if ("text" in o && typeof o.text === "string") return o.text.trim() || null;
  }
  return null;
}

/** Reads every worksheet; the first non-empty row of each is taken as the header row. */
export async function readWorkbook(data: ArrayBuffer | Buffer): Promise<ParsedSheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ArrayBuffer);
  const sheets: ParsedSheet[] = [];

  wb.eachSheet((ws) => {
    const grid: { rowNumber: number; cells: Cell[] }[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: Cell[] = [];
      const colCount = Math.max(row.cellCount, ws.columnCount);
      for (let c = 1; c <= colCount; c++) cells.push(toCell(row.getCell(c).value));
      if (cells.some((c) => c !== null)) grid.push({ rowNumber, cells });
    });

    if (grid.length === 0) {
      sheets.push({ name: ws.name, headers: [], rows: [], rowNumbers: [], mapping: {}, importable: false });
      return;
    }

    const headerRow = grid[0];
    // Trim trailing empty header cells but keep inner blanks so indexes stay aligned.
    let last = headerRow.cells.length - 1;
    while (last >= 0 && headerRow.cells[last] === null) last--;
    const headers = headerRow.cells.slice(0, last + 1).map((c) => (c === null ? "" : String(c).trim()));

    const mapping = autoMapColumns(headers);
    const body = grid.slice(1);
    sheets.push({
      name: ws.name,
      headers,
      rows: body.map((r) => r.cells),
      rowNumbers: body.map((r) => r.rowNumber),
      mapping,
      importable: hasProfileColumn(mapping),
    });
  });

  return sheets;
}
