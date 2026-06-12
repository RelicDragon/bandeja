import { Prisma } from '@prisma/client';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { S3Service } from '../s3.service';
import { isAllowedStoryMediaUrl } from '../story/story.validate.service';
import { t } from '../../utils/translations';

export const STORY_REPLY_PREVIEW_PREFIX = '[TYPE:STORY_REPLY]';

const STORY_SOURCE_TYPES = new Set([
  'USER_STORY_ITEM',
  'GAME_PHOTO',
  'GAME_CREATED',
  'GAME_RESULT',
  'BRACKET_CHAMPION',
]);

const MAX_ID_LENGTH = 64;
const MAX_URL_LENGTH = 2048;

const GAME_MEDIA_KEY_RE =
  /^uploads\/games\/(originals|thumbnails)\/[a-zA-Z0-9._-]+$/;
const AVATAR_KEY_RE = /^uploads\/avatars\/[a-zA-Z0-9._-]+$/;

function cloudFrontHostMatches(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return true;
  try {
    const allowedHost = config.aws.cloudFrontDomain.replace(/^https?:\/\//, '').split('/')[0].toLowerCase();
    return new URL(url).hostname.toLowerCase() === allowedHost;
  } catch {
    return false;
  }
}

export function isAllowedStoryReplyAttachmentUrl(url: string): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  if (isAllowedStoryMediaUrl(url)) return true;
  try {
    const key = S3Service.extractS3Key(url.trim());
    if (!cloudFrontHostMatches(url)) return false;
    return GAME_MEDIA_KEY_RE.test(key) || AVATAR_KEY_RE.test(key);
  } catch {
    return false;
  }
}

function takeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  return trimmed;
}

/**
 * Validates the client-provided story reply context for an Instagram-style
 * "reply to story" DM. Returns a clean JSON object or null when invalid.
 */
export function sanitizeStoryReply(raw: unknown): Prisma.JsonObject | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;

  const sourceType = takeString(input.sourceType, MAX_ID_LENGTH);
  if (!sourceType || !STORY_SOURCE_TYPES.has(sourceType)) return null;

  const sourceId = takeString(input.sourceId, MAX_ID_LENGTH * 4);
  const ownerUserId = takeString(input.ownerUserId, MAX_ID_LENGTH);
  if (!sourceId || !ownerUserId) return null;

  const result: Prisma.JsonObject = { sourceType, sourceId, ownerUserId };

  const thumbnailUrl = takeString(input.thumbnailUrl, MAX_URL_LENGTH);
  if (thumbnailUrl) {
    if (!isAllowedStoryReplyAttachmentUrl(thumbnailUrl)) return null;
    result.thumbnailUrl = thumbnailUrl;
  }

  const mediaUrl = takeString(input.mediaUrl, MAX_URL_LENGTH);
  if (mediaUrl) {
    if (!isAllowedStoryReplyAttachmentUrl(mediaUrl)) return null;
    result.mediaUrl = mediaUrl;
  }

  const mediaType = takeString(input.mediaType, 16);
  if (mediaType === 'IMAGE' || mediaType === 'VIDEO') result.mediaType = mediaType;

  return result;
}

export function hasStoryReplyPayload(raw: unknown): boolean {
  return raw != null && typeof raw === 'object' && !Array.isArray(raw);
}

export function validateStoryReplyForUserChat(
  raw: unknown,
  senderId: string,
  userChat: { user1Id: string; user2Id: string }
): Prisma.JsonObject {
  const sanitized = sanitizeStoryReply(raw);
  if (!sanitized) {
    throw new ApiError(400, 'Invalid story reply payload');
  }
  const recipientId = userChat.user1Id === senderId ? userChat.user2Id : userChat.user1Id;
  if (sanitized.ownerUserId !== recipientId) {
    throw new ApiError(400, 'Story reply owner must be the message recipient');
  }
  return sanitized;
}

export function formatStoryReplyPreview(content: string | null | undefined): string {
  const text = content?.trim() ?? '';
  return `${STORY_REPLY_PREVIEW_PREFIX}${text || '…'}`;
}

export function formatStoryReplyNotificationBody(
  content: string | null | undefined,
  lang = 'en'
): string {
  const baseLang = (lang || 'en').split('-')[0].toLowerCase();
  const label = t('chat.storyReply.toYourStory', baseLang);
  const text = content?.trim();
  if (!text) return label;
  return `${label}: ${text}`;
}
