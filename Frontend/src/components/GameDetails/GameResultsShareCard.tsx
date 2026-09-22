import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import {
  canShowGameResultsShareCard,
  resolveGameResultsSharePhotoUrl,
} from '@/utils/gameResultsShare.util';
import { hasCachedResultsSummary } from '@/utils/gameResultsArtifacts.util';
import { useAuthStore } from '@/store/authStore';
import { GameResultsShareCardVisual } from './GameResultsShareCardVisual';
import { PlayWithGroupAgainButton } from './PlayWithGroupAgainButton';
import { canPlayWithGroupAgain } from './playWithGroupAgain';

const EMPTY_GAME_PHOTOS: import('@/api/gamePhotos').GamePhoto[] = [];

type GameResultsShareCardProps = {
  game: Game;
};

/**
 * Results area after FINAL: the primary action is **Play with this group
 * again** (PRD 362); the share visual is secondary and only appears once a
 * results photo exists.
 */
export function GameResultsShareCard({ game }: GameResultsShareCardProps) {
  const { t } = useTranslation();
  const userId = useAuthStore((s) => s.user?.id);
  const photos = useGamePhotosStore((s) => s.byGameId[game.id]?.photos) ?? EMPTY_GAME_PHOTOS;
  const photoUrl = resolveGameResultsSharePhotoUrl(game, photos);
  const showShareCard = canShowGameResultsShareCard(game, photos);
  const summary = hasCachedResultsSummary(game.resultsSummaryText)
    ? game.resultsSummaryText!.trim()
    : null;
  const sportLabel = t(getSportConfig(game.sport).labelKey);
  const canRematch = canPlayWithGroupAgain(game, userId);
  const title = game.name?.trim() || sportLabel;

  if (!showShareCard && !canRematch) return null;

  return (
    <div className="mb-4 flex flex-col items-center gap-3 px-1">
      {canRematch ? <PlayWithGroupAgainButton game={game} /> : null}
      {showShareCard ? (
        <GameResultsShareCardVisual
          badgeLabel={t('gameResults.shareCardBadge')}
          title={title}
          sportLabel={sportLabel}
          photoUrl={photoUrl}
          summary={summary}
          noSummaryLabel={t('gameResults.shareCardNoSummary')}
        />
      ) : null}
    </div>
  );
}
