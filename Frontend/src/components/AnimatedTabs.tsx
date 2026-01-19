import { motion, AnimatePresence } from 'framer-motion';
import { ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface AnimatedTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  variant?: 'pills' | 'underline' | 'buttons';
  className?: string;
  tabClassName?: string;
  activeTabClassName?: string;
  content?: ReactNode;
  children?: ReactNode;
}

export const AnimatedTabs = ({
  tabs,
  activeTab,
  onTabChange,
  variant = 'pills',
  className = '',
  tabClassName = '',
  activeTabClassName = '',
  content,
  children,
}: AnimatedTabsProps) => {
  const activeIndex = tabs.findIndex(tab => tab.id === activeTab);
  const tabWidth = 100 / tabs.length;

  const getVariantClasses = (isActive: boolean) => {
    if (variant === 'pills') {
      return isActive
        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white';
    }
    if (variant === 'underline') {
      return isActive
        ? 'border-primary-500 text-primary-600 dark:text-primary-400'
        : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300';
    }
    if (variant === 'buttons') {
      return isActive
        ? 'bg-primary-500 text-white'
        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700';
    }
    return '';
  };

  const getContainerClasses = () => {
    if (variant === 'pills') {
      return 'flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1';
    }
    if (variant === 'underline') {
      return 'flex border-b border-gray-200 dark:border-gray-700';
    }
    if (variant === 'buttons') {
      return 'flex justify-center space-x-1';
    }
    return 'flex';
  };

  const getButtonClasses = (isActive: boolean) => {
    const baseClasses = variant === 'pills'
      ? 'flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200'
      : variant === 'underline'
      ? 'px-4 py-3 text-sm font-medium border-b-2 transition-colors'
      : 'px-4 py-2 text-sm font-medium rounded-md transition-colors';
    
    return `${baseClasses} ${getVariantClasses(isActive)} ${tabClassName} ${isActive ? activeTabClassName : ''}`;
  };

  return (
    <div className={className}>
      <div className={getContainerClasses()} style={{ position: 'relative' }}>
        {variant === 'underline' && activeIndex >= 0 && (
          <motion.div
            className="absolute bottom-0 left-0 h-0.5 bg-primary-500 dark:bg-primary-400"
            initial={false}
            animate={{
              left: `${activeIndex * tabWidth}%`,
              width: `${tabWidth}%`,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 30,
            }}
          />
        )}
        {tabs.map((tab) => (
          <motion.button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={getButtonClasses(activeTab === tab.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
          >
            <div className="flex items-center gap-2">
              {tab.icon}
              <span>{tab.label}</span>
            </div>
          </motion.button>
        ))}
      </div>
      {(content || children) && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {content || children}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};
