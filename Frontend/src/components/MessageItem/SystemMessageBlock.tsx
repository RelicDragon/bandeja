import React from 'react';
import { TFunction } from 'i18next';

interface SystemMessageBlockProps {
  displayContent: string;
  showAcceptDecline: boolean;
  onAccept: () => void;
  onDecline: () => void;
  respondingToRequest: boolean;
  createdAt: string;
  formatMessageTime: (dateString: string) => string;
  t: TFunction;
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
}) => (
  <div className="flex justify-center mb-4">
    <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl px-3 py-2 max-w-[80%]">
      <p className="text-xs text-gray-600 dark:text-gray-300 text-center whitespace-pre-wrap break-words break-all overflow-visible" style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
        {displayContent}
      </p>
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
    </div>
  </div>
);
