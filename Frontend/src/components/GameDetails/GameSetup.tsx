import { useTranslation } from 'react-i18next';
import { Sliders } from 'lucide-react';
import { Card } from '@/components';

interface GameSetupProps {
  onOpenSetup: () => void;
  canEdit: boolean;
}

export const GameSetup = ({ onOpenSetup, canEdit }: GameSetupProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="section-title">
            {t('gameResults.setupGame')}
          </h2>
        </div>
        <button
          onClick={onOpenSetup}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium"
        >
          {canEdit ? t('gameResults.configure') : t('gameResults.view')}
        </button>
      </div>
    </Card>
  );
};

