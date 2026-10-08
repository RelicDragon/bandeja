import { useTranslation } from 'react-i18next';
import type { ChatListKind } from './chatListSections';

type Props = {
  kind: ChatListKind;
  onKindChange: (kind: ChatListKind) => void;
  unreadCount: number;
  unreadActive: boolean;
  onUnreadToggle: () => void;
  invitationCount: number;
  disabled?: boolean;
};

const chipBase =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors active:scale-[0.97]';
const chipIdle =
  'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700';
const chipActive = 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900';

/** All / Games / Groups / Unread row under the Chats search field. */
export function ChatListKindChips({
  kind,
  onKindChange,
  unreadCount,
  unreadActive,
  onUnreadToggle,
  invitationCount,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const kinds: Array<{ id: ChatListKind; label: string }> = [
    { id: 'all', label: t('chat.list.filterAll', { defaultValue: 'All' }) },
    { id: 'games', label: t('chat.list.filterGames', { defaultValue: 'Games' }) },
    { id: 'groups', label: t('chat.list.filterGroups', { defaultValue: 'Groups' }) },
  ];

  return (
    <div
      role="toolbar"
      aria-label={t('chat.list.filters', { defaultValue: 'Chat filters' })}
      className={`flex gap-2 overflow-x-auto px-3 pb-2.5 scrollbar-hide ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      {kinds.map(({ id, label }) => {
        const active = kind === id;
        return (
          <button
            key={id}
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
          </button>
        );
      })}
      <button
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
      </button>
    </div>
  );
}
