import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayersStore } from '@/store/playersStore';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { fetchBasicUsersBatched } from '@/services/users/fetchBasicUsersBatched';
import {
  buildChatContextUserMap,
  formatBasicUserDisplayName,
  resolveChatContextUser,
  type ChatContextUserLookupParams,
} from '@/utils/chatContextUserLookup';
import type { BasicUser } from '@/types';
import { PANEL_ENTER_Y, PANEL_EXIT_Y, PANEL_TRANSITION } from '@/components/motion/motionTokens';

export interface TypingIndicatorProps extends ChatContextUserLookupParams {
  typingUserIds: string[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  typingUserIds,
  contextType,
  chatType,
  game,
  bug,
  groupChannel,
  userChat,
  currentUserId,
}) => {
  const { t } = useTranslation();
  const contextUserMap = useMemo(
    () =>
      buildChatContextUserMap({
        contextType,
        chatType,
        game,
        bug,
        groupChannel,
        userChat,
        currentUserId,
      }),
    [contextType, chatType, game, bug, groupChannel, userChat, currentUserId]
  );
  const storeUsers = usePlayersStore((s) => {
    const slice: Record<string, BasicUser | undefined> = {};
    for (const id of typingUserIds) slice[id] = s.users[id];
    return slice;
  });

  const resolvedUsers = useMemo(() => {
    return typingUserIds.map((id) =>
      resolveChatContextUser(id, contextUserMap, storeUsers[id])
    );
  }, [typingUserIds, contextUserMap, storeUsers]);

  useEffect(() => {
    const missing = typingUserIds.filter((_id, i) => !resolvedUsers[i]);
    if (missing.length === 0) return;
    void fetchBasicUsersBatched('typing-indicator', missing);
  }, [typingUserIds, resolvedUsers]);

  const label = useMemo(() => {
    if (typingUserIds.length === 0) return '';
    const names = resolvedUsers.map((u) => {
      const n = formatBasicUserDisplayName(u);
      return n || t('chat.typingSomeone', { defaultValue: 'Someone' });
    });
    if (names.length === 1) {
      return t('chat.typingOne', { name: names[0], defaultValue: '{{name}} is typing…' });
    }
    if (names.length === 2) {
      return t('chat.typingTwo', {
        name1: names[0],
        name2: names[1],
        defaultValue: '{{name1}} and {{name2}} are typing…',
      });
    }
    return t('chat.typingMany', { count: names.length, defaultValue: '{{count}} people are typing…' });
  }, [typingUserIds.length, resolvedUsers, t]);

  const avatarUsers = useMemo(
    () => resolvedUsers.filter((u): u is BasicUser => !!u).slice(0, 2),
    [resolvedUsers]
  );

  const panelClassName =
    'flex min-h-[28px] items-center gap-1.5 rounded-2xl border border-white/50 bg-white/85 px-2.5 py-1.5 text-xs text-gray-600 shadow-[0_4px_20px_rgba(0,0,0,0.08),inset_0_1px_0_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-gray-900/80 dark:text-gray-300 dark:shadow-[0_4px_20px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.06)]';

  return (
    <AnimatePresence initial={false}>
      {typingUserIds.length > 0 && (
        <motion.div
          key="typing"
          role="status"
          aria-live="polite"
          aria-relevant="additions text"
          initial={{ opacity: 0, y: PANEL_ENTER_Y }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: PANEL_EXIT_Y }}
          transition={PANEL_TRANSITION}
          className="mb-2 overflow-visible px-0.5 pt-1"
        >
          <div className={panelClassName}>
            {avatarUsers.length > 0 && (
              <span className="flex shrink-0 items-center -space-x-1" aria-hidden>
                {avatarUsers.map((u) => (
                  <PlayerAvatar
                    key={u.id}
                    player={u}
                    inlineFace
                    inlineFacePlain
                    inlineFaceSize="sm"
                    asDiv
                    subscribePresence={false}
                    showName={false}
                    fullHideName
                  />
                ))}
              </span>
            )}
            <span className="flex shrink-0 items-center gap-0.5 text-gray-500 dark:text-gray-400" aria-hidden>
              <span className="inline-block h-1 w-1 rounded-full bg-current typing-dot" />
              <span className="inline-block h-1 w-1 rounded-full bg-current typing-dot typing-dot-delay-1" />
              <span className="inline-block h-1 w-1 rounded-full bg-current typing-dot typing-dot-delay-2" />
            </span>
            <span className="min-w-0 truncate">{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
