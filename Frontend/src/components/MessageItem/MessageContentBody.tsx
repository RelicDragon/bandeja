import React from 'react';
import { ParsedContentPart } from './types';
import { splitTextForThreadSearchHighlight } from '@/services/chat/chatLocalMessageSearchText';
import { getThreadSearchTextHighlightClass } from './threadSearchHighlightStyles';
import { isAllMentionId } from '@/utils/mentionAll';

export type ContentVariant = 'channel' | 'own' | 'other';

function renderThreadSearchHighlightedText(
  text: string,
  threadSearchHighlightQuery: string | null | undefined,
  variant: ContentVariant
): React.ReactNode {
  if (!threadSearchHighlightQuery) return text;
  const segments = splitTextForThreadSearchHighlight(text, threadSearchHighlightQuery);
  if (segments.length === 1 && !segments[0].highlight) return text;
  const highlightClassName = getThreadSearchTextHighlightClass(variant);
  return segments.map((segment, index) =>
    segment.highlight ? (
      <mark key={index} className={highlightClassName}>
        {segment.text}
      </mark>
    ) : (
      <React.Fragment key={index}>{segment.text}</React.Fragment>
    )
  );
}

function getMentionClassName(variant: ContentVariant, isMentioned: boolean, clickable: boolean): string {
  const base = clickable
    ? 'font-semibold cursor-pointer hover:underline '
    : 'font-semibold ';
  if (variant === 'channel') {
    return base + (isMentioned ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded' : 'text-blue-600 dark:text-blue-400');
  }
  if (variant === 'own') {
    return base + (isMentioned ? 'text-yellow-200 bg-yellow-500/30 px-1 rounded' : 'text-blue-100');
  }
  return base + (isMentioned ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded' : 'text-blue-600 dark:text-blue-400');
}

function getAppLinkClassName(variant: ContentVariant): string {
  const base = 'font-semibold cursor-pointer hover:underline inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded ';
  if (variant === 'channel') return base + 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
  if (variant === 'own') return base + 'text-yellow-200 bg-yellow-500/30';
  return base + 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
}

function getUrlClassName(variant: ContentVariant): string {
  if (variant === 'own') return 'underline text-blue-100';
  return 'underline text-blue-600 dark:text-blue-400';
}

interface MessageContentBodyProps {
  parts: ParsedContentPart[] | null;
  fallbackContent?: React.ReactNode;
  variant: ContentVariant;
  mentionIds?: string[];
  currentUserId?: string;
  onMentionClick: (userId: string) => void;
  onUrlClick: (url: string, e: React.MouseEvent) => void;
  className?: string;
  threadSearchHighlightQuery?: string | null;
}

export const MessageContentBody: React.FC<MessageContentBodyProps> = ({
  parts,
  fallbackContent,
  variant,
  mentionIds = [],
  currentUserId,
  onMentionClick,
  onUrlClick,
  className = '',
  threadSearchHighlightQuery = null,
}) => {
  const paragraphClass = 'text-sm whitespace-pre-wrap break-words break-all overflow-visible';
  const style = { wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const };

  return (
    <p className={`${paragraphClass} ${className}`} style={style}>
      {parts ? (
        parts.map((part, index) => {
          if (part.type === 'mention') {
            const isAll = isAllMentionId(part.userId);
            const isMentioned = isAll
              ? !!(currentUserId && mentionIds.includes(currentUserId))
              : mentionIds.includes(part.userId || '') || currentUserId === part.userId;
            return (
              <span
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  if (part.userId && !isAll) onMentionClick(part.userId);
                }}
                className={getMentionClassName(variant, isMentioned, !isAll)}
              >
                @{part.display}
              </span>
            );
          }
          if (part.type === 'url') {
            const isAppLink = part.urlType && part.urlType !== 'other';
            return (
              <a
                key={index}
                href={part.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (part.url) onUrlClick(part.url, e);
                }}
                className={isAppLink ? getAppLinkClassName(variant) : getUrlClassName(variant)}
              >
                {isAppLink && <span aria-hidden className="opacity-90">↗</span>}
                {renderThreadSearchHighlightedText(
                  part.displayText || part.content,
                  threadSearchHighlightQuery,
                  variant
                )}
              </a>
            );
          }
          return (
            <span key={index}>
              {renderThreadSearchHighlightedText(part.content, threadSearchHighlightQuery, variant)}
            </span>
          );
        })
      ) : (
        <span>
          {typeof fallbackContent === 'string'
            ? renderThreadSearchHighlightedText(fallbackContent, threadSearchHighlightQuery, variant)
            : fallbackContent}
        </span>
      )}
    </p>
  );
};
