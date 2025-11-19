import { Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components';

interface GameSetupToggleSectionProps {
  title: string;
  enabled: boolean;
  hasSetup: boolean;
  onToggle: (enabled: boolean) => void;
  onOpenSetup: () => void;
}

export const GameSetupToggleSection = ({
  title,
  enabled,
  hasSetup,
  onToggle,
  onOpenSetup,
}: GameSetupToggleSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Settings size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} />
      </div>
      {enabled && (
        <button
          onClick={onOpenSetup}
          className={`w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all ${
            hasSetup
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          {hasSetup ? t('createLeague.editGameSetup') : t('createLeague.configureGameSetup')}
        </button>
      )}
    </div>
  );
};

