import { useCallback, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Square } from 'lucide-react';
import { AGENT_MESSAGE_MAX_LENGTH } from '@shared/agentContract';
import { useMessageInputMultiline } from '@/components/chat/useMessageInputMultiline';

const MIN_HEIGHT = 48;
const MAX_HEIGHT = 120;

interface AgentComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** A run is queued or streaming: the send button becomes Stop (cancel works for both). */
  running: boolean;
  stopping?: boolean;
  disabled?: boolean;
}

/** Pill composer forked from `MessageInput` (text only: no mentions, media, voice, drafts). */
export function AgentComposer({ value, onChange, onSend, onStop, running, stopping, disabled }: AgentComposerProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { inputContainerRef } = useMessageInputMultiline(value, 0);
  const canSend = !disabled && !running && value.trim().length > 0;

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight))}px`;
  }, [value]);

  const submit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      if (running) {
        onStop();
        return;
      }
      if (canSend) onSend();
    },
    [running, canSend, onSend, onStop],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const platform = Capacitor.getPlatform();
    const isNative = platform === 'ios' || platform === 'android';
    if (e.key === 'Enter' && !e.shiftKey && !isNative && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!running && canSend) onSend();
    }
  };

  return (
    <div className="p-3 overflow-visible">
      <form onSubmit={submit} className="relative mx-auto max-w-3xl overflow-visible">
        <div
          ref={inputContainerRef}
          className="message-input-panel relative min-w-0 w-full max-w-full overflow-visible rounded-[24px] border border-gray-200 bg-white transition-all dark:border-gray-700 dark:bg-gray-800"
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, AGENT_MESSAGE_MAX_LENGTH))}
            onKeyDown={handleKeyDown}
            maxLength={AGENT_MESSAGE_MAX_LENGTH}
            rows={1}
            dir="auto"
            disabled={disabled}
            placeholder={t('agent.composer.placeholder')}
            aria-label={t('agent.composer.placeholder')}
            className="block w-full resize-none overflow-y-auto rounded-[24px] bg-transparent py-3 pe-14 ps-5 text-[15px] text-gray-900 outline-none placeholder:text-gray-400 disabled:opacity-60 dark:text-gray-100 dark:placeholder:text-gray-500"
            style={{ minHeight: MIN_HEIGHT, maxHeight: MAX_HEIGHT }}
          />
          <button
            type="submit"
            disabled={running ? stopping : !canSend}
            className={`message-input-action-btn absolute bottom-0.5 end-[2px] z-10 flex h-11 w-11 items-center justify-center rounded-full text-white transition-all duration-200 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50 ${
              running
                ? 'bg-gray-800 dark:bg-gray-200 dark:text-gray-900'
                : 'bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 hover:from-blue-600 hover:via-blue-700 hover:to-blue-800'
            }`}
            aria-label={running ? t('agent.composer.stop') : t('agent.composer.send')}
          >
            {running ? (
              <Square size={16} fill="currentColor" aria-hidden />
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
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
