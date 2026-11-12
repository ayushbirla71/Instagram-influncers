/** 15600 -> "15.6K", 1250000 -> "1.25M". Null becomes an em dash. */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${trim(n / 1_000_000, 2)}M`;
  if (abs >= 10_000) return `${trim(n / 1_000, 1)}K`;
  if (abs >= 1_000) return `${trim(n / 1_000, 2)}K`;
  return String(Math.round(n));
}

function trim(n: number, digits: number): string {
  return n.toFixed(digits).replace(/\.?0+$/, "");
}

export function pct(fraction: number | null | undefined, digits = 1): string {
  if (fraction === null || fraction === undefined) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function num1(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(1).replace(/\.0$/, "");
}

export function rupees(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `₹${new Intl.NumberFormat("en-IN").format(n)}`;
}

export function dateShort(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function ago(d: Date | null | undefined, now = new Date()): string {
  if (!d) return "never";
  const mins = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
