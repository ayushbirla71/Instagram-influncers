import { createGraphProvider } from "./graph";
import { mockProvider } from "./mock";
import type { MetricsProvider } from "./types";

export type { MetricsProvider } from "./types";

export const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";

/** Chosen by METRICS_PROVIDER: "mock" (default, simulated demo data) or "graph" (Meta Graph API). */
export function getProvider(): MetricsProvider {
  const name = (process.env.METRICS_PROVIDER ?? "mock").toLowerCase();
  if (name === "mock") return mockProvider;
  if (name === "graph") {
    const igUserId = process.env.IG_USER_ID;
    const accessToken = process.env.IG_ACCESS_TOKEN;
    if (!igUserId || !accessToken) {
      throw new Error("METRICS_PROVIDER=graph needs IG_USER_ID and IG_ACCESS_TOKEN to be set");
    }
    return createGraphProvider({ version: GRAPH_VERSION, igUserId, accessToken });
  }
  throw new Error(`Unknown METRICS_PROVIDER "${name}" (use "mock" or "graph")`);
}
