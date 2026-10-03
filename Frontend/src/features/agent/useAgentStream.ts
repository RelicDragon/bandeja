import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AgentStreamEvent } from '@shared/agentContract';
import { resolveAbsoluteApiBaseUrlForFetch } from '@/api/apiBaseUrl';
import { refreshAccessTokenSingleFlight } from '@/api/authRefresh';
import { clientPlatformHeader } from '@/api/axios';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { isCapacitor } from '@/utils/capacitor';
import { getClientAppSemver } from '@/utils/clientAppVersion';
import { getAppUiLocaleForGameText } from '@/utils/gameText/appUiLocale';
import {
  gameIdsFromEntities,
  invalidateTouchedGames,
  patchAgentChatDetail,
  upsertActionFromStream,
  upsertMessage,
} from './agentCache';
import { attachAgentRun } from './agentRunAttach';
import { useAgentRunStore } from './agentRunStore';
import { publishAgentRunEvent } from './voice/agentRunEventBus';

export { buildAgentEventsUrl, parseAgentStreamFrame } from './agentRunAttach';

/** Web tabs keep fetches alive in the background; only force a reconnect after a real gap. */
const WEB_RESUME_STALE_MS = 20_000;

/**
 * Same headers the axios instance sends. `Last-Event-ID` is only sent same-origin (web):
 * native builds are cross-origin and the backend CORS allow-list does not carry it, so
 * native relies on `?after=` alone.
 */
export function buildAgentStreamHeaders(opts: {
  token: string | null;
  lastEventId: string | null;
  native: boolean;
}): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  headers['X-Client-Version'] = getClientAppSemver();
  headers['X-Client-Platform'] = clientPlatformHeader();
  headers['X-App-Locale'] = getAppUiLocaleForGameText();
  if (!opts.native) {
    headers['Cache-Control'] = 'no-cache';
    if (opts.lastEventId) headers['Last-Event-ID'] = opts.lastEventId;
  }
  return headers;
}

function patchCacheFromEvent(queryClient: QueryClient, chatId: string, event: AgentStreamEvent): void {
  if (event.type === 'message.saved') {
    patchAgentChatDetail(queryClient, chatId, (d) => upsertMessage(d, event.message));
  } else if (event.type === 'action.pending') {
    patchAgentChatDetail(queryClient, chatId, (d) => upsertActionFromStream(d, event.action));
  }
}

/**
 * Keep the chat view attached to its active run (QUEUED or RUNNING). Live state lives in
 * `useAgentRunStore` and survives unmount; this hook only owns the connection:
 * - mount / remount (back to the list and in again, other app tab and back, page reload)
 *   attaches: full replay without stored state, otherwise resume after the last event id;
 * - app resume (Capacitor `appStateChange`), tab visible after a gap, `online`: reconnect;
 * - unmount closes the connection; the run keeps going server-side.
 */
export function useAgentStream({ chatId, runId }: { chatId: string; runId: string | null }): void {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id);

  useEffect(() => {
    if (!runId) return;
    const native = isCapacitor();

    const invalidateChat = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chats() });
      return queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) });
    };

    const attachment = attachAgentRun(runId, chatId, {
      fetch: (input, init) => fetch(input, init),
      apiBaseUrl: resolveAbsoluteApiBaseUrlForFetch,
      headers: (lastEventId) =>
        buildAgentStreamHeaders({ token: localStorage.getItem('token'), lastEventId, native }),
      native,
      refreshToken: refreshAccessTokenSingleFlight,
      onEvent: (event, eventId) => {
        patchCacheFromEvent(queryClient, chatId, event);
        publishAgentRunEvent(runId, eventId, event);
      },
      onTerminal: async () => {
        const run = useAgentRunStore.getState().runs[runId];
        invalidateTouchedGames(queryClient, gameIdsFromEntities(run?.touchedEntities), { wrote: false, userId });
        await invalidateChat();
      },
      // Run gone or not ours any more: show whatever the server says now.
      onRefused: () => void invalidateChat(),
    });

    let capHandle: PluginListenerHandle | null = null;
    let capRemoved = false;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (attachment.msSinceLastByte() > WEB_RESUME_STALE_MS) attachment.reconnect();
    };
    const onOnline = () => attachment.reconnect();
    if (native) {
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        // A run that finished while suspended replays its terminal event (-> invalidation);
        // an expired stream answers 404 (-> onRefused refetch).
        if (isActive) attachment.reconnect();
      }).then((handle) => {
        if (capRemoved) void handle.remove();
        else capHandle = handle;
      });
    } else {
      document.addEventListener('visibilitychange', onVisible);
    }
    window.addEventListener('online', onOnline);

    return () => {
      attachment.detach();
      capRemoved = true;
      void capHandle?.remove();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [runId, chatId, queryClient, userId]);
}
