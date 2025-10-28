import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components';
import { X, Trash2 } from 'lucide-react';

interface SetResult {
  teamA: number;
  teamB: number;
}

interface SetResultModalProps {
  matchId: string;
  setIndex: number;
  set: SetResult;
  onSave: (matchId: string, setIndex: number, teamAScore: number, teamBScore: number) => void;
  onRemove?: (matchId: string, setIndex: number) => void;
  onClose: () => void;
  canRemove?: boolean;
}

export const SetResultModal = ({ matchId, setIndex, set, onSave, onRemove, onClose, canRemove = false }: SetResultModalProps) => {
  const { t } = useTranslation();
  const [teamAScore, setTeamAScore] = useState(set.teamA);
  const [teamBScore, setTeamBScore] = useState(set.teamB);

  const handleSave = () => {
    onSave(matchId, setIndex, teamAScore, teamBScore);
    onClose();
  };

  const handleRemove = () => {
    if (onRemove) {
      onRemove(matchId, setIndex);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 mx-4 max-w-md w-full border border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('gameResults.setResult')}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Team A</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTeamAScore(Math.max(0, teamAScore - 1))}
                className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                -
              </button>
              <span className="w-12 text-center text-lg font-semibold text-gray-900 dark:text-white">
                {teamAScore}
              </span>
              <button
                onClick={() => setTeamAScore(Math.min(48, teamAScore + 1))}
                className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                +
              </button>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Team B</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTeamBScore(Math.max(0, teamBScore - 1))}
                className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                -
              </button>
              <span className="w-12 text-center text-lg font-semibold text-gray-900 dark:text-white">
                {teamBScore}
              </span>
              <button
                onClick={() => setTeamBScore(Math.min(48, teamBScore + 1))}
                className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                +
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3 mt-8">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            {t('common.cancel')}
          </Button>
          {canRemove && onRemove && (
            <Button
              onClick={handleRemove}
              variant="outline"
              className="px-3 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-600 dark:hover:bg-red-900/20"
            >
              <Trash2 size={16} />
            </Button>
          )}
          <Button
            onClick={handleSave}
            className="flex-1"
          >
            {t('common.save')}
          </Button>
        </div>
      </div>
    </div>
  );
};
