import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Loader2, RotateCcw, Share2 } from 'lucide-react';
import type { Game } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { gamePhotoOriginalUrl } from '@/utils/gamePhotoUrl';
import { useGamePhotosStore } from '@/store/gamePhotosStore';
import { shareGameResultsCard } from '@/utils/gameResultsShare.util';
import { hasCachedResultsSummary } from '@/utils/gameResultsArtifacts.util';
import { getGameMainPhotoId } from '@/utils/gameMainPhoto';
import { buildDuplicateGameInitialData } from '@/utils/buildDuplicateGameInitialData';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { useAuthStore } from '@/store/authStore';

const EMPTY_GAME_PHOTOS: import('@/api/gamePhotos').GamePhoto[] = [];

type GameResultsShareCardProps = {
  game: Game;
};

export function GameResultsShareCard({ game }: GameResultsShareCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const photos = useGamePhotosStore((s) => s.byGameId[game.id]?.photos) ?? EMPTY_GAME_PHOTOS;
  const mainPhoto =
    photos.find((p) => p.id === getGameMainPhotoId(game)) ?? photos[0];
  const photoUrl = mainPhoto ? gamePhotoOriginalUrl(mainPhoto) : null;
  const summary = hasCachedResultsSummary(game.resultsSummaryText)
    ? game.resultsSummaryText!.trim()
    : null;
  const sportLabel = t(getSportConfig(game.sport).labelKey);
  const canPlayAgain = game.entityType === 'GAME';

  const handleShare = async () => {
    if (!cardRef.current) return;
    setSharing(true);
    try {
      await shareGameResultsCard({
        cardElement: cardRef.current,
        summaryText: summary,
        gameTitle: game.name?.trim() || sportLabel,
      });
      toast.success(t('gameResults.shareCardDone'));
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      toast.error(t('gameResults.shareCardFailed'));
    } finally {
      setSharing(false);
    }
  };

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

  return (
    <div className="mb-4 flex flex-col items-center gap-3 px-1">
      <div
        ref={cardRef}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 p-4 text-white shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-[10px] font-semibold uppercase tracking-widest text-violet-300">
              {t('gameResults.shareCardBadge')}
            </p>
            <h3 className="mt-1 text-lg font-bold leading-tight">
              {game.name?.trim() || sportLabel}
            </h3>
          </div>
          <span className="shrink-0 rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-200">
            {sportLabel}
          </span>
        </div>
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="mt-3 aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-white/10"
            crossOrigin="anonymous"
          />
        ) : null}
        {summary ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-200 line-clamp-6">{summary}</p>
        ) : (
          <p className="mt-3 text-sm text-slate-400">{t('gameResults.shareCardNoSummary')}</p>
        )}
      </div>
      <div className="grid w-full max-w-sm grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void handleShare()}
          disabled={sharing}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700 disabled:opacity-60"
        >
          {sharing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Share2 className="h-4 w-4" aria-hidden />
          )}
          {t('gameResults.shareCardCta')}
        </button>
        {canPlayAgain ? (
          <button
            type="button"
            onClick={handlePlayAgain}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-500/40 bg-violet-950/40 px-5 py-2.5 text-sm font-semibold text-violet-100 transition hover:bg-violet-900/50"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            {t('gameResults.playAgainCta')}
          </button>
        ) : null}
      </div>
    </div>
  );
}
