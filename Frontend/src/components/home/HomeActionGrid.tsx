import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, Ticket } from 'lucide-react';
import type { Game, Sport, User } from '@/types';
import { AnimatedMount } from '@/components/motion/AnimatedMount';
import { navigationService } from '@/services/navigationService';
import { PlayIntentProvider } from '@/components/playIntent/PlayIntentFindBar';
import { PlayHeroButton } from './PlayHeroButton';
import { LeagueActionCTA } from './LeagueActionCTA';
import type { MyTabPanelCounts } from '@/hooks/useMyTabPanelCounts';

interface HomeActionGridProps {
  user: User | undefined;
  games: Game[];
  gamesUnreadCounts?: Record<string, number>;
  primarySport: Sport;
  /** Panel counts (leagues + bookings) from useMyTabPanelCounts. */
  panelCounts: MyTabPanelCounts;
  hideBookingsCta?: boolean;
}

/**
 * The My-tab action grid. Anchored by the Play hero, which is the primary tool
 * to create/find simple games and the onboarding entry point. Below it: a
 * secondary "Browse games" outline button, then earned surfaces (Leagues CTA
 * when on a league, Bookings when there are bookings).
 *
 * The {@link PlayIntentProvider} is mounted here so the deep-link handling
 * (`?playIntentOpen=1`, `?proposal=`, `?lobby=1`) is preserved for the My tab,
 * and so the hero can read provider state.
 */
export function HomeActionGrid({
  user,
  games,
  gamesUnreadCounts,
  primarySport,
  panelCounts,
  hideBookingsCta = false,
}: HomeActionGridProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cityId = user?.currentCity?.id;
  const hasLeagues = panelCounts.leagues > 0;
  const hasBookings = panelCounts.bookings > 0;

  return (
    <PlayIntentProvider
      cityId={cityId}
      sport={primarySport}
      acceptSharedDeepLinks
    >
      {/* HERO — always present; doubles as onboarding (city gate handled inside). */}
      <PlayHeroButton />

      {/* SECONDARY — join an existing game instead of broadcasting intent. */}
      <AnimatedMount className="mb-3">
        <button
          type="button"
          onClick={() => navigationService.navigateToFind()}
          data-testid="play-browse-games"
          className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-2.5 text-left shadow-sm transition-all hover:border-border hover:bg-muted/40 active:scale-[0.99] dark:bg-gray-900"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Search className="h-5 w-5" strokeWidth={2.5} aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">
              {t('home.browseGames')}
            </span>
            <span className="block truncate text-xs leading-snug text-muted-foreground">
              {t('home.browseGameHint')}
            </span>
          </span>
        </button>
      </AnimatedMount>

      {/* EARNED — Leagues CTA, only when the user is on a league. Animated. */}
      {hasLeagues && (
        <LeagueActionCTA
          games={games}
          gamesUnreadCounts={gamesUnreadCounts}
          leagueCount={panelCounts.leagues}
        />
      )}

      {/* EARNED — Bookings, only when there are bookings. */}
      {hasBookings && !hideBookingsCta && (
        <AnimatedMount className="mb-3">
          <button
            type="button"
            onClick={() => navigate('/profile/connected-clubs')}
            data-testid="play-bookings"
            className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-2.5 text-left shadow-sm transition-all hover:border-border hover:bg-muted/40 active:scale-[0.99] dark:bg-gray-900"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Ticket className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-tight text-foreground">
                {t('club.booktime.tabBookings')}
              </span>
              <span className="block truncate text-xs leading-snug text-muted-foreground">
                {t('club.booktime.connectedClubsCardHint', { defaultValue: '' })}
              </span>
            </span>
            <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold leading-none text-primary-foreground">
              {panelCounts.bookings}
            </span>
          </button>
        </AnimatedMount>
      )}
    </PlayIntentProvider>
  );
}
