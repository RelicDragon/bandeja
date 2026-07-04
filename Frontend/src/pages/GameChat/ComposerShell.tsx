import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { MessageInput } from '@/components/MessageInput';
import { RequestToChat } from '@/components/chat/RequestToChat';
import { JoinGroupChannelButton } from '@/components/JoinGroupChannelButton';
import { CHAT_PANEL_TRANSITION } from '@/components/chat/chatListMotion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { PANEL_ENTER_Y, PANEL_EXIT_Y } from '@/components/motion/motionTokens';
import { useThreadComposer } from './useThreadView';
import type { GameChatFooterVariant } from './GameChatFooter';

const COMPOSER_DOCK_MIN_H = '4.5rem';

const panelMotionProps = {
  initial: { opacity: 0, y: PANEL_ENTER_Y },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: PANEL_EXIT_Y },
  transition: CHAT_PANEL_TRANSITION,
} as const;

export interface ComposerShellProps {
  visible: boolean;
  variant: GameChatFooterVariant | null;
}

/** Composer stays mounted through variant transitions; visibility toggles preserve draft/voice state. */
export const ComposerShell: React.FC<ComposerShellProps> = ({ visible, variant }) => {
  const { t } = useTranslation();
  const composer = useThreadComposer();
  const reduceMotion = usePrefersReducedMotion();
  if (!visible) return null;

  const padStyle = {
    paddingLeft: 'max(1rem, env(safe-area-inset-left))' as const,
    paddingRight: 'max(1rem, env(safe-area-inset-right))' as const,
  };

  const showInput = variant?.type === 'input';
  const showArchived = variant?.type === 'archived';
  const showBlocked = variant?.type === 'blocked';
  const showRequest = variant?.type === 'request' && !!composer.userChat && !!(composer.id ?? composer.userChat.id);
  const showJoin = variant?.type === 'join';
  const altVariantKey = showArchived
    ? 'archived'
    : showBlocked
      ? 'blocked'
      : showRequest
        ? 'request'
        : showJoin
          ? 'join'
          : null;

  const archivedPanel = (
    <div className="px-4 py-3" style={padStyle}>
      <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700">
        {t('chat.archivedGameChatBanner')}
      </div>
    </div>
  );

  const blockedPanel = (
    <div className="px-4 py-3" style={padStyle}>
      <div className="text-sm text-center text-gray-700 dark:text-gray-300 rounded-[20px] px-4 py-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700">
        {t('chat.blockedByUser')}
      </div>
    </div>
  );

  const requestPanel = (
    <RequestToChat
      userChatId={composer.id ?? composer.userChat!.id ?? ''}
      disabled={composer.hasMessages}
      onUserChatUpdate={(uc) => composer.setUserChat((prev) => (prev ? { ...prev, ...uc } : null))}
    />
  );

  const joinPanel = (
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
            className="w-full px-6 py-3 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-600 hover:via-blue-700 hover:to-blue-800 transition-all duration-[400ms] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
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
  );

  if (reduceMotion) {
    return (
      <footer
        data-cap-chat-composer
        className="flex-shrink-0 absolute left-0 right-0 bottom-0 z-50 !bg-transparent border-transparent"
        style={{ minHeight: COMPOSER_DOCK_MIN_H }}
      >
        <div className={showInput ? 'relative overflow-visible' : 'hidden'} aria-hidden={!showInput}>
          <MessageInput />
        </div>
        {showBlocked && blockedPanel}
        {showArchived && archivedPanel}
        {showRequest && requestPanel}
        {showJoin && joinPanel}
      </footer>
    );
  }

  return (
    <footer
      data-cap-chat-composer
      className="flex-shrink-0 absolute left-0 right-0 bottom-0 z-50 !bg-transparent border-transparent"
      style={{ minHeight: COMPOSER_DOCK_MIN_H }}
    >
      <motion.div
        initial={false}
        animate={showInput ? { opacity: 1, y: 0 } : { opacity: 0, y: PANEL_EXIT_Y }}
        transition={CHAT_PANEL_TRANSITION}
        className={
          showInput
            ? 'relative overflow-visible'
            : 'pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden'
        }
        style={{ visibility: showInput ? 'visible' : 'hidden' }}
        aria-hidden={!showInput}
      >
        <MessageInput />
      </motion.div>

      <AnimatePresence initial={false} mode="wait">
        {altVariantKey === 'archived' && (
          <motion.div key="archived" {...panelMotionProps}>
            {archivedPanel}
          </motion.div>
        )}
        {altVariantKey === 'blocked' && (
          <motion.div key="blocked" {...panelMotionProps}>
            {blockedPanel}
          </motion.div>
        )}
        {altVariantKey === 'request' && (
          <motion.div key="request" {...panelMotionProps}>
            {requestPanel}
          </motion.div>
        )}
        {altVariantKey === 'join' && (
          <motion.div key="join" {...panelMotionProps}>
            {joinPanel}
          </motion.div>
        )}
      </AnimatePresence>
    </footer>
  );
};
