"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

// Colours come from CSS tokens (see globals.css) so light/dark switch in one place.
const S1 = "var(--series-1)";
const S2 = "var(--series-2)";
const GRID = "var(--chart-grid)";
const AXIS = "var(--chart-axis)";

const axisProps = { stroke: AXIS, tick: { fill: AXIS, fontSize: 12 }, tickLine: false } as const;

const compactNum = (n: number) =>
  n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(1)}K` : String(n);

function TooltipBox({ title, rows }: { title: ReactNode; rows: { label: string; value: ReactNode; color?: string }[] }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-text">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted">
          {r.color ? <span className="inline-block h-2 w-2 rounded-sm" style={{ background: r.color }} /> : null}
          <span>{r.label}</span>
          <span className="tabular ml-auto pl-3 font-medium text-text">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-muted hover:text-text">View data as table</summary>
      <div className="mt-2 max-h-64 overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-surface text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-2 py-1 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                {r.map((c, j) => (
                  <td key={j} className="tabular px-2 py-1">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted">{text}</p>;
}

/** Horizontal ranked bars, one hue: counts per category (e.g. influencers per location). */
export function RankedBars({ data, unit = "influencers" }: { data: { label: string; value: number }[]; unit?: string }) {
  if (data.length === 0) return <Empty text="No data yet" />;
  return (
    <>
      <div role="img" aria-label={`Bar chart of ${unit} by category`}>
        <ResponsiveContainer width="100%" height={Math.max(160, data.length * 30 + 20)} initialDimension={{ width: 400, height: 200 }}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="label" width={110} {...axisProps} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={payload[0].payload.label} rows={[{ label: unit, value: payload[0].payload.value, color: S1 }]} />
                ) : null
              }
            />
            <Bar dataKey="value" fill={S1} radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable columns={["Category", unit]} rows={data.map((d) => [d.label, d.value])} />
    </>
  );
}

/** Stacked horizontal bars: reels vs other posts per influencer (two series, legend always shown). */
export function PostsVsReels({ data }: { data: { label: string; reels: number; other: number }[] }) {
  if (data.length === 0) return <Empty text="No synced influencers yet" />;
  return (
    <>
      <div role="img" aria-label="Stacked bar chart of reels and other posts in the last 30 days per influencer">
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 30 + 50)} initialDimension={{ width: 400, height: 300 }}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" allowDecimals={false} {...axisProps} />
            <YAxis type="category" dataKey="label" width={130} {...axisProps} />
            <Legend verticalAlign="top" align="left" iconType="square" wrapperStyle={{ fontSize: 12, color: AXIS, paddingBottom: 8 }} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={payload[0].payload.label}
                    rows={[
                      { label: "Reels", value: payload[0].payload.reels, color: S1 },
                      { label: "Other posts", value: payload[0].payload.other, color: S2 },
                      { label: "Total", value: payload[0].payload.reels + payload[0].payload.other },
                    ]}
                  />
                ) : null
              }
            />
            {/* 2px surface gap between stacked segments */}
            <Bar dataKey="reels" name="Reels" stackId="a" fill={S1} stroke="var(--surface)" strokeWidth={2} barSize={14} />
            <Bar dataKey="other" name="Other posts" stackId="a" fill={S2} stroke="var(--surface)" strokeWidth={2} radius={[0, 4, 4, 0]} barSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable columns={["Influencer", "Reels", "Other posts"]} rows={data.map((d) => [d.label, d.reels, d.other])} />
    </>
  );
}

/** Engagement rate vs followers: one series, so no legend; the tooltip names each dot. */
export function EngagementScatter({ data }: { data: { handle: string; followers: number; er: number; score: number | null }[] }) {
  if (data.length === 0) return <Empty text="No synced influencers yet" />;
  return (
    <>
      <div role="img" aria-label="Scatter plot of engagement rate against follower count, one dot per influencer">
        <ResponsiveContainer width="100%" height={320} initialDimension={{ width: 400, height: 320 }}>
          <ScatterChart margin={{ left: 4, right: 16, top: 8, bottom: 20 }}>
            <CartesianGrid stroke={GRID} />
            <XAxis
              type="number"
              dataKey="followers"
              scale="log"
              domain={["auto", "auto"]}
              tickFormatter={compactNum}
              name="Followers"
              label={{ value: "Followers (log scale)", position: "bottom", offset: 4, fill: AXIS, fontSize: 12 }}
              {...axisProps}
            />
            <YAxis
              type="number"
              dataKey="er"
              tickFormatter={(v) => `${v}%`}
              name="Engagement rate"
              label={{ value: "Engagement rate", angle: -90, position: "insideLeft", fill: AXIS, fontSize: 12 }}
              {...axisProps}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: AXIS }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={`@${payload[0].payload.handle}`}
                    rows={[
                      { label: "Followers", value: compactNum(payload[0].payload.followers) },
                      { label: "Engagement rate", value: `${payload[0].payload.er}%` },
                      { label: "Score", value: payload[0].payload.score ?? "—" },
                    ]}
                  />
                ) : null
              }
            />
            {/* surface ring keeps overlapping dots distinguishable */}
            <Scatter data={data} fill={S1} fillOpacity={0.85} stroke="var(--surface)" strokeWidth={2} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <DataTable
        columns={["Influencer", "Followers", "Eng. rate %", "Score"]}
        rows={data.map((d) => [`@${d.handle}`, d.followers, d.er, d.score ?? "—"])}
      />
    </>
  );
}

/** Score distribution: single-hue columns. */
export function ScoreHistogram({ data }: { data: { range: string; count: number }[] }) {
  if (data.every((d) => d.count === 0)) return <Empty text="No scores yet" />;
  return (
    <>
      <div role="img" aria-label="Histogram of popularity scores">
        <ResponsiveContainer width="100%" height={220} initialDimension={{ width: 400, height: 220 }}>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="range" {...axisProps} />
            <YAxis allowDecimals={false} {...axisProps} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={`Score ${payload[0].payload.range}`} rows={[{ label: "Influencers", value: payload[0].payload.count, color: S1 }]} />
                ) : null
              }
            />
            <Bar dataKey="count" fill={S1} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable columns={["Score range", "Influencers"]} rows={data.map((d) => [d.range, d.count])} />
    </>
  );
}

/** One influencer's posts over the window: interactions per post, reels vs other as two series. */
export function PostsTimeline({ data }: { data: { date: string; reel: number | null; other: number | null }[] }) {
  if (data.length === 0) return <Empty text="No posts in the last 30 days" />;
  return (
    <>
      <div role="img" aria-label="Interactions per post over the last 30 days, reels and other posts">
        <ResponsiveContainer width="100%" height={240} initialDimension={{ width: 400, height: 240 }}>
          <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="date" {...axisProps} />
            <YAxis tickFormatter={compactNum} {...axisProps} />
            <Legend verticalAlign="top" align="left" iconType="square" wrapperStyle={{ fontSize: 12, color: AXIS, paddingBottom: 8 }} />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={payload[0].payload.date}
                    rows={[
                      ...(payload[0].payload.reel !== null ? [{ label: "Reel interactions", value: payload[0].payload.reel, color: S1 }] : []),
                      ...(payload[0].payload.other !== null ? [{ label: "Post interactions", value: payload[0].payload.other, color: S2 }] : []),
                    ]}
                  />
                ) : null
              }
            />
            <Bar dataKey="reel" name="Reels" fill={S1} stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="other" name="Other posts" fill={S2} stroke="var(--surface)" strokeWidth={2} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable columns={["Date", "Reel interactions", "Post interactions"]} rows={data.map((d) => [d.date, d.reel ?? "—", d.other ?? "—"])} />
    </>
  );
}

/** Follower count across syncs (single line, 2px). */
export function FollowerTrend({ data }: { data: { date: string; followers: number }[] }) {
  if (data.length < 2) return <Empty text="A trend appears after the profile has been synced on at least two different days." />;
  return (
    <>
      <div role="img" aria-label="Follower count over time">
        <ResponsiveContainer width="100%" height={200} initialDimension={{ width: 400, height: 200 }}>
          <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="date" {...axisProps} />
            <YAxis domain={["auto", "auto"]} tickFormatter={compactNum} {...axisProps} />
            <Tooltip
              cursor={{ stroke: AXIS, strokeDasharray: "3 3" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <TooltipBox title={payload[0].payload.date} rows={[{ label: "Followers", value: payload[0].payload.followers.toLocaleString("en-IN"), color: S1 }]} />
                ) : null
              }
            />
            <Line type="monotone" dataKey="followers" stroke={S1} strokeWidth={2} dot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2, fill: S1 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <DataTable columns={["Date", "Followers"]} rows={data.map((d) => [d.date, d.followers])} />
    </>
  );
}
