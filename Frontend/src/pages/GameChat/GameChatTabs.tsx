import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChatType } from '@/types';
import type { LeagueGroupChatLink } from '@/api/leagues';
import { getLeagueGroupColor } from '@/utils/leagueGroupColors';

export interface GameChatTabsProps {
  availableChatTypes: ChatType[];
  currentChatType: ChatType;
  isSwitchingChatType: boolean;
  onChatTypeChange: (chatType: ChatType) => void;
  /** League season: the viewer's group chats, shown as extra tabs after the chat types. */
  groupChats?: LeagueGroupChatLink[];
  /** Set when the open thread is one of `groupChats`; that tab is active instead of a chat type. */
  activeGroupChatId?: string | null;
  onOpenGroupChat?: (groupChannelId: string) => void;
}

const tabClass = (active: boolean, disabled: boolean) =>
  `shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
    active
      ? 'bg-blue-500 text-white'
      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

export const GameChatTabs: React.FC<GameChatTabsProps> = ({
  availableChatTypes,
  currentChatType,
  isSwitchingChatType,
  onChatTypeChange,
  groupChats = [],
  activeGroupChatId = null,
  onOpenGroupChat,
}) => {
  const { t } = useTranslation();
  if (availableChatTypes.length + groupChats.length <= 1) return null;
  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div
        className="max-w-2xl mx-auto overflow-x-auto scrollbar-hide"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        <div className="flex w-max mx-auto space-x-1 py-2">
          {availableChatTypes.map((chatType) => (
            <button
              key={chatType}
              onClick={() => onChatTypeChange(chatType)}
              disabled={isSwitchingChatType}
              className={tabClass(!activeGroupChatId && currentChatType === chatType, isSwitchingChatType)}
            >
              {t(`chat.types.${chatType}`)}
            </button>
          ))}
          {groupChats.map((chat) => {
            const active = chat.groupChannelId === activeGroupChatId;
            return (
              <button
                key={chat.groupChannelId}
                onClick={() => !active && onOpenGroupChat?.(chat.groupChannelId)}
                disabled={isSwitchingChatType}
                className={tabClass(active, isSwitchingChatType)}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: active ? 'currentColor' : getLeagueGroupColor(chat.color) }}
                />
                {chat.groupName ?? t('gameDetails.groupChat')}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
