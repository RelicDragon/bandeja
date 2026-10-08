import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { ChatListKind } from './chatListSections';

type Props = {
  kind: ChatListKind;
  onKindChange: (kind: ChatListKind) => void;
  unreadCount: number;
  unreadActive: boolean;
  onUnreadToggle: () => void;
  invitationCount: number;
  /** Kinds with nothing to show get no chip. */
  availableKinds: Record<ChatListKind, boolean>;
  disabled?: boolean;
};

const chipBase =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors active:scale-[0.97]';
const chipIdle =
  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';
const chipActive = 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900';

const CHIP_SPRING = { type: 'spring', stiffness: 500, damping: 38, mass: 0.7 } as const;
/** Games / Groups arrive once the feed shows what exists; they pop in and the row slides over. */
const chipPresence = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.85 },
} as const;

/** All / Games / Groups / Unread row under the Chats search field. */
export function ChatListKindChips({
  kind,
  onKindChange,
  unreadCount,
  unreadActive,
  onUnreadToggle,
  invitationCount,
  availableKinds,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const reduceMotion = usePrefersReducedMotion();
  const motionProps = reduceMotion ? {} : { layout: 'position' as const, transition: CHIP_SPRING };
  const allKinds: Array<{ id: ChatListKind; label: string }> = [
    { id: 'all', label: t('chat.list.filterAll', { defaultValue: 'All' }) },
    { id: 'games', label: t('chat.list.filterGames', { defaultValue: 'Games' }) },
    { id: 'groups', label: t('chat.list.filterGroups', { defaultValue: 'Groups' }) },
  ];
  const kinds = allKinds.filter(({ id }) => availableKinds[id]);
  /** No chip with nothing unread; it stays while active so the filter can always be switched off. */
  const showUnread = unreadCount > 0 || unreadActive;

  return (
    <div
      role="toolbar"
      aria-label={t('chat.list.filters', { defaultValue: 'Chat filters' })}
      className={`flex gap-2 overflow-x-auto px-3 pb-2.5 scrollbar-hide ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {kinds.map(({ id, label }) => {
          const active = kind === id;
          return (
            <motion.button
              key={id}
              {...motionProps}
              {...(reduceMotion ? {} : chipPresence)}
              type="button"
              aria-pressed={active}
              onClick={() => onKindChange(id)}
              className={`${chipBase} ${active ? chipActive : chipIdle}`}
            >
              {label}
              {id === 'games' && invitationCount > 0 ? (
                <span
                  className={`tabular-nums ${active ? 'text-amber-300 dark:text-amber-600' : 'text-amber-600 dark:text-amber-400'}`}
                  aria-label={t('chat.list.invitationCount', {
                    value: invitationCount,
                    defaultValue: 'Invitations: {{value}}',
                  })}
                >
                  {invitationCount}
                </span>
              ) : null}
            </motion.button>
          );
        })}
        {showUnread ? (
          <motion.button
            key="unread"
            {...motionProps}
            {...(reduceMotion ? {} : chipPresence)}
            type="button"
            aria-pressed={unreadActive}
            onClick={onUnreadToggle}
            className={`${chipBase} ${unreadActive ? chipActive : chipIdle}`}
          >
            {t('chat.list.filterUnread', { defaultValue: 'Unread' })}
            {unreadCount > 0 ? (
              <span
                className={`rounded-full px-1.5 text-[11px] leading-[18px] tabular-nums ${
                  unreadActive ? 'bg-white/20 dark:bg-gray-900/15' : 'bg-red-500 text-white'
                }`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            ) : null}
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
