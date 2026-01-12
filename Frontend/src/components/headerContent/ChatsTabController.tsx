import { useTranslation } from 'react-i18next';
import { useNavigationStore } from '@/store/navigationStore';
import { useChatUnreadCounts } from '@/hooks/useChatUnreadCounts';
import { usePlayersStore } from '@/store/playersStore';

export const ChatsTabController = () => {
  const { t } = useTranslation();
  const { chatsFilter, setChatsFilter } = useNavigationStore();
  const { counts } = useChatUnreadCounts();
  const unreadCounts = usePlayersStore((state) => state.unreadCounts);
  const userChatsCount = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => setChatsFilter('users')}
        className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          chatsFilter === 'users'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('chats.users', { defaultValue: 'Users' })}
        {userChatsCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
            {userChatsCount > 99 ? '99+' : userChatsCount}
          </span>
        )}
      </button>
      <button
        onClick={() => setChatsFilter('bugs')}
        className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          chatsFilter === 'bugs'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('chats.bugs', { defaultValue: 'Bugs' })}
        {counts.bugs > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
            {counts.bugs > 99 ? '99+' : counts.bugs}
          </span>
        )}
      </button>
    </div>
  );
};
