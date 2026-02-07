import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Search, X, BookUser, Plus } from 'lucide-react';

type ChatsFilter = 'users' | 'bugs' | 'channels';

interface ChatListSearchBarProps {
  chatsFilter: ChatsFilter;
  contactsMode: boolean;
  searchInput: string;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onContactsToggle: () => void;
  onAddBug: () => void;
  isDesktop?: boolean;
  hasCity?: boolean;
}

export const ChatListSearchBar = ({
  chatsFilter,
  contactsMode,
  searchInput,
  onSearchChange,
  onClearSearch,
  onContactsToggle,
  onAddBug,
  isDesktop = false,
  hasCity = false,
}: ChatListSearchBarProps) => {
  const { t } = useTranslation();

  const placeholder =
    chatsFilter === 'channels'
      ? t('chat.searchChannels', { defaultValue: 'Search in channels' })
      : chatsFilter === 'bugs'
        ? t('chat.searchBugs', { defaultValue: 'Search bugs' })
        : contactsMode
          ? t('chat.searchUsers', { defaultValue: 'Search users' })
          : t('chat.search', { defaultValue: 'Search' });

  const showActionButtons = chatsFilter === 'bugs' || chatsFilter === 'users';

  return (
    <div className={`px-4 pb-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 ${isDesktop ? 'pt-4' : ''}`}>
      <motion.div layout className="flex items-center">
        <motion.div
          layout
          animate={{
            width: showActionButtons ? 40 : 0,
            minWidth: showActionButtons ? 40 : 0,
            opacity: showActionButtons ? 1 : 0,
            marginRight: showActionButtons ? 8 : 0,
          }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="shrink-0 overflow-hidden"
          style={{ pointerEvents: showActionButtons ? 'auto' : 'none' }}
        >
          <div className="w-10 h-10 relative">
            <button
              type="button"
              onClick={onAddBug}
              className={`absolute inset-0 rounded-full flex items-center justify-center border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-400 ${
                chatsFilter === 'bugs' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
              }`}
              aria-label="Add bug"
            >
              <Plus size={20} className="text-gray-600 dark:text-gray-400" />
            </button>
            <button
              type="button"
              onClick={onContactsToggle}
              disabled={!hasCity}
              className={`absolute inset-0 rounded-full flex items-center justify-center border transition-all duration-400 ${
                chatsFilter === 'users' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
              } ${
                contactsMode
                  ? 'border-blue-500 bg-blue-500 text-white dark:border-blue-400 dark:bg-blue-500'
                  : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'
              } ${!hasCity ? 'opacity-50 cursor-not-allowed' : ''}`}
              aria-label="Contacts"
            >
              <BookUser size={20} className={contactsMode ? 'text-white' : 'text-gray-600 dark:text-gray-400'} />
            </button>
          </div>
        </motion.div>
        <motion.div layout className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" size={20} />
          <input
            type="text"
            placeholder={placeholder}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
          />
          {searchInput && (
            <button
              onClick={onClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Clear search"
            >
              <X size={16} className="text-gray-400 dark:text-gray-500" />
            </button>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
};
