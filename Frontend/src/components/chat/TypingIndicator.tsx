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

  return (
    <AnimatePresence initial={false}>
      {typingUserIds.length > 0 && (
        <motion.div
          key="typing"
          role="status"
          aria-live="polite"
          aria-relevant="additions text"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden px-1"
        >
          <div className="flex items-center gap-1.5 min-h-[22px] text-xs text-gray-500 dark:text-gray-400 mb-1.5">
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
            <span className="flex gap-0.5 items-center shrink-0" aria-hidden>
              <span className="inline-block w-1 h-1 rounded-full bg-current typing-dot" />
              <span className="inline-block w-1 h-1 rounded-full bg-current typing-dot typing-dot-delay-1" />
              <span className="inline-block w-1 h-1 rounded-full bg-current typing-dot typing-dot-delay-2" />
            </span>
            <span className="truncate">{label}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
