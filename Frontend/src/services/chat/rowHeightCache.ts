import type { ChatMessage } from '@/api/chat';
import {
  getCachedMessageRowHeight,
  preloadMessageRowHeights,
  rememberMeasuredMessageHeight,
  seedEphemeralMessageRowHeight,
  seedMessageRowHeights,
} from '@/services/chat/chatMessageHeights';
import {
  END_SPACER_PX,
  estimateMessageRowHeightPx,
  resolveMessageRowEstimateWithDateSeparator,
} from '@/services/chat/chatMessageRowEstimate';
import {
  getChatDateSeparatorLabel,
  stripDateSeparatorFromMeasuredRowHeight,
} from '@/utils/chatDateSeparator';

export { END_SPACER_PX, resolveMessageRowEstimateWithDateSeparator };

export interface RowHeightEstimateParams {
  message: ChatMessage | undefined;
  index: number;
  messages: ChatMessage[];
}

export interface RowHeightMeasuredParams {
  messageId: string;
  rawHeightPx: number;
  hasDateSeparator: boolean;
}

export interface RowHeightPreloadParams {
  messages: ChatMessage[];
  threadKey: string | null;
  limit?: number;
}

const MATERIAL_DELTA_PX = 4;

let bumpCallback: (() => void) | null = null;

/** MessageList registers a bump when cache reports material estimate changes. */
export function registerRowHeightBump(fn: (() => void) | null): void {
  bumpCallback = fn;
}

function maybeBump(material: boolean): void {
  if (material && bumpCallback) bumpCallback();
}

export function rowHeightCacheEstimate(params: RowHeightEstimateParams): number {
  return resolveMessageRowEstimateWithDateSeparator(params.messages, params.index);
}

export function rowHeightCacheRecordMeasured(params: RowHeightMeasuredParams): void {
  rememberMeasuredMessageHeight(
    params.messageId,
    stripDateSeparatorFromMeasuredRowHeight(params.rawHeightPx, params.hasDateSeparator)
  );
}

export function rowHeightCacheSeedFromL1(heights: Record<string, number> | undefined): void {
  seedMessageRowHeights(heights);
}

export function rowHeightCacheSeedEphemeral(messageId: string, heightPx: number): boolean {
  const before = getCachedMessageRowHeight(messageId);
  if (before != null) return false;
  seedEphemeralMessageRowHeight(messageId, heightPx);
  return getCachedMessageRowHeight(messageId) != null;
}

/** Seed heuristic estimates for tail ids missing from cache; returns whether any were added. */
export function rowHeightCacheSeedTailHeuristics(messages: readonly ChatMessage[], limit = 140): boolean {
  let seeded = false;
  for (const m of messages.slice(-limit)) {
    if (!m.id) continue;
    if (getCachedMessageRowHeight(m.id) != null) continue;
    seedEphemeralMessageRowHeight(m.id, estimateMessageRowHeightPx(m));
    seeded = true;
  }
  return seeded;
}

export async function rowHeightCachePreloadTail(params: RowHeightPreloadParams): Promise<boolean> {
  const limit = params.limit ?? 140;
  const tail = params.messages.slice(-limit);
  const ids = tail.map((m) => m.id).filter(Boolean) as string[];
  if (ids.length === 0) return false;
  await preloadMessageRowHeights(ids);
  const seeded = rowHeightCacheSeedTailHeuristics(tail, limit);
  maybeBump(seeded);
  return seeded;
}

export function rowHeightCacheGet(messageId: string | undefined): number | undefined {
  return getCachedMessageRowHeight(messageId);
}

export function rowHeightCacheStripSeparator(rawHeightPx: number, hasDateSeparator: boolean): number {
  return stripDateSeparatorFromMeasuredRowHeight(rawHeightPx, hasDateSeparator);
}

export function rowHeightCacheHasDateSeparator(messages: ChatMessage[], index: number): boolean {
  return getChatDateSeparatorLabel(messages, index) != null;
}

export function rowHeightCacheMeasuredChanged(messageId: string, rawHeightPx: number, hasDateSeparator: boolean): boolean {
  const body = stripDateSeparatorFromMeasuredRowHeight(rawHeightPx, hasDateSeparator);
  const prev = getCachedMessageRowHeight(messageId);
  if (prev == null) return true;
  return Math.abs(prev - body) >= MATERIAL_DELTA_PX;
}
