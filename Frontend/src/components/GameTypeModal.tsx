import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card } from './Card';
import { EntityType } from '@/types';

interface GameTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectType: (type: EntityType) => void;
}

export const GameTypeModal = ({ isOpen, onClose, onSelectType }: GameTypeModalProps) => {
  const { t } = useTranslation();
  
  if (!isOpen) return null;

  const entityTypes: EntityType[] = ['GAME', 'TOURNAMENT'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <Card className="w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <X size={24} />
        </button>
        
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          {t('createGame.selectType')}
        </h2>
        
        <div className="space-y-3">
          {entityTypes.map((type) => (
            <button
              key={type}
              onClick={() => onSelectType(type)}
              disabled={type === 'TOURNAMENT'}
              className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                type === 'TOURNAMENT'
                  ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                  : 'border-gray-200 dark:border-gray-700 hover:border-primary-600 dark:hover:border-primary-500'
              }`}
            >
              <div className={`font-semibold ${
                type === 'TOURNAMENT'
                  ? 'text-gray-400 dark:text-gray-500'
                  : 'text-gray-900 dark:text-white'
              }`}>
                {t(`games.entityTypes.${type}`)}
              </div>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
};

