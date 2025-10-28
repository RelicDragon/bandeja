import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { RangeSlider } from '@/components';

interface PlayerLevelSectionProps {
  playerLevelRange: [number, number];
  onPlayerLevelRangeChange: (range: [number, number]) => void;
}

export const PlayerLevelSection = ({
  playerLevelRange,
  onPlayerLevelRangeChange,
}: PlayerLevelSectionProps) => {
  const { t } = useTranslation();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {t('createGame.playerLevel')}
        </h2>
      </div>
      <RangeSlider
        min={1.0}
        max={7.0}
        value={playerLevelRange}
        onChange={onPlayerLevelRangeChange}
        step={0.1}
      />
    </div>
  );
};

