import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GameCard } from '@/components';
import { GamesLoadingSkeleton } from '@/components/home/GameCardSkeleton';
import type { Game } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { runWithOverlapConfirm } from '@/utils/gameSlotOverlapConfirm';
import { recoverGenderUnsetJoin, runWithGenderForEvent } from '@/utils/genderJoinGate';
import { joinOutcomeTone } from '@/features/spot-opened/joinOutcomeTone';

interface WelcomeGamesListProps {
  title: string;
  emptyText: string;
  games: Game[] | undefined;
  loading: boolean;
  /** Show the card's Join button (open games); trainings open the details page. */
  joinable?: boolean;
  onJoined?: () => void;
  testId?: string;
}

/** A short list of upcoming games on the Welcome page, with Find's join flow. */
export function WelcomeGamesList({
  title,
  emptyText,
  games,
  loading,
  joinable = false,
  onJoined,
  testId,
}: WelcomeGamesListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const handleJoin = useCallback(async function joinWithGates(gameId: string, e: React.MouseEvent) {
    e.stopPropagation();
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void joinWithGates(gameId, e));
      return;
    }
    const joinGame = games?.find((g) => g.id === gameId);
    if (!runWithGenderForEvent(joinGame, () => void joinWithGates(gameId, e))) return;
    try {
      const { gamesApi } = await import('@/api');
      const response = await runWithOverlapConfirm((confirmOverlap) => gamesApi.join(gameId, confirmOverlap));
      if (!response) return;
      const message = (response as { message?: string }).message || 'Successfully joined the game';
      const text =
        message === 'games.addedToJoinQueue'
          ? t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' })
          : t(message, { defaultValue: message });
      if (joinOutcomeTone(message) === 'error') toast.error(text);
      else toast.success(text);
      onJoined?.();
      navigate(`/games/${gameId}`);
    } catch (error: any) {
      if (recoverGenderUnsetJoin(error, () => void joinWithGates(gameId, e))) return;
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    }
  }, [games, navigate, onJoined, t]);

  return (
    <section data-testid={testId}>
      <h3 className="mb-2 text-sm font-semibold text-foreground">{title}</h3>
      {loading ? (
        <GamesLoadingSkeleton />
      ) : games && games.length > 0 ? (
        <ul className="space-y-2">
          {games.map((game) => (
            <li key={game.id}>
              <GameCard
                game={game}
                user={user}
                showJoinButton={joinable}
                onJoin={joinable ? handleJoin : undefined}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      )}
    </section>
  );
}
