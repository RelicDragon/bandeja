import { liveApi } from '@/api/live';

/**
 * Where a viewer lands after tapping **Watch**: the read-only TV board
 * (`GameWatchPage`). Never `/games/:id/broadcast` — that page is the OBS
 * overlay, a small lower-third on an empty screen.
 */
export function liveWatchPath(gameId: string, matchId: string, spectatorToken: string): string {
  const params = new URLSearchParams({ matchId, spectatorToken });
  return `/games/${gameId}/watch?${params.toString()}`;
}

/**
 * Mints a spectator token first, so a non-participant (or a signed-out viewer)
 * can open the board — that mint is what makes "spectating is one tap" true.
 */
export async function mintLiveWatchPath(gameId: string, fallbackMatchId: string): Promise<string> {
  const response = await liveApi.spectatorToken(gameId);
  const { matchId, token } = response.data.data;
  return liveWatchPath(gameId, matchId || fallbackMatchId, token);
}
