import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import { Check, Copy, Pencil, RotateCcw, Send, Share2, ThumbsDown, ThumbsUp, X } from 'lucide-react';
import { AGENT_MESSAGE_MAX_LENGTH, type AgentMessageFeedback } from '@shared/agentContract';
import { copyAgentMessageText, shareAgentMessageText } from '@/features/agent/agentMessageShare';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { hapticSelection } from '@/utils/haptics';

const COPIED_MS = 1500;
const EDITOR_MAX_HEIGHT = 220;
const FEEDBACK_COMMENT_MAX = 500;

interface AgentMessageActionsProps {
  /** Plain text to copy / share (resolved lazily so long turns aren't joined every render). */
  getText: () => string;
  align: 'start' | 'end';
  /** User messages: rewind-and-resend. Omitted on assistant replies. */
  onEdit?: () => void;
  editDisabled?: boolean;
  /** Latest reply only, no run live: resend the user message before it. */
  onRegenerate?: () => void;
  regenerateDisabled?: boolean;
  /** Stored assistant replies: thumbs up / down (`null` clears); a down vote can add a comment. */
  feedback?: AgentMessageFeedback | null;
  onFeedback?: (rating: AgentMessageFeedback | null, comment?: string) => void;
}

/**
 * Copy / Share / Edit under a message; Regenerate and thumbs under replies. Pointer devices
 * reveal it on hover (and keyboard focus) unless a vote is set; touch devices always show it.
 */
export function AgentMessageActions({
  getText,
  align,
  onEdit,
  editDisabled,
  onRegenerate,
  regenerateDisabled,
  feedback = null,
  onFeedback,
}: AgentMessageActionsProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const timerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
  }, []);

  const handleCopy = async () => {
    if (!(await copyAgentMessageText(getText()))) {
      toast.error(t('agent.message.copyFailed'));
      return;
    }
    setCopied(true);
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), COPIED_MS);
  };

  const handleShare = async () => {
    const outcome = await shareAgentMessageText(getText());
    if (outcome === 'copied') toast.success(t('common.copied'));
    else if (outcome === 'failed') toast.error(t('agent.message.copyFailed'));
  };

  const vote = (rating: AgentMessageFeedback) => {
    if (!onFeedback) return;
    hapticSelection();
    const next = feedback === rating ? null : rating;
    onFeedback(next);
    setCommentOpen(next === 'down');
  };

  const btn =
    'flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-200/70 hover:text-gray-700 active:bg-gray-200 disabled:pointer-events-none disabled:opacity-35 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-200 dark:active:bg-gray-800';

  const toolbar = (
    <div
      role="toolbar"
      aria-label={t('agent.message.actions')}
      className={`-mx-1 mt-0.5 flex gap-0.5 transition-opacity duration-150 ${
        feedback || commentOpen
          ? ''
          : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100'
      } ${align === 'end' ? 'justify-end' : 'justify-start'}`}
    >
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={copied ? t('common.copied') : t('common.copy')}
        title={copied ? t('common.copied') : t('common.copy')}
        className={btn}
      >
        {copied ? (
          <Check size={15} className="text-emerald-600 dark:text-emerald-400" aria-hidden />
        ) : (
          <Copy size={15} aria-hidden />
        )}
      </button>
      <button
        type="button"
        onClick={() => void handleShare()}
        aria-label={t('agent.message.share')}
        title={t('agent.message.share')}
        className={btn}
      >
        <Share2 size={15} aria-hidden />
      </button>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          disabled={editDisabled}
          data-agent-edit
          aria-label={t('common.edit')}
          title={t('common.edit')}
          className={btn}
        >
          <Pencil size={15} aria-hidden />
        </button>
      ) : null}
      {onRegenerate ? (
        <button
          type="button"
          onClick={() => {
            hapticSelection();
            onRegenerate();
          }}
          disabled={regenerateDisabled}
          aria-label={t('agent.message.regenerate')}
          title={t('agent.message.regenerate')}
          className={btn}
        >
          <RotateCcw size={15} aria-hidden />
        </button>
      ) : null}
      {onFeedback ? (
        <>
          <button
            type="button"
            onClick={() => vote('up')}
            aria-pressed={feedback === 'up'}
            aria-label={t('agent.message.goodReply')}
            title={t('agent.message.goodReply')}
            className={`${btn} ${feedback === 'up' ? '!text-primary-600 dark:!text-primary-400' : ''}`}
          >
            <ThumbsUp size={15} fill={feedback === 'up' ? 'currentColor' : 'none'} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => vote('down')}
            aria-pressed={feedback === 'down'}
            aria-label={t('agent.message.badReply')}
            title={t('agent.message.badReply')}
            className={`${btn} ${feedback === 'down' ? '!text-gray-800 dark:!text-gray-100' : ''}`}
          >
            <ThumbsDown size={15} fill={feedback === 'down' ? 'currentColor' : 'none'} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );

  if (!onFeedback) return toolbar;
  return (
    <>
      {toolbar}
      <AnimatePresence initial={false}>
        {commentOpen && feedback === 'down' ? (
          <FeedbackComment
            key="comment"
            onSend={(comment) => {
              onFeedback('down', comment);
              setCommentOpen(false);
            }}
            onDismiss={() => setCommentOpen(false)}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}

/** Optional one-line "what went wrong" under a down vote; Send or dismiss. */
function FeedbackComment({ onSend, onDismiss }: { onSend: (comment: string) => void; onDismiss: () => void }) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (trimmed) onSend(trimmed);
  };
  return (
    <motion.form
      onSubmit={submit}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="overflow-hidden"
    >
      <div className="mt-1 flex max-w-md items-center gap-1 rounded-full border border-gray-200 bg-white py-0.5 pe-0.5 ps-3 dark:border-gray-700 dark:bg-gray-800">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, FEEDBACK_COMMENT_MAX))}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onDismiss();
            }
          }}
          maxLength={FEEDBACK_COMMENT_MAX}
          enterKeyHint="send"
          dir="auto"
          placeholder={t('agent.message.feedbackPlaceholder')}
          aria-label={t('agent.message.feedbackPlaceholder')}
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
        <button
          type="submit"
          disabled={!trimmed}
          aria-label={t('agent.composer.send')}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-600 text-white transition-opacity disabled:opacity-40"
        >
          <Send size={14} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common.close')}
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
    </motion.form>
  );
}

interface AgentMessageEditorProps {
  initialText: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
  /** A run started meanwhile (another device): can't resend until it ends. */
  submitDisabled?: boolean;
}

/** Inline editor that replaces a user bubble (Enter sends on desktop, Escape cancels). */
export function AgentMessageEditor({ initialText, onCancel, onSubmit, submitDisabled }: AgentMessageEditorProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const canSubmit = !submitDisabled && trimmed.length > 0 && trimmed !== initialText.trim();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(EDITOR_MAX_HEIGHT, el.scrollHeight)}px`;
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
      return;
    }
    const platform = Capacitor.getPlatform();
    const isNative = platform === 'ios' || platform === 'android';
    if (e.key === 'Enter' && !e.shiftKey && !isNative && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSubmit) onSubmit(trimmed);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ transformOrigin: '100% 0%' }}
      className="ms-auto w-full max-w-[92%] rounded-2xl border border-primary-300 bg-white p-2 shadow-sm dark:border-primary-700 dark:bg-gray-800"
    >
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, AGENT_MESSAGE_MAX_LENGTH))}
        onKeyDown={handleKeyDown}
        maxLength={AGENT_MESSAGE_MAX_LENGTH}
        rows={1}
        dir="auto"
        aria-label={t('common.edit')}
        className="block w-full resize-none overflow-y-auto bg-transparent px-1.5 py-1 text-[15px] leading-relaxed text-gray-900 outline-none dark:text-gray-100"
        style={{ maxHeight: EDITOR_MAX_HEIGHT }}
      />
      <p className="px-1.5 pb-1 pt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{t('agent.message.editHint')}</p>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-3.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => onSubmit(trimmed)}
          disabled={!canSubmit}
          className="rounded-full bg-primary-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('agent.composer.send')}
        </button>
      </div>
    </motion.div>
  );
}
