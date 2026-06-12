import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Send } from 'lucide-react';
import { STORY_COMMENT_MAX_CHARS } from '@/api/storyEngagement';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { lightHaptic } from '@/utils/lightHaptic';
import { displayUserName } from './storyEngagementFormat';
import type { StoryCommentDto } from '@/api/storyEngagement';

type StoryCommentComposerProps = {
  replyTo: StoryCommentDto | null;
  onCancelReply: () => void;
  onSubmit: (body: string) => Promise<void>;
};

export function StoryCommentComposer({
  replyTo,
  onCancelReply,
  onSubmit,
}: StoryCommentComposerProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleFocus = useCallback(() => {
    runWithProfileName(() => inputRef.current?.focus());
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText('');
    lightHaptic();
    void onSubmit(trimmed);
  }, [onSubmit, text]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      const platform = Capacitor.getPlatform();
      const isMobile = platform === 'ios' || platform === 'android';
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isMobile) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const showCounter = text.length > 400;

  return (
    <div
      className="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 pt-2"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
    >
      {replyTo ? (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-100 dark:bg-gray-800 px-3 py-2 text-xs">
          <span className="text-gray-600 dark:text-gray-300">
            {t('stories.viewer.replyingTo', { name: displayUserName(replyTo.author) })}
          </span>
          <button type="button" onClick={onCancelReply} className="font-semibold text-sky-600 dark:text-sky-400">
            {t('common.cancel')}
          </button>
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          maxLength={STORY_COMMENT_MAX_CHARS}
          placeholder={t('stories.viewer.commentPlaceholder')}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          onChange={(e) => setText(e.target.value.slice(0, STORY_COMMENT_MAX_CHARS))}
          className="flex-1 max-h-24 resize-none rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400"
        />
        <button
          type="button"
          disabled={!text.trim()}
          onClick={handleSend}
          aria-label={t('stories.viewer.sendComment')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white disabled:opacity-40"
        >
          <Send size={18} />
        </button>
      </div>
      {showCounter ? (
        <p className="mt-1 text-right text-[10px] tabular-nums text-gray-400 dark:text-gray-500">
          {text.length}/{STORY_COMMENT_MAX_CHARS}
        </p>
      ) : null}
    </div>
  );
}
