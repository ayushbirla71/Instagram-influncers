import type { Eligibility, InfluencerStatus } from "@/generated/prisma/enums";
import type { Confidence } from "@/lib/metrics/score";
import { Badge, type Tone } from "@/components/ui";

const STATUS: Record<InfluencerStatus, { label: string; tone: Tone }> = {
  NEW: { label: "New", tone: "neutral" },
  SHORTLISTED: { label: "Shortlisted", tone: "info" },
  SELECTED: { label: "Selected", tone: "good" },
  REJECTED: { label: "Rejected", tone: "bad" },
  ON_HOLD: { label: "On hold", tone: "warn" },
};
export const STATUS_OPTIONS = (Object.keys(STATUS) as InfluencerStatus[]).map((value) => ({ value, label: STATUS[value].label }));

export function StatusBadge({ status }: { status: InfluencerStatus }) {
  const s = STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const ELIGIBILITY: Record<Eligibility, { label: string; tone: Tone; help: string }> = {
  UNKNOWN: { label: "Not fetched", tone: "neutral", help: "Instagram data has not been fetched yet" },
  OK: { label: "Data available", tone: "good", help: "Public posts and engagement can be read" },
  NOT_PROFESSIONAL: {
    label: "Not readable",
    tone: "warn",
    help: "Not a Business/Creator account, or the handle is wrong. Instagram only shares data for Business or Creator accounts.",
  },
  NOT_FOUND: { label: "Not found", tone: "bad", help: "No account with this handle. Check for a typo or a renamed profile." },
  ERROR: { label: "Fetch error", tone: "bad", help: "A temporary error occurred. It will be retried." },
};
export const ELIGIBILITY_OPTIONS = (Object.keys(ELIGIBILITY) as Eligibility[]).map((value) => ({ value, label: ELIGIBILITY[value].label }));

export function EligibilityBadge({ eligibility, note }: { eligibility: Eligibility; note?: string | null }) {
  const e = ELIGIBILITY[eligibility];
  return (
    <span title={note ? `${e.help} (${note})` : e.help}>
      <Badge tone={e.tone}>{e.label}</Badge>
    </span>
  );
}

export function ScoreBadge({ score, confidence }: { score: number | null | undefined; confidence?: Confidence | null }) {
  if (score === null || score === undefined) return <span className="text-muted">—</span>;
  const tone: Tone = score >= 70 ? "good" : score >= 45 ? "info" : score >= 25 ? "warn" : "bad";
  return (
    <span className="inline-flex items-center gap-1.5" title={confidence === "low" ? "Low confidence: fewer than 3 posts in the last 30 days" : undefined}>
      <Badge tone={tone}>{score}</Badge>
      {confidence === "low" ? <span className="text-xs text-muted">low data</span> : null}
    </span>
  );
}
