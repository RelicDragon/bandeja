import React from 'react';
import { ParsedContentPart } from './types';

export type ContentVariant = 'channel' | 'own' | 'other';

function getMentionClassName(variant: ContentVariant, isMentioned: boolean): string {
  const base = 'font-semibold cursor-pointer hover:underline ';
  if (variant === 'channel') {
    return base + (isMentioned ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded' : 'text-blue-600 dark:text-blue-400');
  }
  if (variant === 'own') {
    return base + (isMentioned ? 'text-yellow-200 bg-yellow-500/30 px-1 rounded' : 'text-blue-100');
  }
  return base + (isMentioned ? 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1 rounded' : 'text-blue-600 dark:text-blue-400');
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
}) => {
  const paragraphClass = 'text-sm whitespace-pre-wrap break-words break-all overflow-visible';
  const style = { wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const };

  return (
    <p className={`${paragraphClass} ${className}`} style={style}>
      {parts ? (
        parts.map((part, index) => {
          if (part.type === 'mention') {
            const isMentioned = mentionIds.includes(part.userId || '') || currentUserId === part.userId;
            return (
              <span
                key={index}
                onClick={(e) => {
                  e.stopPropagation();
                  if (part.userId) onMentionClick(part.userId);
                }}
                className={getMentionClassName(variant, isMentioned)}
              >
                @{part.display}
              </span>
            );
          }
          if (part.type === 'url') {
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
                className={getUrlClassName(variant)}
              >
                {part.displayText || part.content}
              </a>
            );
          }
          return <span key={index}>{part.content}</span>;
        })
      ) : (
        <span>{fallbackContent}</span>
      )}
    </p>
  );
};
