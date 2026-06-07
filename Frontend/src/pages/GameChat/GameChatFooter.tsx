import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { MessageInput } from '@/components/MessageInput';
import { RequestToChat } from '@/components/chat/RequestToChat';
import { JoinGroupChannelButton } from '@/components/JoinGroupChannelButton';
import { useThreadView } from './useThreadView';

export type GameChatFooterVariant =
  | { type: 'blocked' }
  | { type: 'request' }
  | { type: 'input' }
  | { type: 'join' }
  | { type: 'contextLoading' };

export interface GameChatFooterProps {
  visible: boolean;
  variant: GameChatFooterVariant | null;
}

export const GameChatFooter: React.FC<GameChatFooterProps> = ({
  visible,
  variant,
}) => {
  const { t } = useTranslation();
  const thread = useThreadView();
  if (!visible) return null;
  const padStyle = {
    paddingLeft: 'max(1rem, env(safe-area-inset-left))' as const,
    paddingRight: 'max(1rem, env(safe-area-inset-right))' as const,
  };
  return (
    <footer
      data-cap-chat-composer
      className="flex-shrink-0 absolute left-0 right-0 bottom-0 z-50 !bg-transparent border-transparent transition-all duration-300"
    >
      {variant?.type === 'blocked' && (
        <div className="px-4 py-3" style={padStyle}>
          <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
            {t('chat.blockedByUser')}
          </div>
        </div>
      )}
      {variant?.type === 'request' && thread.userChat && thread.id && (
        <RequestToChat
          userChatId={thread.id ?? thread.userChat.id ?? ''}
          disabled={thread.messages.length > 0}
          onUserChatUpdate={(uc) => thread.setUserChat((prev) => (prev ? { ...prev, ...uc } : null))}
        />
      )}
      {variant?.type === 'input' && (
        <div className="relative overflow-visible">
          <MessageInput />
        </div>
      )}
      {variant?.type === 'contextLoading' && (
        <div className="px-4 py-3" style={padStyle}>
          <div className="flex items-center justify-center py-2">
            <span className="text-xs font-medium tabular-nums tracking-wide bg-gradient-to-r from-gray-400 via-gray-600 to-gray-400 dark:from-gray-500 dark:via-gray-300 dark:to-gray-500 bg-[length:220%_100%] bg-clip-text text-transparent animate-loadingTextShimmer">
              {t('common.loading')}
            </span>
          </div>
        </div>
      )}
      {variant?.type === 'join' && (
        <div className="px-4 py-3" style={padStyle}>
          <div className="flex items-center justify-center">
            {thread.groupChannel ? (
              <JoinGroupChannelButton
                groupChannel={thread.groupChannel}
                onJoin={thread.handleJoinAsGuest}
                isLoading={thread.isJoiningAsGuest}
              />
            ) : (
              <button
                onClick={thread.handleJoinAsGuest}
                disabled={thread.isJoiningAsGuest}
                className="w-full px-6 py-3 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {thread.isJoiningAsGuest ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <MessageCircle size={20} />
                    {thread.contextType === 'GROUP' && thread.derived.isChannel
                      ? t('chat.joinChannel')
                      : thread.contextType === 'GROUP' && !thread.derived.isChannel
                        ? t('chat.joinGroup')
                        : t('chat.joinChatToSend')}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </footer>
  );
};
