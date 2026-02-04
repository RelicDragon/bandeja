import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Game, GameType } from '@/types';
import { Select } from '@/components';
import { gamesApi } from '@/api';
import { applyGameTypeTemplate } from '@/utils/gameTypeTemplates';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';

interface EditGameTextModalProps {
  isOpen: boolean;
  onClose: () => void;
  game: Game;
  onGameUpdate?: (game: Game) => void;
}

export const EditGameTextModal = ({ isOpen, onClose, game, onGameUpdate }: EditGameTextModalProps) => {
  const { t } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [gameType, setGameType] = useState<GameType>('CLASSIC');

  useEffect(() => {
    if (isOpen) {
      setName(game.name || '');
      setDescription(game.description || '');
      setGameType(game.gameType || 'CLASSIC');
    }
  }, [isOpen, game.name, game.description, game.gameType]);

  const handleClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!game.id) return;

    setIsSaving(true);
    try {
      const updateData: Partial<Game> = {
        name: name.trim() || null,
        description: description.trim() || null,
      };

      if (game.entityType !== 'TRAINING') {
        updateData.gameType = gameType;
        const gameTypeChanged = gameType !== game.gameType;
        if (gameTypeChanged) {
          const template = applyGameTypeTemplate(gameType);
          updateData.winnerOfMatch = template.winnerOfMatch;
          updateData.matchGenerationType = template.matchGenerationType;
          updateData.pointsPerWin = template.pointsPerWin ?? 0;
          updateData.pointsPerLoose = template.pointsPerLoose ?? 0;
          updateData.pointsPerTie = template.pointsPerTie ?? 0;
          updateData.ballsInGames = template.ballsInGames ?? false;
          updateData.fixedNumberOfSets = template.fixedNumberOfSets ?? 0;
        }
      }

      await gamesApi.update(game.id, updateData);
      
      const response = await gamesApi.getById(game.id);
      if (onGameUpdate) {
        onGameUpdate(response.data);
      }
      
      toast.success(t('gameDetails.settingsUpdated'));
      handleClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsSaving(false);
    }
  };

  const isLeagueSeason = game?.entityType === 'LEAGUE_SEASON';
  const nameLabel = t(isLeagueSeason ? 'createGame.gameNameLeague' : 'createGame.gameName');
  const namePlaceholder = t(isLeagueSeason ? 'createGame.gameNamePlaceholderLeague' : 'createGame.gameNamePlaceholder');
  const commentsLabel = t(isLeagueSeason ? 'createGame.commentsLeague' : 'createGame.comments');
  const commentsPlaceholder = t(isLeagueSeason ? 'createGame.commentsPlaceholderLeague' : 'createGame.commentsPlaceholder');
  const gameTypeLabel = t(isLeagueSeason ? 'createGame.gameTypeLeague' : 'createGame.gameType');

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="edit-game-text-modal">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.edit')}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {game.entityType !== 'TRAINING' && (
            <div className="px-3 py-1 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
                  {gameTypeLabel}
                </span>
                <div className="flex-shrink-0 w-40">
                  <Select
                    options={
                      game?.entityType === 'GAME'
                        ? [
                            { value: 'CLASSIC', label: t('games.gameTypes.CLASSIC') },
                            { value: 'AMERICANO', label: t('games.gameTypes.AMERICANO') },
                            { value: 'MEXICANO', label: t('games.gameTypes.MEXICANO') },
                            { value: 'CUSTOM', label: t('games.gameTypes.CUSTOM') },
                          ]
                        : [
                            { value: 'CLASSIC', label: t('games.gameTypes.CLASSIC') },
                            { value: 'AMERICANO', label: t('games.gameTypes.AMERICANO') },
                            { value: 'MEXICANO', label: t('games.gameTypes.MEXICANO') },
                            { value: 'ROUND_ROBIN', label: t('games.gameTypes.ROUND_ROBIN') },
                            { value: 'WINNER_COURT', label: t('games.gameTypes.WINNER_COURT') },
                            { value: 'CUSTOM', label: t('games.gameTypes.CUSTOM') },
                          ]
                    }
                    value={gameType}
                    onChange={(value) => setGameType(value as GameType)}
                    disabled={false}
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {nameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              {commentsLabel}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={commentsPlaceholder}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
