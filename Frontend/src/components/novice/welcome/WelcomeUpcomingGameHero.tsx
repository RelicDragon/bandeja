import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { MapPin, MessageCircle, ArrowRight } from 'lucide-react';
import { GameCard } from '@/components';
import type { Game, User } from '@/types';
import { getClubMapsSearchUrl } from '@/utils/clubMapsUrl';
import { openExternalUrl } from '@/utils/openExternalUrl';

interface WelcomeUpcomingGameHeroProps {
  game: Game;
  user: User;
  /** True when the user has never had a counted game: "Your first game". */
  isFirst: boolean;
  unreadCount?: number;
}

/** Welcome page lead card when the novice already has a game: when, where, chat, directions. */
export function WelcomeUpcomingGameHero({ game, user, isFirst, unreadCount = 0 }: WelcomeUpcomingGameHeroProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const club = game.club ?? game.court?.club;
  const mapsUrl = club
    ? getClubMapsSearchUrl({ address: club.address, latitude: club.latitude, longitude: club.longitude })
    : null;

  const actionClass =
    'inline-flex min-h-[2.75rem] flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted active:scale-[0.98] dark:bg-gray-900';

  return (
    <section aria-labelledby="novice-welcome-game-title" data-testid="novice-welcome-game-hero">
      <h2
        id="novice-welcome-game-title"
        className="mb-2 text-sm font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
      >
        {isFirst ? t('novice.welcome.firstGameTitle') : t('novice.welcome.nextGameTitle')}
      </h2>
      <GameCard game={game} user={user} unreadCount={unreadCount} />
      <div className="mt-2 flex gap-2">
        <button type="button" className={actionClass} onClick={() => navigate(`/games/${game.id}/chat`)}>
          <MessageCircle size={16} aria-hidden />
          {t('novice.welcome.openChat')}
        </button>
        {mapsUrl ? (
          <button type="button" className={actionClass} onClick={() => void openExternalUrl(mapsUrl)}>
            <MapPin size={16} aria-hidden />
            {t('novice.welcome.directions')}
          </button>
        ) : null}
        <button
          type="button"
          className={`${actionClass} border-emerald-500/50 bg-emerald-500 text-white hover:bg-emerald-600 dark:bg-emerald-600`}
          onClick={() => navigate(`/games/${game.id}`)}
        >
          {t('novice.welcome.openGame')}
          <ArrowRight size={16} className="rtl:rotate-180" aria-hidden />
        </button>
      </div>
    </section>
  );
}
