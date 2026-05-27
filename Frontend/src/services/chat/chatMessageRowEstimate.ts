import type { ChatMessage } from '@/api/chat';
import { getCachedMessageRowHeight } from './chatMessageHeights';

export const ROW_ESTIMATE_PX = 88;
export const ROW_ESTIMATE_VIDEO_PX = 360;
/** Single-image bubble max (400) + row chrome / reactions gutter. */
export const ROW_ESTIMATE_IMAGE_PX = 448;
export const ROW_ESTIMATE_VOICE_PX = 120;
export const ROW_ESTIMATE_POLL_PX = 220;
export const END_SPACER_PX = 128;

/** Heuristic row height when nothing is measured yet (open / L1 placeholder). */
export function estimateMessageRowHeightPx(msg: ChatMessage | undefined): number {
  if (!msg) return ROW_ESTIMATE_PX;
  if (msg.messageType === 'VIDEO') return ROW_ESTIMATE_VIDEO_PX;
  if (msg.messageType === 'VOICE') return ROW_ESTIMATE_VOICE_PX;
  if (msg.poll) return ROW_ESTIMATE_POLL_PX;
  const mediaCount = msg.mediaUrls?.length ?? 0;
  if (mediaCount > 0 || msg.messageType === 'IMAGE') {
    const textBelow = !!msg.content?.trim();
    if (mediaCount <= 1 && !textBelow) return ROW_ESTIMATE_IMAGE_PX;
    return ROW_ESTIMATE_IMAGE_PX + (textBelow ? 56 : mediaCount > 1 ? 96 : 0);
  }
  if (msg.replyToId) return ROW_ESTIMATE_PX + 40;
  return ROW_ESTIMATE_PX;
}

/** Virtualizer / open: measured cache first, then heuristic. */
export function resolveMessageRowEstimatePx(msg: ChatMessage | undefined): number {
  if (!msg) return ROW_ESTIMATE_PX;
  const cached = getCachedMessageRowHeight(msg.id);
  if (cached != null) return cached;
  return estimateMessageRowHeightPx(msg);
}
