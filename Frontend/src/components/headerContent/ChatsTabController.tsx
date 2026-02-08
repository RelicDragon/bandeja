import { Bug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNavigationStore } from '@/store/navigationStore';
import { useChatUnreadCounts } from '@/hooks/useChatUnreadCounts';
import { usePlayersStore } from '@/store/playersStore';

export const ChatsTabController = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { chatsFilter, setChatsFilter } = useNavigationStore();
  const { counts } = useChatUnreadCounts();
  const unreadCounts = usePlayersStore((state) => state.unreadCounts);
  const userChatsCount = Object.values(unreadCounts).reduce((sum: number, count: number) => sum + count, 0);

  const handleFilter = (filter: 'users' | 'bugs' | 'channels') => {
    setChatsFilter(filter);
    const base = filter === 'bugs' ? '/bugs' : '/chats';
    const q = searchParams.get('q');
    const path = q ? `${base}?q=${encodeURIComponent(q)}` : base;
    navigate(path, { replace: true });
  };

  return (
    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
      <button
        onClick={() => handleFilter('users')}
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
        onClick={() => handleFilter('channels')}
        className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          chatsFilter === 'channels'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        {t('chats.channels', { defaultValue: 'Channels' })}
        {counts.channels > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
            {counts.channels > 99 ? '99+' : counts.channels}
          </span>
        )}
      </button>
      <button
        onClick={() => handleFilter('bugs')}
        className={`relative px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200 ${
          chatsFilter === 'bugs'
            ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
        }`}
        aria-label={t('chats.bugs', { defaultValue: 'Bugs' })}
      >
        <Bug size={18} />
        {counts.bugs > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 font-medium">
            {counts.bugs > 99 ? '99+' : counts.bugs}
          </span>
        )}
      </button>
    </div>
  );
};
