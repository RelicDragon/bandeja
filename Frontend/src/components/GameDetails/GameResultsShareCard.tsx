import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import type { Game } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import {
  canShowGameResultsShareCard,
  resolveGameResultsSharePhotoUrl,
} from '@/utils/gameResultsShare.util';
import { hasCachedResultsSummary } from '@/utils/gameResultsArtifacts.util';
import { buildDuplicateGameInitialData } from '@/utils/buildDuplicateGameInitialData';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { useAuthStore } from '@/store/authStore';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { GameResultsShareCardVisual } from './GameResultsShareCardVisual';

const EMPTY_GAME_PHOTOS: import('@/api/gamePhotos').GamePhoto[] = [];

type GameResultsShareCardProps = {
  game: Game;
};

export function GameResultsShareCard({ game }: GameResultsShareCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const photos = useGamePhotosStore((s) => s.byGameId[game.id]?.photos) ?? EMPTY_GAME_PHOTOS;
  const photoUrl = resolveGameResultsSharePhotoUrl(game, photos);
  const showShareCard = canShowGameResultsShareCard(game, photos);
  const summary = hasCachedResultsSummary(game.resultsSummaryText)
    ? game.resultsSummaryText!.trim()
    : null;
  const sportLabel = t(getSportConfig(game.sport).labelKey);
  const canPlayAgain =
    game.entityType === 'GAME' &&
    getGameParticipationState(game.participants ?? [], userId, game).isPlaying;
  const title = game.name?.trim() || sportLabel;

  const handlePlayAgain = () => {
    const go = () => {
      navigate('/create-game', {
        state: {
          entityType: 'GAME',
          initialGameData: buildDuplicateGameInitialData(game),
        },
      });
    };
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(go);
      return;
    }
    go();
  };

  if (!showShareCard && !canPlayAgain) return null;

  return (
    <div className="mb-4 flex flex-col items-center gap-3 px-1">
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
      {canPlayAgain ? (
        <div className="grid w-full max-w-sm grid-cols-1 gap-2">
          <button
            type="button"
            onClick={handlePlayAgain}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-950/40 px-5 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-900/50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t('gameResults.playAgainCta')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
