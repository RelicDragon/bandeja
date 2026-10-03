import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { agentApi } from '@/api/agent';
import { useWakeScreenForLiveScoring } from '@/hooks/useWakeScreenForLiveScoring';
import { isCapacitor } from '@/utils/capacitor';
import { agentRunEventBacklog, subscribeAgentRunEvents } from './agentRunEventBus';
import {
  AgentVoiceSession,
  type AgentVoiceCloseReason,
  type AgentVoiceNotice,
  type AgentVoiceState,
} from './agentVoiceSession';
import { BrowserVoiceEngine } from './voiceAudioEngine';
import { isFatalVoiceNotice, voiceErrorNotice } from './voiceErrors';

export interface AgentVoiceConversationOptions {
  /** The chat's live run (QUEUED / RUNNING), followed and spoken while voice is on. */
  serverRunId: string | null;
  running: boolean;
  pendingAction: boolean;
  /** Sends a voice turn (`voice: true`); resolves with its run id. */
  send: (text: string) => Promise<string>;
  cancelRun: (runId: string) => Promise<void>;
  onClose: (reason: AgentVoiceCloseReason, notice: AgentVoiceNotice | null) => void;
  /** Localized line spoken when the reply is only a confirmation card. */
  confirmPrompt: (title: string | null) => string;
}

export interface AgentVoiceConversation {
  state: AgentVoiceState;
  active: boolean;
  session: AgentVoiceSession;
}

/**
 * Wires an `AgentVoiceSession` to the chat view: run events from the chat's SSE attachment,
 * the live run id, the pending-card state, app background (stops), the screen wake lock.
 */
export function useAgentVoiceConversation(options: AgentVoiceConversationOptions): AgentVoiceConversation {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [session] = useState(
    () =>
      new AgentVoiceSession({
        createEngine: () => new BrowserVoiceEngine(),
        transcribe: async (audio, durationMs, signal) => (await agentApi.transcribeVoice(audio, durationMs, signal)).text,
        synthesize: (text, signal) => agentApi.speakVoice(text, signal),
        send: (text) => optionsRef.current.send(text),
        cancelRun: (runId) => optionsRef.current.cancelRun(runId),
        backlog: agentRunEventBacklog,
        onClose: (reason, notice) => optionsRef.current.onClose(reason, notice),
        confirmPrompt: (title) => optionsRef.current.confirmPrompt(title),
        classifyError: (error) => {
          const notice = voiceErrorNotice(error);
          return { notice, fatal: isFatalVoiceNotice(notice) };
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
