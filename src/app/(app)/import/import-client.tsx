"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Card, buttonClass, Badge } from "@/components/ui";
import { FIELD_LABELS, IMPORT_FIELDS, type ColumnMapping, type ImportField } from "@/lib/import/columnMap";

interface SheetPreview {
  name: string;
  headers: string[];
  mapping: ColumnMapping;
  importable: boolean;
  rowCount: number;
  sample: string[][];
}
interface SheetState extends SheetPreview {
  include: boolean;
}
interface Plan {
  rowsRead: number;
  unique: number;
  duplicatesInFile: number;
  duplicateHandles: string[];
  willCreate: number;
  willUpdate: number;
  skipped: { source: string; rowNumber: number; reason: string }[];
  warnings: { handle: string; messages: string[] }[];
}

type Step = "choose" | "map" | "review" | "done";

export function ImportClient() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<{ created: number; merged: number } | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = () => JSON.stringify(sheets.map((s) => ({ name: s.name, include: s.include, mapping: s.mapping })));

  async function post(mode: "preview" | "plan" | "commit", f: File) {
    const form = new FormData();
    form.set("file", f);
    form.set("mode", mode);
    if (mode !== "preview") form.set("config", config());
    const res = await fetch("/api/import", { method: "POST", body: form });
    const json = await res.json().catch(() => ({ error: "Unexpected response from the server" }));
    if (!res.ok) throw new Error(json.error ?? "Request failed");
    return json;
  }

  async function onFile(f: File | null) {
    setError(null);
    setFile(f);
    if (!f) return;
    setBusy(true);
    try {
      const json = await post("preview", f);
      setSheets((json.sheets as SheetPreview[]).map((s) => ({ ...s, include: s.importable })));
      setStep("map");
    } catch (e) {
      setError((e as Error).message);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  async function review() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const json = await post("plan", file);
      setPlan(json.plan);
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const json = await post("commit", file);
      setResult(json.result);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setSheets([]);
    setPlan(null);
    setResult(null);
    setStep("choose");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function setMap(sheetName: string, field: ImportField, value: string) {
    setSheets((prev) =>
      prev.map((s) => {
        if (s.name !== sheetName) return s;
        const mapping = { ...s.mapping };
        if (value === "") delete mapping[field];
        else mapping[field] = Number(value);
        const hasProfile = mapping.handle !== undefined || mapping.link !== undefined;
        return { ...s, mapping, include: s.include && hasProfile };
      }),
    );
  }

  const anyIncluded = sheets.some((s) => s.include);

  return (
    <div className="space-y-5">
      {error ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}

      {step === "choose" && (
        <Card>
          <label
            htmlFor="file"
            className="flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed border-line px-6 py-12 text-center hover:bg-surface-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <span className="text-base font-semibold">{busy ? "Reading file…" : "Drop an .xlsx file here, or click to choose"}</span>
            <span className="mt-1 text-sm text-muted">Up to 10 MB. Every sheet is checked for a handle or link column.</span>
            <input
              id="file"
              ref={fileRef}
              type="file"
              accept=".xlsx"
              className="sr-only"
              disabled={busy}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </Card>
      )}

      {step === "map" && (
        <>
          <p className="text-sm text-muted">
            <strong className="text-text">{file?.name}</strong>: check which sheets to import and that each column is matched correctly. We guessed from the headers.
          </p>
          {sheets.map((s) => (
            <Card
              key={s.name}
              title={
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={s.include}
                      disabled={s.mapping.handle === undefined && s.mapping.link === undefined}
                      onChange={(e) => setSheets((p) => p.map((x) => (x.name === s.name ? { ...x, include: e.target.checked } : x)))}
                    />
                    <span>Sheet “{s.name}”</span>
                  </label>
                  <Badge tone={s.importable ? "good" : "warn"}>{s.rowCount} rows</Badge>
                  {!s.importable && <Badge tone="warn">no handle or link column found</Badge>}
                </span>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {IMPORT_FIELDS.map((f) => (
                  <label key={f} className="block text-xs font-medium text-muted">
                    {FIELD_LABELS[f]}
                    <select
                      className="mt-1 w-full rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-text"
                      value={s.mapping[f] ?? ""}
                      onChange={(e) => setMap(s.name, f, e.target.value)}
                    >
                      <option value="">— not in file —</option>
                      {s.headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `(column ${i + 1})`}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {s.sample.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-muted">
                        {s.headers.map((h, i) => (
                          <th key={i} className="px-2 py-1 font-medium">
                            {h || "—"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.sample.map((row, r) => (
                        <tr key={r} className="border-t border-line">
                          {s.headers.map((_, i) => (
                            <td key={i} className="max-w-48 truncate px-2 py-1">
                              {row[i]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
          <div className="flex gap-2">
            <button className={buttonClass("primary")} disabled={busy || !anyIncluded} onClick={review}>
              {busy ? "Checking…" : "Check import"}
            </button>
            <button className={buttonClass("ghost")} onClick={reset} disabled={busy}>
              Start over
            </button>
          </div>
        </>
      )}

      {step === "review" && plan && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Rows read" value={plan.rowsRead} />
            <Tile label="Unique influencers" value={plan.unique} />
            <Tile label="New" value={plan.willCreate} tone="good" />
            <Tile label="Already in platform (filled in, not overwritten)" value={plan.willUpdate} />
          </div>
          {plan.duplicatesInFile > 0 && (
            <Card title={`${plan.duplicatesInFile} duplicate rows merged inside this file`}>
              <p className="text-sm text-muted">The same profile appeared more than once (for example as a bare handle and as a full link).</p>
              <p className="mt-2 text-xs break-words text-muted">{plan.duplicateHandles.slice(0, 30).join(", ")}{plan.duplicateHandles.length > 30 ? ", …" : ""}</p>
            </Card>
          )}
          {plan.skipped.length > 0 && (
            <Card title={`${plan.skipped.length} rows skipped`}>
              <ul className="space-y-1 text-sm text-muted">
                {plan.skipped.slice(0, 15).map((s, i) => (
                  <li key={i}>
                    {s.source}, row {s.rowNumber}: {s.reason}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {plan.warnings.length > 0 && (
            <Card title={`${plan.warnings.length} rows imported with notes`}>
              <ul className="space-y-1 text-sm text-muted">
                {plan.warnings.slice(0, 15).map((w) => (
                  <li key={w.handle}>
                    <strong className="text-text">{w.handle}</strong>: {w.messages.join("; ")}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <div className="flex gap-2">
            <button className={buttonClass("primary")} disabled={busy || plan.unique === 0} onClick={commit}>
              {busy ? "Importing…" : `Import ${plan.unique} influencers`}
            </button>
            <button className={buttonClass("ghost")} onClick={() => setStep("map")} disabled={busy}>
              Back
            </button>
          </div>
        </>
      )}

      {step === "done" && result && (
        <Card>
          <h2 className="text-lg font-semibold">Import complete</h2>
          <p className="mt-1 text-sm text-muted">
            {result.created} new influencers added, {result.merged} existing ones updated.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/influencers" className={buttonClass("primary")}>
              Go to influencers and fetch their data
            </Link>
            <button className={buttonClass("secondary")} onClick={reset}>
              Import another file
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: "good" }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={"tabular mt-1 text-2xl font-semibold " + (tone === "good" ? "text-good" : "")}>{value}</div>
    </div>
  );
}
