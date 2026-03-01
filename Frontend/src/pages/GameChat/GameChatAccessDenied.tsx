import React from 'react';
import { useTranslation } from 'react-i18next';
import type { NavigateFunction } from 'react-router-dom';

export interface GameChatAccessDeniedProps {
  id: string | undefined;
  navigate: NavigateFunction;
}

export const GameChatAccessDenied: React.FC<GameChatAccessDeniedProps> = ({ id, navigate }) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">{t('chat.accessDenied')}</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{t('chat.accessDeniedMessage')}</p>
        <button
          onClick={() => navigate(`/games/${id}`)}
          className="w-full px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
        >
          {t('common.viewGame')}
        </button>
      </div>
    </div>
  );
};
