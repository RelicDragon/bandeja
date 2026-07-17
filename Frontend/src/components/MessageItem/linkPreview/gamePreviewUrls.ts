import type { LinkPreviewData } from '@/api/linkPreview';

const GAME_ENTITIES = new Set<LinkPreviewData['entityType']>(['game', 'gameChat', 'gameLive']);

export function resolveGamePreviewUrls(
  url: string,
  entityType: LinkPreviewData['entityType']
): { gameUrl: string; chatUrl: string } | null {
  if (!GAME_ENTITIES.has(entityType)) return null;
  try {
    const parsed = new URL(url);
    const gameId = parsed.pathname.match(/^\/games\/([^/]+)(?:\/(?:chat|live))?\/?$/)?.[1];
    if (!gameId) return null;
    return {
      gameUrl: new URL(`/games/${gameId}`, parsed.origin).toString(),
      chatUrl: new URL(`/games/${gameId}/chat`, parsed.origin).toString(),
    };
  } catch {
    return null;
  }
}
