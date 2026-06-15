import { Card } from '@/components';
import { CourtDisplayName } from '@/components/CourtDisplayName';
import { CourtLocationLinks } from '@/components/CourtLocationLinks';
import { getGamePlayedCourtsWithWebCamera } from '@/utils/getGamePlayedCourts';
import type { Court, Game } from '@/types';
import { Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GameWebCamerasSectionProps {
  game: Game;
  courts: Court[];
}

export const GameWebCamerasSection = ({ game, courts }: GameWebCamerasSectionProps) => {
  const { t } = useTranslation();

  if (game.resultsStatus !== 'FINAL') return null;

  const courtsWithWebCamera = getGamePlayedCourtsWithWebCamera(game, courts);
  if (courtsWithWebCamera.length === 0) return null;

  return (
    <Card className="mb-2">
      <div className="flex items-center gap-2 mb-3">
        <Video size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="section-title">{t('gameDetails.webCameras.title')}</h2>
      </div>
      <ul className="space-y-2">
        {courtsWithWebCamera.map((court) => (
          <li
            key={court.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 px-3 py-2"
          >
            <CourtDisplayName
              name={court.name}
              integrationName={court.integrationCourtName}
              primaryClassName="text-sm font-medium text-gray-900 dark:text-white"
              secondaryClassName="text-[10px] text-gray-500 dark:text-gray-400"
            />
            <CourtLocationLinks
              court={court}
              className="shrink-0"
              linkClassName="flex items-center gap-1.5 text-xs text-primary-600 dark:text-primary-400 hover:underline"
            />
          </li>
        ))}
      </ul>
    </Card>
  );
};
