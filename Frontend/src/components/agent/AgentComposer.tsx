import { useCallback, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Capacitor } from '@capacitor/core';
import { AudioLines, Check, Loader2, Mic, Square, X } from 'lucide-react';
import { AGENT_MESSAGE_MAX_LENGTH } from '@shared/agentContract';
import { useMessageInputMultiline } from '@/components/chat/useMessageInputMultiline';
import { formatDurationClock } from '@/components/audio/audioWaveformUtils';
import { appendDictation } from '@/features/agent/voice/appendDictation';
import {
  DICTATION_LEVEL_HISTORY,
  useAgentDictation,
  type AgentDictationOutcome,
} from '@/features/agent/voice/useAgentDictation';
import { voiceErrorNotice } from '@/features/agent/voice/voiceErrors';

const MIN_HEIGHT = 48;
const MAX_HEIGHT = 120;

interface AgentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** Starts a hands-free voice conversation (the dock replaces this composer). */
  onStartVoice: () => void;
  /** A run is queued or streaming: the send button becomes Stop (cancel works for both). */
  running: boolean;
  stopping?: boolean;
  disabled?: boolean;
  /** Why sending is paused (rate limit / daily budget): replaces the placeholder and disables input. */
  pausedReason?: string | null;
}

/**
 * Pill composer forked from `MessageInput` (no mentions, media, drafts). Mic = dictation into
 * the draft (still editable before sending); the waveform button starts a voice conversation.
 */
export function AgentComposer({
  value,
  onChange,
  onSend,
  onStop,
  onStartVoice,
  running,
  stopping,
  disabled: disabledProp,
  pausedReason,
}: AgentComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const disabled = Boolean(disabledProp || pausedReason);
  const { inputContainerRef } = useMessageInputMultiline(value, 0);
  const hasText = value.trim().length > 0;
  const canSend = !disabled && !running && hasText;

  const valueRef = useRef(value);
  valueRef.current = value;
  const onDictation = useCallback(
    (outcome: AgentDictationOutcome) => {
      switch (outcome.kind) {
        case 'text':
          onChange(appendDictation(valueRef.current, outcome.text));
          requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
          break;
        case 'empty':
          toast(t('agent.voice.notice.notHeard'));
          break;
        case 'tooShort':
          toast(t('agent.voice.dictation.tooShort'));
          break;
        case 'micError':
          toast.error(t(outcome.reason === 'insecure' ? 'agent.voice.notice.micInsecure' : 'agent.voice.notice.micDenied'));
          break;
        case 'failed': {
          const notice = voiceErrorNotice(outcome.error);
          toast.error(t(`agent.voice.notice.${notice ?? 'transcribeFailed'}`));
          break;
        }
      }
    },
    [onChange, t],
  );
  const dictation = useAgentDictation(onDictation);
  const recording = dictation.phase === 'recording';
  const transcribing = dictation.phase === 'transcribing';

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight))}px`;
  }, [value, recording]);

  // Send / Stop swap the button under the pointer: keep focus in the text field (the keyboard stays up).
  const keepFocus = useCallback(() => {
    const active = document.activeElement;
    if (!active || !formRef.current?.contains(active)) return;
    requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
  }, []);

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (running) {
        keepFocus();
        onStop();
        return;
      }
      if (canSend) {
        keepFocus();
        onSend();
      }
    },
    [running, canSend, onSend, onStop, keepFocus],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const platform = Capacitor.getPlatform();
    const isNative = platform === 'ios' || platform === 'android';
    if (e.key === 'Enter' && !e.shiftKey && !isNative && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!running && canSend) onSend();
    }
  };

  const roundBtn =
    'message-input-action-btn flex h-11 w-11 items-center justify-center rounded-full transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50';
  const gradient =
    'bg-gradient-to-br from-primary-500 via-primary-600 to-primary-700 text-white hover:scale-105 hover:from-primary-600 hover:via-primary-700 hover:to-primary-800';

  return (
    <div className="p-3 overflow-visible">
      <form ref={formRef} onSubmit={submit} className="relative mx-auto max-w-3xl overflow-visible">
        <div
          ref={inputContainerRef}
          className="message-input-panel relative min-w-0 w-full max-w-full overflow-visible rounded-[24px] border border-gray-200 bg-white transition-all dark:border-gray-700 dark:bg-gray-800"
        >
          {recording ? (
            <div className="flex min-h-[48px] items-center gap-2 ps-1.5 pe-1.5" role="status" aria-live="polite">
              <button
                type="button"
                onClick={dictation.cancel}
                aria-label={t('agent.voice.dictation.cancel')}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              >
                <X size={18} aria-hidden />
              </button>
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-red-500 motion-safe:animate-pulse" aria-hidden />
              <span className="w-10 flex-shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                {formatDurationClock(dictation.durationMs)}
              </span>
              <span className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[3px] overflow-hidden" aria-hidden>
                {Array.from({ length: DICTATION_LEVEL_HISTORY }, (_, i) => {
                  // Newest on the end side; empty slots before the first samples.
                  const level = dictation.levels[i - (DICTATION_LEVEL_HISTORY - dictation.levels.length)] ?? 0;
                  return (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-primary-500/80 transition-[height] duration-100 dark:bg-primary-400/80"
                      style={{ height: `${Math.max(3, Math.round(Math.min(1, level * 1.6) * 28))}px` }}
                    />
                  );
                })}
              </span>
              <span className="sr-only">{t('agent.voice.dictation.recording')}</span>
              <button
                type="button"
                onClick={() => void dictation.finish()}
                aria-label={t('agent.voice.dictation.done')}
                className={`${roundBtn} ${gradient}`}
              >
                <Check size={20} aria-hidden />
              </button>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => onChange(e.target.value.slice(0, AGENT_MESSAGE_MAX_LENGTH))}
                onKeyDown={handleKeyDown}
                maxLength={AGENT_MESSAGE_MAX_LENGTH}
                rows={1}
                dir="auto"
                disabled={disabled || transcribing}
                placeholder={
                  pausedReason ?? (transcribing ? t('agent.voice.dictation.transcribing') : t('agent.composer.placeholder'))
                }
                aria-label={t('agent.composer.placeholder')}
                className="block w-full resize-none overflow-y-auto rounded-[24px] bg-transparent py-3 pe-[6.25rem] ps-5 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-gray-100 dark:placeholder:text-gray-500"
                style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
              />
              <div className="absolute bottom-0.5 end-[2px] z-10 flex items-center gap-1">
                {!running ? (
                  <button
                    type="button"
                    onClick={() => void dictation.start()}
                    disabled={disabled || transcribing}
                    aria-label={t('agent.voice.dictation.start')}
                    className={`${roundBtn} text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200`}
                  >
                    {transcribing ? <Loader2 size={20} className="animate-spin" aria-hidden /> : <Mic size={20} aria-hidden />}
                  </button>
                ) : null}
                {running ? (
                  <button
                    type="submit"
                    disabled={stopping}
                    className={`${roundBtn} bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900`}
                    aria-label={t('agent.composer.stop')}
                  >
                    <Square size={16} fill="currentColor" aria-hidden />
                  </button>
                ) : hasText ? (
                  <button type="submit" disabled={!canSend} className={`${roundBtn} ${gradient}`} aria-label={t('agent.composer.send')}>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onStartVoice}
                    disabled={disabled || transcribing}
                    className={`${roundBtn} ${gradient}`}
                    aria-label={t('agent.voice.start')}
                  >
                    <AudioLines size={20} aria-hidden />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        {value.length > AGENT_MESSAGE_MAX_LENGTH * 0.9 ? (
          <p className="mt-1 text-end text-[11px] text-gray-400">
            {value.length}/{AGENT_MESSAGE_MAX_LENGTH}
          </p>
        ) : null}
      </form>
    </div>
  );
}
