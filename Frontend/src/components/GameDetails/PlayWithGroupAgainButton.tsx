import { useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import type { Game } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { buildRematchNavigationState, canPlayWithGroupAgain } from './playWithGroupAgain';

type PlayWithGroupAgainButtonProps = {
  game: Game;
  className?: string;
};

/**
 * PRD 362 — the primary action of the results area once results are FINAL.
 *
 * Opens the existing create flow with the format copied, the schedule and
 * court cleared, and the previous PLAYING roster preselected as *invitees*
 * (never seated). It replaces the old "Play again" (which copied the stale
 * slot and invited nobody) and, for FINAL games, the Duplicate card on the
 * shell. Nothing is sent by tapping this; invites go out when the organizer
 * confirms creation.
 */
export function PlayWithGroupAgainButton({ game, className = '' }: PlayWithGroupAgainButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const captionId = useId();

  if (!canPlayWithGroupAgain(game, userId)) return null;

  const handleClick = () => {
    const go = () => {
      if (!userId) return;
      const title = game.name?.trim() || t(getSportConfig(game.sport).labelKey);
      navigate('/create-game', { state: buildRematchNavigationState(game, userId, title) });
    };
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(go);
      return;
    }
    go();
  };

  return (
    <div className={`grid w-full max-w-sm grid-cols-1 gap-1.5 ${className}`.trim()}>
      <button
        type="button"
        onClick={handleClick}
        aria-describedby={captionId}
        data-testid="play-with-group-again"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700 hover:shadow-md hover:shadow-primary-600/30 active:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
      >
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        <span className="text-balance">{t('gameResults.playWithGroupAgainCta')}</span>
      </button>
      <p id={captionId} className="px-1 text-center text-xs text-gray-500 dark:text-gray-400">
        {t('gameResults.playWithGroupAgainCaption')}
      </p>
    </div>
  );
}
