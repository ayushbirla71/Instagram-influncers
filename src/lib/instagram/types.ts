// Provider-agnostic shapes for Instagram data. Pure types, safe to import anywhere.

export type MediaKind = "REEL" | "IMAGE" | "CAROUSEL" | "VIDEO" | "STORY" | "OTHER";
export type DataSource = "DISCOVERY" | "INSIGHTS";
export type FailureKind = "NOT_PROFESSIONAL" | "NOT_FOUND" | "ERROR";

export interface ProfileData {
  igUserId: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
}

export interface MediaData {
  id: string;
  type: MediaKind;
  permalink: string | null;
  caption: string | null;
  timestamp: Date;
  /** null when the creator hides like counts */
  likeCount: number | null;
  commentsCount: number | null;
  // Only populated from the owner's own insights (connected accounts)
  reach: number | null;
  views: number | null;
  saved: number | null;
  shares: number | null;
  totalInteractions: number | null;
  source: DataSource;
}

export type FetchOutcome =
  | { ok: true; profile: ProfileData; media: MediaData[] }
  | { ok: false; kind: FailureKind; message: string };

export interface FetchRequest {
  handle: string;
  /** Only media at or after this instant are needed */
  since: Date;
  /** Follower count from the spreadsheet, used by the mock provider for realistic scale */
  followersHint?: number | null;
  /** Present when this influencer connected their account (enables reach etc.) */
  connection?: { igUserId: string; accessToken: string } | null;
}

export interface MetricsProvider {
  readonly name: "mock" | "graph";
  fetchProfile(req: FetchRequest): Promise<FetchOutcome>;
}
