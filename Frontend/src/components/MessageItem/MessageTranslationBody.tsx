import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Languages } from 'lucide-react';
import type { TFunction } from 'i18next';
import { MessageContentBody, type ContentVariant } from './MessageContentBody';
import type { ParsedContentPart } from './types';

interface MessageTranslationBodyProps {
  messageId: string;
  parsedContent: ParsedContentPart[] | null;
  translationContent: ParsedContentPart[] | null;
  displayContent: string;
  translationFallback?: string;
  variant: ContentVariant;
  contentVariantForTranslation: ContentVariant;
  mentionIds: string[];
  currentUserId: string | undefined;
  onMentionClick: (userId: string) => void;
  onUrlClick: (url: string, e: React.MouseEvent) => void;
  threadSearchHighlightQuery?: string | null;
  isChannel: boolean;
  isOwnMessage: boolean;
  translationRevealKey?: string;
  hiddenUrl?: string | null;
  t: TFunction;
}

export const MessageTranslationBody: React.FC<MessageTranslationBodyProps> = ({
  messageId,
  parsedContent,
  translationContent,
  displayContent,
  translationFallback,
  variant,
  contentVariantForTranslation,
  mentionIds,
  currentUserId,
  onMentionClick,
  onUrlClick,
  threadSearchHighlightQuery = null,
  isChannel,
  isOwnMessage,
  translationRevealKey,
  hiddenUrl = null,
  t,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [shouldAnimateEnter, setShouldAnimateEnter] = useState(!!translationRevealKey);

  useEffect(() => {
    setShowOriginal(false);
    setShouldAnimateEnter(false);
  }, [messageId]);

  useEffect(() => {
    if (translationRevealKey) setShouldAnimateEnter(true);
  }, [translationRevealKey]);

  const labelClass = isChannel
    ? 'text-gray-500 dark:text-gray-400'
    : isOwnMessage
      ? 'text-blue-100/80 hover:text-blue-50'
      : 'text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300';

  const contentClass = isChannel
    ? 'text-gray-600 dark:text-gray-400'
    : isOwnMessage
      ? 'text-blue-50'
      : 'text-gray-600 dark:text-gray-400';

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShouldAnimateEnter(true);
    setShowOriginal((prev) => !prev);
  };

  return (
    <div className={contentClass}>
      <button
        type="button"
        onClick={handleToggle}
        className={`text-[10px] uppercase tracking-wide opacity-70 mb-1 flex items-center gap-1 cursor-pointer transition-colors ${labelClass}`}
      >
        <Languages size={10} aria-hidden />
        {showOriginal
          ? t('chat.autoTranslateOriginalLabel', { defaultValue: 'Original' })
          : t('chat.autoTranslatedLabel', { defaultValue: 'Translated' })}
      </button>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={showOriginal ? 'original' : 'translation'}
          initial={shouldAnimateEnter ? { opacity: 0, y: 6 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <MessageContentBody
            parts={showOriginal ? parsedContent : translationContent}
            fallbackContent={showOriginal ? displayContent : translationFallback}
            variant={showOriginal ? variant : contentVariantForTranslation}
            mentionIds={mentionIds}
            currentUserId={currentUserId}
            onMentionClick={onMentionClick}
            onUrlClick={onUrlClick}
            threadSearchHighlightQuery={showOriginal ? threadSearchHighlightQuery : null}
            hiddenUrl={hiddenUrl}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
