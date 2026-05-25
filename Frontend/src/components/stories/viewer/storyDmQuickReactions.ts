const STORAGE_KEY = 'padelpulse:story-dm-reaction-counts';

export const STORY_DM_DEFAULT_REACTIONS = ['😂', '😮', '😍', '😢', '👏', '🔥'] as const;

export type StoryDmReaction = (typeof STORY_DM_DEFAULT_REACTIONS)[number];

function readCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function writeCounts(counts: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
  } catch {
    /* ignore quota */
  }
}

export function recordStoryDmReactionUse(emoji: string) {
  const counts = readCounts();
  counts[emoji] = (counts[emoji] ?? 0) + 1;
  writeCounts(counts);
}

export function getStoryDmQuickReactions(): string[] {
  const counts = readCounts();
  const ranked = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([emoji]) => emoji);

  const merged: string[] = [];
  for (const emoji of ranked) {
    if (!merged.includes(emoji)) merged.push(emoji);
    if (merged.length >= 6) return merged;
  }
  for (const emoji of STORY_DM_DEFAULT_REACTIONS) {
    if (!merged.includes(emoji)) merged.push(emoji);
    if (merged.length >= 6) break;
  }
  return merged.slice(0, 6);
}
