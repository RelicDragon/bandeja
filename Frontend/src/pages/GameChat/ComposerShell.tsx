import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { MessageInput } from '@/components/MessageInput';
import { RequestToChat } from '@/components/chat/RequestToChat';
import { JoinGroupChannelButton } from '@/components/JoinGroupChannelButton';
import { useThreadComposer } from './useThreadView';
import type { GameChatFooterVariant } from './GameChatFooter';

const COMPOSER_DOCK_MIN_H = '4.5rem';

export interface ComposerShellProps {
  visible: boolean;
  variant: GameChatFooterVariant | null;
}

/** Composer stays mounted through variant transitions; visibility toggles preserve draft/voice state. */
export const ComposerShell: React.FC<ComposerShellProps> = ({ visible, variant }) => {
  const { t } = useTranslation();
  const composer = useThreadComposer();
  if (!visible) return null;

  const padStyle = {
    paddingLeft: 'max(1rem, env(safe-area-inset-left))' as const,
    paddingRight: 'max(1rem, env(safe-area-inset-right))' as const,
  };

  const showInput = variant?.type === 'input';

  return (
    <footer
      data-cap-chat-composer
      className="flex-shrink-0 absolute left-0 right-0 bottom-0 z-50 !bg-transparent border-transparent"
      style={{ minHeight: COMPOSER_DOCK_MIN_H }}
    >
      {variant?.type === 'blocked' && (
        <div className="px-4 py-3" style={padStyle}>
          <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
            {t('chat.blockedByUser')}
          </div>
        </div>
      )}

      {variant?.type === 'request' && composer.userChat && composer.id && (
        <div>
          <RequestToChat
            userChatId={composer.id ?? composer.userChat.id ?? ''}
            disabled={composer.hasMessages}
            onUserChatUpdate={(uc) => composer.setUserChat((prev) => (prev ? { ...prev, ...uc } : null))}
          />
        </div>
      )}

      {showInput && (
        <div className="relative overflow-visible">
          <MessageInput />
        </div>
      )}

      {variant?.type === 'join' && (
        <div className="px-4 py-3" style={padStyle}>
          <div className="flex items-center justify-center">
            {composer.groupChannel ? (
              <JoinGroupChannelButton
                groupChannel={composer.groupChannel}
                onJoin={composer.handleJoinAsGuest}
                isLoading={composer.isJoiningAsGuest}
              />
            ) : (
              <button
                onClick={composer.handleJoinAsGuest}
                disabled={composer.isJoiningAsGuest}
                className="w-full px-6 py-3 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {composer.isJoiningAsGuest ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <MessageCircle size={20} />
                    {composer.contextType === 'GROUP' && composer.isChannel
                      ? t('chat.joinChannel')
                      : composer.contextType === 'GROUP' && !composer.isChannel
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
