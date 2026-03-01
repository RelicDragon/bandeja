import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react';
import type { ChatType } from '@/types';

export interface GameChatTabsProps {
  availableChatTypes: ChatType[];
  currentChatType: ChatType;
  isSwitchingChatType: boolean;
  onChatTypeChange: (chatType: ChatType) => void;
}

export const GameChatTabs: React.FC<GameChatTabsProps> = ({
  availableChatTypes,
  currentChatType,
  isSwitchingChatType,
  onChatTypeChange,
}) => {
  const { t } = useTranslation();
  if (availableChatTypes.length <= 1) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div
        className="max-w-2xl mx-auto px-4"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex justify-center space-x-1 py-2">
          {availableChatTypes.map((chatType) => (
            <button
              key={chatType}
              onClick={() => onChatTypeChange(chatType)}
              disabled={isSwitchingChatType}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                currentChatType === chatType
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
              } ${isSwitchingChatType ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {chatType === 'PHOTOS' ? (
                <Camera size={18} />
              ) : (
                t(`chat.types.${chatType}`)
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
