import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { MessageInput } from '@/components/MessageInput';
import { RequestToChat } from '@/components/chat/RequestToChat';
import { JoinGroupChannelButton } from '@/components/JoinGroupChannelButton';
import { isCapacitor } from '@/utils/capacitor';
import type { ChatContextType } from '@/api/chat';
import type { ChatMessage, GroupChannel } from '@/api/chat';
import type { Game, Bug } from '@/types';

export type GameChatFooterVariant =
  | { type: 'blocked' }
  | { type: 'request'; userChatId: string; disabled: boolean; onUserChatUpdate: (uc: any) => void }
  | {
      type: 'input';
      gameId?: string;
      userChatId?: string;
      groupChannelId?: string;
      game: Game | null;
      bug: Bug | null;
      groupChannel: GroupChannel | null;
      onOptimisticMessage: (payload: any) => string;
      onSendQueued: (params: any) => void;
      onSendFailed: (optimisticId: string) => void;
      onMessageCreated: (optimisticId: string, serverMessage: ChatMessage) => void;
      replyTo: ChatMessage | null;
      onCancelReply: () => void;
      editingMessage: ChatMessage | null;
      onCancelEdit: () => void;
      onEditMessage: (updated: ChatMessage) => void;
      lastOwnMessage: ChatMessage | null;
      onStartEditMessage: (message: ChatMessage) => void;
      onScrollToMessage: (messageId: string) => void;
      chatType: string;
      onGroupChannelUpdate?: () => void | Promise<void>;
      contextType: ChatContextType;
      contextId: string;
      translateToLanguage: string | null;
      onTranslateToLanguageChange: (value: string | null) => void | Promise<void>;
    }
  | {
      type: 'join';
      contextType: ChatContextType;
      groupChannel: GroupChannel | null;
      isChannel: boolean;
      onJoin: () => void;
      isLoading: boolean;
    };

export interface GameChatFooterProps {
  visible: boolean;
  keyboardHeight: number;
  variant: GameChatFooterVariant | null;
}

export const GameChatFooter: React.FC<GameChatFooterProps> = ({
  visible,
  keyboardHeight,
  variant,
}) => {
  const { t } = useTranslation();
  if (!visible) return null;
  const bottom = isCapacitor() && keyboardHeight > 0 ? `${keyboardHeight}px` : '0px';
  const paddingBottom = isCapacitor() && keyboardHeight > 0 ? '8px' : 'env(safe-area-inset-bottom)';
  const padStyle = {
    paddingLeft: 'max(1rem, env(safe-area-inset-left))' as const,
    paddingRight: 'max(1rem, env(safe-area-inset-right))' as const,
  };
  return (
    <footer
      className="flex-shrink-0 absolute left-0 right-0 bottom-0 z-50 !bg-transparent border-transparent transition-all duration-300"
      style={{ bottom, paddingBottom }}
    >
      {variant?.type === 'blocked' && (
        <div className="px-4 py-3" style={padStyle}>
          <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
            {t('chat.blockedByUser')}
          </div>
        </div>
      )}
      {variant?.type === 'request' && (
        <RequestToChat
          userChatId={variant.userChatId}
          disabled={variant.disabled}
          onUserChatUpdate={variant.onUserChatUpdate}
        />
      )}
      {variant?.type === 'input' && (
        <div className="relative overflow-visible">
          <MessageInput
            gameId={variant.gameId}
            userChatId={variant.userChatId}
            groupChannelId={variant.groupChannelId}
            game={variant.game}
            bug={variant.bug}
            groupChannel={variant.groupChannel}
            onOptimisticMessage={variant.onOptimisticMessage}
            onSendQueued={variant.onSendQueued}
            onSendFailed={variant.onSendFailed}
            onMessageCreated={variant.onMessageCreated}
            disabled={false}
            replyTo={variant.replyTo}
            onCancelReply={variant.onCancelReply}
            editingMessage={variant.editingMessage}
            onCancelEdit={variant.onCancelEdit}
            onEditMessage={variant.onEditMessage}
            lastOwnMessage={variant.lastOwnMessage}
            onStartEditMessage={variant.onStartEditMessage}
            onScrollToMessage={variant.onScrollToMessage}
            chatType={variant.chatType as any}
            onGroupChannelUpdate={variant.onGroupChannelUpdate}
            contextType={variant.contextType}
            contextId={variant.contextId}
            translateToLanguage={variant.translateToLanguage}
            onTranslateToLanguageChange={variant.onTranslateToLanguageChange}
          />
        </div>
      )}
      {variant?.type === 'join' && (
        <div className="px-4 py-3" style={padStyle}>
          <div className="flex items-center justify-center">
            {variant.groupChannel ? (
              <JoinGroupChannelButton
                groupChannel={variant.groupChannel}
                onJoin={variant.onJoin}
                isLoading={variant.isLoading}
              />
            ) : (
              <button
                onClick={variant.onJoin}
                disabled={variant.isLoading}
                className="w-full px-6 py-3 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {variant.isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  <>
                    <MessageCircle size={20} />
                    {variant.contextType === 'GROUP' && variant.isChannel
                      ? t('chat.joinChannel')
                      : variant.contextType === 'GROUP' && !variant.isChannel
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
