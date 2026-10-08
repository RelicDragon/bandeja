import { useMemo, useRef } from 'react';
import type { LinkPreviewData } from '@/api/linkPreview';
import { useLinkPreview } from '@/components/MessageItem/linkPreview/useLinkPreview';
import { findChatListGameLink } from './chatListGameLink';

const GAME_ENTITIES = new Set<LinkPreviewData['entityType']>(['game', 'gameChat', 'gameLive']);

/**
 * Resolves the first game link in a preview line through the shared link-preview
 * cache. Attach `ref` to the preview line so the fetch waits until it is on screen.
 */
export function useChatListGameLinkPreview(text: string | null | undefined) {
  const link = useMemo(() => findChatListGameLink(text), [text]);
  const ref = useRef<HTMLParagraphElement | null>(null);
  const { status, preview } = useLinkPreview(link?.url ?? null, ref);
  const game =
    link && status === 'ready' && preview && GAME_ENTITIES.has(preview.entityType) && preview.description
      ? preview
      : null;
  return { ref, link, game };
}
