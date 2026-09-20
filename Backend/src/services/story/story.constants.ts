export const STORY_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_WINDOW_MS = STORY_TTL_MS;
export const MAX_SEGMENTS_PER_USER = 20;
export const MAX_BUBBLES = 100;
export const MAX_OVERLAY_TEXT_LENGTH = 80;
export const MAX_VIDEO_DURATION_MS = 60_000;
export const QUERY_ROW_CAP = 200;

export const SOURCE_PRIORITY: Record<string, number> = {
  // PRD 353 — a monthly recap is never deduped against a game (it has no
  // gameId), but it outranks every game-derived segment if it ever is.
  MONTHLY_RECAP: 4,
  GAME_PHOTO: 3,
  GAME_RESULT: 2,
  BRACKET_CHAMPION: 2,
  GAME_CREATED: 1,
};
