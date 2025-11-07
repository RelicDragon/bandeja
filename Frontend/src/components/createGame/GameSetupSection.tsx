import { useTranslation } from 'react-i18next';
import { Sliders } from 'lucide-react';
import { Card } from '@/components';

interface GameSetupSectionProps {
  onOpenSetup: () => void;
  hasSetup: boolean;
}

export const GameSetupSection = ({ onOpenSetup, hasSetup }: GameSetupSectionProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('gameResults.setupGame')}
          </h2>
        </div>
        <button
          onClick={onOpenSetup}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
        >
          {hasSetup ? t('gameResults.edit') : t('gameResults.configure')}
        </button>
      </div>
    </Card>
  );
};

