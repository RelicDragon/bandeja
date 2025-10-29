import { useTranslation } from 'react-i18next';

export const BugHeaderContent = () => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center">
      <h1 className="text-lg font-bold text-gray-900 dark:text-white">
        {t('bug.bugTracker')}
      </h1>
    </div>
  );
};
