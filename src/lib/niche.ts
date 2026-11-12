// Niche cells in the spreadsheets are free text: "Travel • Food • Culture • Lifestyle",
// "Food🍔 Travel🚂 Lifestyle 👔 Temples", "Fashion & Lifestyle vlogger". For filtering we
// split them into clean, comparable tags. The original text is still shown in the UI.

const SEPARATORS = /[/|•·,;&+]|\s-\s|\s–\s|\band\b/giu;
// words that describe the *person*, not the topic
const ROLE_WORDS = /\b(vlogger|vlogs?|blogger|creator|influencer|page|content|telugu|official|channel)\b/giu;
const MAX_TAG_LENGTH = 28;

export function nicheTags(niche: string | null | undefined): string[] {
  if (!niche) return [];
  // Emoji and stray symbols act as separators ("Food🍔 Travel🚂" -> "Food | Travel").
  const cleaned = niche.replace(/[^\p{L}\p{N}\s/|•·,;&+–-]/gu, " | ");
  const tags: string[] = [];
  for (const part of cleaned.split(SEPARATORS)) {
    let t = part.replace(ROLE_WORDS, " ").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
    // "Food Travel Lifestyle" typed without separators: split on known topics only if the whole thing is long
    if (t.split(" ").length > 3) continue;
    if (t.length < 3 || t.length > MAX_TAG_LENGTH) continue;
    t = t.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    if (!tags.includes(t)) tags.push(t);
  }
  return tags;
}
