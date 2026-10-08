import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Plus } from 'lucide-react';
import type { ChatListSectionId } from './chatListSections';

const SECTION_LABEL: Record<ChatListSectionId, { key: string; fallback: string }> = {
  nextUp: { key: 'chat.list.sectionNextUp', fallback: 'Next up' },
  invitations: { key: 'chat.list.sectionInvitations', fallback: 'Invitations' },
  chats: { key: 'chat.list.sectionChats', fallback: 'Chats' },
  upcoming: { key: 'chat.list.sectionUpcoming', fallback: 'Upcoming' },
  past: { key: 'chat.list.sectionPast', fallback: 'Past' },
};

export function ChatListSectionHeader({ section }: { section: ChatListSectionId }) {
  const { t } = useTranslation();
  const label = SECTION_LABEL[section];
  return (
    <h2 className="px-4 pb-1.5 pt-3.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {t(label.key, { defaultValue: label.fallback })}
    </h2>
  );
}

/** Closes the Games view: the way to more games when the list runs out. */
export function ChatListFindGameRow() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="px-3 pb-4 pt-3">
      <button
        type="button"
        onClick={() => navigate('/find')}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-gray-300 p-3 text-start transition-colors hover:bg-gray-50 active:scale-[0.99] dark:border-gray-700 dark:hover:bg-gray-800/60"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300">
          <Plus className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-gray-900 dark:text-white">
            {t('chat.list.findGame', { defaultValue: 'Find a game' })}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">
            {t('chat.list.findGameHint', { defaultValue: 'Open games near you' })}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 rtl:rotate-180" aria-hidden />
      </button>
    </div>
  );
}
