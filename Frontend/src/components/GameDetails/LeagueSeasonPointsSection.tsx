import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Trophy } from 'lucide-react';
import { Card } from '@/components';
import { gamesApi } from '@/api';
import { Game } from '@/types';

interface LeagueSeasonPointsSectionProps {
  game: Game;
  canEdit: boolean;
  onGameUpdate: (game: Game) => void;
}

interface StepperProps {
  label: string;
  value: number;
  max?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}

const pill = (active: boolean, disabled: boolean) =>
  `px-3 py-1.5 text-xs rounded-md font-semibold transition-all duration-200 ${
    disabled
      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
      : active
        ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-md'
        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
  }`;

const Stepper = ({ label, value, max = 5, disabled = false, onChange }: StepperProps) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
    <div className="flex gap-1">
      {Array.from({ length: max + 1 }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onChange(i)}
          className={pill(value === i, disabled)}
        >
          {i}
        </button>
      ))}
    </div>
  </div>
);

export const LeagueSeasonPointsSection = ({
  game,
  canEdit,
  onGameUpdate,
}: LeagueSeasonPointsSectionProps) => {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);

  const pointsPerWin = game.pointsPerWin ?? 0;
  const pointsPerTie = game.pointsPerTie ?? 0;
  const pointsPerLoose = game.pointsPerLoose ?? 0;

  const handleChange = async (patch: Partial<Pick<Game, 'pointsPerWin' | 'pointsPerTie' | 'pointsPerLoose'>>) => {
    if (!canEdit || saving) return;
    try {
      setSaving(true);
      await gamesApi.update(game.id, patch);
      const response = await gamesApi.getById(game.id);
      onGameUpdate(response.data);
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="section-title">{t('gameFormat.points.title')}</h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('gameFormat.standingPointsHint')}</p>
        <div className="space-y-2">
          <Stepper
            label={t('gameResults.win')}
            value={pointsPerWin}
            disabled={!canEdit || saving}
            onChange={(value) => void handleChange({ pointsPerWin: value })}
          />
          <Stepper
            label={t('gameResults.tie')}
            value={pointsPerTie}
            disabled={!canEdit || saving}
            onChange={(value) => void handleChange({ pointsPerTie: value })}
          />
          <Stepper
            label={t('gameResults.loose')}
            value={pointsPerLoose}
            disabled={!canEdit || saving}
            onChange={(value) => void handleChange({ pointsPerLoose: value })}
          />
        </div>
      </div>
    </Card>
  );
};
