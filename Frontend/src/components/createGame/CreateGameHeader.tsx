import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EntityType } from '@/types';

interface CreateGameHeaderProps {
  onBack: () => void;
  entityType: EntityType;
}

export const CreateGameHeader = ({ onBack, entityType }: CreateGameHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex-shrink-0 shadow-lg sticky top-0 z-40" style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(4rem + env(safe-area-inset-top))' }}>
      <div className="h-16 max-w-2xl mx-auto px-4 flex items-center gap-3" style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}>
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {entityType === 'BAR' ? t('createGame.createBar') : 
           entityType === 'TRAINING' ? t('createGame.createTraining') : 
           t('createGame.title')}
        </h1>
      </div>
    </div>
  );
};

