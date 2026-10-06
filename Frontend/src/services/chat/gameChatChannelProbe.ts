import { chatApi } from '@/api/chat';

/**
 * "Has this game's PRIVATE / ADMINS channel been activated?" — asked on game open by both
 * the details page (`useParticipantChatsEnabled`) and the side chat
 * (`useThreadChannelActivity`), about a second apart. One request per channel answers
 * both; `fresh` (explicit refresh) always asks the server. The server answers with a
 * boolean (`GET /chat/games/:id/channel-active`) instead of a page of messages.
 */
const PROBE_REUSE_MS = 3000;

type ProbeChatType = 'PRIVATE' | 'ADMINS';
const probes = new Map<string, { at: number; promise: Promise<boolean> }>();

export function probeGameChatChannelActive(
  gameId: string,
  chatType: ProbeChatType,
  options?: { fresh?: boolean },
): Promise<boolean> {
  const key = `${gameId}|${chatType}`;
  const existing = probes.get(key);
  if (!options?.fresh && existing && Date.now() - existing.at < PROBE_REUSE_MS) return existing.promise;
  const promise = chatApi.getGameChannelActive(gameId, chatType);
  probes.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (probes.get(key)?.promise === promise) probes.delete(key);
  });
  return promise;
}
