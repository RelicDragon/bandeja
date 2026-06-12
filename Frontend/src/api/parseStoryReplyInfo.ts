import type { StoryReplyInfo } from './chat';
import type { StorySourceType } from './stories';
import { isSafeStoryReplyMediaUrl } from './storyReplyMediaUrl';

const STORY_SOURCE_TYPES = new Set<StorySourceType>([
  'USER_STORY_ITEM',
  'GAME_PHOTO',
  'GAME_CREATED',
  'GAME_RESULT',
  'BRACKET_CHAMPION',
]);

function takeString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

export function parseStoryReplyInfo(raw: unknown): StoryReplyInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const sourceType = takeString(input.sourceType, 64) as StorySourceType | undefined;
  const sourceId = takeString(input.sourceId, 256);
  const ownerUserId = takeString(input.ownerUserId, 64);
  if (!sourceType || !STORY_SOURCE_TYPES.has(sourceType) || !sourceId || !ownerUserId) return null;

  const info: StoryReplyInfo = { sourceType, sourceId, ownerUserId };

  const thumbnailUrl = takeString(input.thumbnailUrl, 2048);
  if (thumbnailUrl && isSafeStoryReplyMediaUrl(thumbnailUrl)) info.thumbnailUrl = thumbnailUrl;

  const mediaUrl = takeString(input.mediaUrl, 2048);
  if (mediaUrl && isSafeStoryReplyMediaUrl(mediaUrl)) info.mediaUrl = mediaUrl;

  const mediaType = takeString(input.mediaType, 16);
  if (mediaType === 'IMAGE' || mediaType === 'VIDEO') info.mediaType = mediaType;

  return info;
}
