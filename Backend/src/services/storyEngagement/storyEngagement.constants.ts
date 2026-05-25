export const MAX_CAPTION_LENGTH = 220;
export const MAX_SYNTHETIC_CAPTION_LENGTH = 120;
export const MAX_COMMENT_BODY_LENGTH = 500;
export const MAX_COMMENTS_PER_SEGMENT = process.env.STORY_ENGAGEMENT_TEST_COMMENT_CAP
  ? parseInt(process.env.STORY_ENGAGEMENT_TEST_COMMENT_CAP, 10)
  : 500;
export const COMMENTS_PAGE_SIZE = 30;
export const TOP_LEVEL_COMMENT_PAGE_SIZE = COMMENTS_PAGE_SIZE;
export const REPLY_PAGE_SIZE = 30;
export const REPLY_PREVIEW_COUNT = 2;
export const LIKER_PAGE_SIZE = 30;

export const LIKE_TOGGLE_RATE_LIMIT_PER_MIN = 100;
export const COMMENT_RATE_LIMIT_PER_MIN = 10;

export const STORY_ENGAGEMENT_ERROR = {
  SEGMENT_NOT_FOUND: 'STORY_SEGMENT_NOT_FOUND',
  FORBIDDEN: 'STORY_ENGAGEMENT_FORBIDDEN',
  COMMENT_INVALID_PARENT: 'STORY_COMMENT_INVALID_PARENT',
  COMMENT_BODY_INVALID: 'STORY_COMMENT_BODY_INVALID',
  COMMENT_RATE_LIMIT: 'STORY_COMMENT_RATE_LIMIT',
  COMMENT_CAP_REACHED: 'STORY_COMMENT_CAP_REACHED',
  COMMENT_NOT_FOUND: 'STORY_COMMENT_NOT_FOUND',
} as const;

export function segmentEngagementKey(sourceType: string, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

export function normalizeCaption(raw: string | null | undefined, maxLen: number): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trim() || null;
}
