import React from 'react';
import { TFunction } from 'i18next';
import { splitTextForThreadSearchHighlight } from '@/services/chat/chatLocalMessageSearchText';
import { getThreadSearchBubbleRingClass, THREAD_SEARCH_SYSTEM_TEXT_HIGHLIGHT_CLASS } from './threadSearchHighlightStyles';

interface SystemMessageBlockProps {
  displayContent: string;
  showAcceptDecline: boolean;
  onAccept: () => void;
  onDecline: () => void;
  respondingToRequest: boolean;
  createdAt: string;
  formatMessageTime: (dateString: string) => string;
  t: TFunction;
  cornerSlot?: React.ReactNode;
  isThreadSearchOutline?: boolean;
  threadSearchHighlightQuery?: string | null;
}

function renderSystemMessageContent(
  displayContent: string,
  threadSearchHighlightQuery: string | null | undefined
): React.ReactNode {
  if (!threadSearchHighlightQuery) return displayContent;
  const segments = splitTextForThreadSearchHighlight(displayContent, threadSearchHighlightQuery);
  if (segments.length === 1 && !segments[0].highlight) return displayContent;
  return segments.map((segment, index) =>
    segment.highlight ? (
      <mark
        key={index}
        className={THREAD_SEARCH_SYSTEM_TEXT_HIGHLIGHT_CLASS}
      >
        {segment.text}
      </mark>
    ) : (
      <React.Fragment key={index}>{segment.text}</React.Fragment>
    )
  );
}

export const SystemMessageBlock: React.FC<SystemMessageBlockProps> = ({
  displayContent,
  showAcceptDecline,
  onAccept,
  onDecline,
  respondingToRequest,
  createdAt,
  formatMessageTime,
  t,
  cornerSlot,
  isThreadSearchOutline = false,
  threadSearchHighlightQuery = null,
}) => (
  <div className="flex justify-center">
    <div
      className={`relative bg-gray-100 dark:bg-gray-700 rounded-2xl px-3 py-2 max-w-[80%] ${isThreadSearchOutline ? getThreadSearchBubbleRingClass(false, false) : ''}`}
    >
      <div data-message-bubble="true" className="select-none">
        <p className="text-xs text-gray-600 dark:text-gray-300 text-center whitespace-pre-wrap break-words break-all overflow-visible" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
          {renderSystemMessageContent(displayContent, threadSearchHighlightQuery)}
        </p>
      </div>
      {showAcceptDecline && (
        <div className="flex gap-2 mt-2 justify-center">
          <button
            onClick={onAccept}
            disabled={respondingToRequest}
            className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
          >
            {t('common.accept')}
          </button>
          <button
            onClick={onDecline}
            disabled={respondingToRequest}
            className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
          >
            {t('common.decline')}
          </button>
        </div>
      )}
      <span className="text-[10px] text-gray-400 dark:text-gray-500 block text-center mt-1">
        {formatMessageTime(createdAt)}
      </span>
      {cornerSlot}
    </div>
  </div>
);
