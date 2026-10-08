import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { AGENT_VOICE_INPUT_SAMPLE_RATE, type AgentVoiceTurnPayload } from '@shared/agentVoiceRealtime';
import { agentApi } from '@/api/agent';
import { useWakeScreenForLiveScoring } from '@/hooks/useWakeScreenForLiveScoring';
import { isCapacitor } from '@/utils/capacitor';
import { useAuthStore } from '@/store/authStore';
import { getAppUiLocaleForGameText } from '@/utils/gameText/appUiLocale';
import { agentRunEventBacklog, subscribeAgentRunEvents } from './agentRunEventBus';
import { AgentVoiceController } from './agentVoiceController';
import { SocketAgentVoiceTransport } from './agentVoiceRealtimeTransport';
import type { AgentVoiceCloseReason, AgentVoiceNotice } from './agentVoiceSession';
import type { AgentVoiceViewState } from './agentVoiceViewState';
import { BrowserVoiceEngine } from './voiceAudioEngine';
import { isFatalVoiceNotice, voiceErrorNotice } from './voiceErrors';

/** `localStorage.agentVoiceV1 = '1'` forces the HTTP loop (debugging, A/B by hand). */
function realtimeVoiceEnabled(): boolean {
  try {
    return localStorage.getItem('agentVoiceV1') !== '1';
  } catch {
    return true;
  }
}

/** The voice socket refused the token: refresh it like `socketService`'s connect_error does. */
async function refreshAuth(): Promise<boolean> {
  const current = useAuthStore.getState().token;
  if (!current) return false;
  const { invalidateCachedAccessToken, refreshAccessTokenSingleFlight } = await import('@/api/authRefresh');
  invalidateCachedAccessToken(current);
  const token = await refreshAccessTokenSingleFlight();
  return !!token && token !== current && useAuthStore.getState().token === token;
}

export interface AgentVoiceConversationOptions {
  chatId: string;
  /** The chat's live run (QUEUED / RUNNING), followed and spoken while voice is on. */
  serverRunId: string | null;
  running: boolean;
  pendingAction: boolean;
  /** Sends a voice turn (`voice: true`); resolves with its run id. */
  send: (text: string) => Promise<string>;
  cancelRun: (runId: string) => Promise<void>;
  onClose: (reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null) => void;
  /** Localized line spoken when the reply is only a confirmation card (v1). */
  confirmPrompt: (title: string | null) => string;
  /** Realtime: a voice turn became a run (attach it, load the stored user message). */
  onTurn: (turn: AgentVoiceTurnPayload) => void;
  /** Realtime: the reply was cut short; the server stores the truncated text a moment later. */
  onReplyCut: () => void;
}

export interface AgentVoiceConversation {
  state: AgentVoiceViewState;
  active: boolean;
  session: AgentVoiceController;
}

/**
 * Wires an `AgentVoiceController` (realtime v2, v1 fallback) to the chat view: run events from
 * the chat's SSE attachment, the live run id, the pending-card state, app background (stops),
 * the screen wake lock.
 */
export function useAgentVoiceConversation(options: AgentVoiceConversationOptions): AgentVoiceConversation {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [session] = useState(
    () =>
      new AgentVoiceController({
        createEngine: () => new BrowserVoiceEngine(),
        createTransport: () => (realtimeVoiceEnabled() ? new SocketAgentVoiceTransport() : null),
        startPayload: (muted) => ({
          chatId: optionsRef.current.chatId,
          locale: getAppUiLocaleForGameText(),
          inputSampleRate: AGENT_VOICE_INPUT_SAMPLE_RATE,
          ...(muted ? { muted: true } : {}),
        }),
        onTurn: (turn) => optionsRef.current.onTurn(turn),
        onReplyCut: () => optionsRef.current.onReplyCut(),
        refreshAuth,
        onClose: (reason, notice) => optionsRef.current.onClose(reason, notice),
        v1: {
          transcribe: async (audio, durationMs, signal) => (await agentApi.transcribeVoice(audio, durationMs, signal)).text,
          synthesize: (text, signal) => agentApi.speakVoice(text, signal),
          send: (text) => optionsRef.current.send(text),
          cancelRun: (runId) => optionsRef.current.cancelRun(runId),
          backlog: agentRunEventBacklog,
          confirmPrompt: (title) => optionsRef.current.confirmPrompt(title),
          classifyError: (error) => {
            const notice = voiceErrorNotice(error);
            return { notice, fatal: isFatalVoiceNotice(notice) };
          },
        },
      }),
  );
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const active = state.phase !== 'off';

  useEffect(() => subscribeAgentRunEvents((runId, eventId, event) => session.onRunEvent(runId, eventId, event)), [session]);

  useEffect(() => {
    if (active && options.serverRunId) session.followRun(options.serverRunId);
  }, [active, options.serverRunId, session]);

  useEffect(() => {
    session.syncChat({ pendingAction: options.pendingAction, running: options.running });
  }, [options.pendingAction, options.running, state.phase, session]);

  // The app going to the background ends the conversation (iOS would cut the mic anyway).
  useEffect(() => {
    if (!active) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') session.stop('interrupted');
    };
    document.addEventListener('visibilitychange', onHidden);
    let capHandle: PluginListenerHandle | null = null;
    let removed = false;
    if (isCapacitor()) {
      void CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) session.stop('interrupted');
      }).then((handle) => {
        if (removed) void handle.remove();
        else capHandle = handle;
      });
    }
    return () => {
      removed = true;
      void capHandle?.remove();
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [active, session]);

  useEffect(() => () => session.stop('user'), [session]);

  useWakeScreenForLiveScoring(active);

  return { state, active, session };
}
