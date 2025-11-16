import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { BugCard } from '@/components/bugs/BugCard';
import { Bug } from '@/types';

interface BugsSectionProps {
  bugs: Bug[];
  bugsUnreadCounts: Record<string, number>;
  onShowAllGames: () => void;
}

export const BugsSection = ({
  bugs,
  bugsUnreadCounts,
  onShowAllGames,
}: BugsSectionProps) => {
  const { t } = useTranslation();

  if (bugs.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200">
        {t('bug.bugTracker', { defaultValue: 'Bugs with Unread Messages' })}
      </h2>
      <div className="space-y-3">
        {bugs.map((bug, index) => (
          <div
            key={bug.id}
            className="animate-in slide-in-from-top-4 fade-in"
            style={{
              animationDelay: `${index * 100}ms`
            }}
          >
            <BugCard
              bug={bug}
              unreadCount={bugsUnreadCounts[bug.id] || 0}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

