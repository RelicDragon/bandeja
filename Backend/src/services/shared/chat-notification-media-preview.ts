import { convertMentionsToPlaintext } from '../../utils/parseMentions';
import { t } from '../../utils/translations';
import { MessageService } from '../chat/message.service';
import { S3Service } from '../s3.service';
import {
  formatStoryReplyNotificationBody,
  hasStoryReplyPayload,
  isAllowedStoryReplyAttachmentUrl,
} from '../chat/storyReplySanitize';
import { NotificationData } from '../../types/notifications.types';

export interface ChatNotificationMediaPreview {
  body: string;
  previewImageUrl?: string;
  previewMediaType?: 'image' | 'video';
  mediaCount: number;
}

export interface ChatMessageForMediaPreview {
  content?: string | null;
  messageType?: string;
  mediaUrls?: string[];
  thumbnailUrls?: string[];
  audioDurationMs?: number | null;
  videoDurationMs?: number | null;
  stickerEmoji?: string | null;
  documentFileName?: string | null;
  storyReply?: unknown;
}

const ORIGINALS_PATH = '/uploads/chat/originals/';

function formatDurationLabel(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  return `${mm}:${ss.toString().padStart(2, '0')}`;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isThumbnailPath(url: string): boolean {
  return !url.includes(ORIGINALS_PATH);
}

function resolveThumbnailUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl?.trim()) {
    return undefined;
  }
  const trimmed = rawUrl.trim();
  if (!isThumbnailPath(trimmed)) {
    return undefined;
  }

  if (isHttpsUrl(trimmed)) {
    return trimmed;
  }

  const key = trimmed.startsWith('/') ? trimmed.substring(1) : trimmed;
  const resolved = S3Service.getCloudFrontUrl(key);
  return isHttpsUrl(resolved) ? resolved : undefined;
}

function pickStoryReplyThumbnailUrl(storyReply: unknown): string | undefined {
  if (!hasStoryReplyPayload(storyReply)) {
    return undefined;
  }
  const raw = (storyReply as Record<string, unknown>).thumbnailUrl;
  if (typeof raw !== 'string' || !raw.trim()) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!isAllowedStoryReplyAttachmentUrl(trimmed)) {
    return undefined;
  }
  return resolveThumbnailUrl(trimmed);
}

function pickPreviewImageUrl(message: ChatMessageForMediaPreview): string | undefined {
  const thumbCandidates: string[] = [];
  if (message.thumbnailUrls?.length) {
    thumbCandidates.push(...message.thumbnailUrls);
  }
  if (message.mediaUrls?.length) {
    thumbCandidates.push(...MessageService.generateThumbnailUrls(message.mediaUrls));
  }

  for (const candidate of thumbCandidates) {
    const resolved = resolveThumbnailUrl(candidate);
    if (resolved) {
      return resolved;
    }
  }
  return undefined;
}

function formatMediaCountSuffix(extraCount: number, lang: string): string {
  if (extraCount <= 0) {
    return '';
  }
  const key = 'notifications.mediaCount';
  const template = t(key, lang);
  const label = template !== key ? template : '(+{count})';
  return ` ${label.replace('{count}', String(extraCount))}`;
}

function formatImageBody(message: ChatMessageForMediaPreview, lang: string): string {
  const mediaCount = message.mediaUrls?.length ?? 0;
  const caption = message.content?.trim()
    ? convertMentionsToPlaintext(message.content)
    : '';
  if (caption) {
    return caption + (mediaCount > 1 ? formatMediaCountSuffix(mediaCount - 1, lang) : '');
  }
  const photoKey = 'notifications.photo';
  const photoLabel = t(photoKey, lang);
  const base = photoLabel !== photoKey ? photoLabel : '📷 Photo';
  return base + (mediaCount > 1 ? formatMediaCountSuffix(mediaCount - 1, lang) : '');
}

function formatVideoBody(message: ChatMessageForMediaPreview): string {
  const caption = message.content?.trim()
    ? convertMentionsToPlaintext(message.content)
    : '';
  if (caption) {
    return caption;
  }
  if (message.videoDurationMs != null) {
    return `🎬 Video (${formatDurationLabel(message.videoDurationMs)})`;
  }
  return '🎬 Video';
}

function formatVoiceBody(message: ChatMessageForMediaPreview): string {
  if (message.audioDurationMs != null) {
    return `🎤 Voice message (${formatDurationLabel(message.audioDurationMs)})`;
  }
  return '🎤 Voice message';
}

function formatDocumentBody(message: ChatMessageForMediaPreview): string {
  const name =
    typeof message.documentFileName === 'string' ? message.documentFileName.trim() : '';
  return name ? `📄 ${name}` : '📄 File';
}

function formatStickerBody(message: ChatMessageForMediaPreview, lang: string): string {
  const stickerKey = 'notifications.sticker';
  const stickerLabel = t(stickerKey, lang);
  const fallbackLabel = stickerLabel !== stickerKey ? stickerLabel : '🔖 Sticker';
  const emoji =
    typeof message.stickerEmoji === 'string' && message.stickerEmoji.trim()
      ? message.stickerEmoji.trim()
      : '';
  if (!emoji) return fallbackLabel;
  const plain = fallbackLabel.replace(/^🔖\s*/, '').trim() || 'Sticker';
  return `${emoji} ${plain}`;
}

export function resolveChatNotificationMediaPreview(
  message: ChatMessageForMediaPreview,
  lang = 'en'
): ChatNotificationMediaPreview {
  const normalizedLang = (lang ?? 'en').split('-')[0].toLowerCase();
  const mediaCount = message.mediaUrls?.length ?? 0;

  if (hasStoryReplyPayload(message.storyReply)) {
    const previewImageUrl = pickStoryReplyThumbnailUrl(message.storyReply);
    return {
      body: formatStoryReplyNotificationBody(message.content, normalizedLang),
      previewImageUrl,
      previewMediaType: previewImageUrl ? 'image' : undefined,
      mediaCount,
    };
  }

  if (message.messageType === 'VOICE') {
    return { body: formatVoiceBody(message), mediaCount };
  }

  if (message.messageType === 'STICKER') {
    return { body: formatStickerBody(message, normalizedLang), mediaCount };
  }

  if (message.messageType === 'VIDEO') {
    const previewImageUrl = pickPreviewImageUrl(message);
    return {
      body: formatVideoBody(message),
      previewImageUrl,
      previewMediaType: previewImageUrl ? 'video' : undefined,
      mediaCount,
    };
  }

  if (message.messageType === 'DOCUMENT') {
    return {
      body: formatDocumentBody(message),
      mediaCount,
    };
  }

  if (message.messageType === 'IMAGE' || (mediaCount > 0 && !message.content?.trim())) {
    const previewImageUrl = pickPreviewImageUrl(message);
    return {
      body: formatImageBody(message, normalizedLang),
      previewImageUrl,
      previewMediaType: previewImageUrl ? 'image' : undefined,
      mediaCount,
    };
  }

  if (message.content?.trim()) {
    return {
      body: convertMentionsToPlaintext(message.content),
      mediaCount,
    };
  }

  if (mediaCount > 0) {
    return {
      body: formatImageBody(message, normalizedLang),
      previewImageUrl: pickPreviewImageUrl(message),
      previewMediaType: pickPreviewImageUrl(message) ? 'image' : undefined,
      mediaCount,
    };
  }

  return { body: '', mediaCount: 0 };
}

export function mergeMediaPreviewIntoNotificationData(
  data: NotificationData,
  preview: ChatNotificationMediaPreview
): NotificationData {
  const merged: NotificationData = { ...data };
  if (preview.previewImageUrl) {
    merged.previewImageUrl = preview.previewImageUrl;
  }
  if (preview.previewMediaType) {
    merged.previewMediaType = preview.previewMediaType;
  }
  if (preview.mediaCount > 0) {
    merged.mediaCount = preview.mediaCount;
  }
  return merged;
}
