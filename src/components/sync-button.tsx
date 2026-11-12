"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

/**
 * Drives /api/sync in small batches so no single request runs long, with live progress.
 * `ids` + `force` refresh specific influencers regardless of freshness; without ids it
 * refreshes whatever is due.
 */
export function SyncButton({
  ids,
  label,
  variant = "primary",
  size = "md",
}: {
  ids?: string[];
  label?: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      let total: number;
      if (ids) {
        total = ids.length;
      } else {
        const res = await fetch("/api/sync");
        if (!res.ok) throw new Error("Could not check what needs syncing");
        total = (await res.json()).due;
      }
      if (total === 0) {
        setProgress({ done: 0, total: 0 });
        return;
      }
      setProgress({ done: 0, total });

      let pending = ids ? [...ids] : undefined;
      let done = 0;
      for (let guard = 0; guard < 1000; guard++) {
        const chunk = pending?.slice(0, 10);
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: chunk, force: Boolean(ids), limit: 10 }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Sync failed");
        done += json.processed.length;
        if (pending) pending = pending.slice(10);
        setProgress({ done: Math.min(done, total), total });
        const finished = pending ? pending.length === 0 : json.remaining === 0 || json.processed.length === 0;
        if (finished) break;
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={run} disabled={running} className={buttonClass(variant, size)}>
        {running ? "Fetching…" : (label ?? "Fetch Instagram data")}
      </button>
      {progress ? (
        <span role="status" className="tabular text-xs text-muted">
          {progress.total === 0 ? "Everything is up to date" : `${progress.done} / ${progress.total}${running ? "" : " done"}`}
        </span>
      ) : null}
      {error ? (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      ) : null}
    </div>
  );
}
