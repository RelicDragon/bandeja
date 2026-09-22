import { useTranslation } from 'react-i18next';
import { Users, Ban, Award, Lock, Repeat, Sprout } from 'lucide-react';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { cadencePillKey } from '@/features/game-series/seriesFormat';
import type { Game } from '@/types';
import type { GameCardMyParticipationBadge } from '@/utils/gameCardMyParticipationBadge';
import { genderTeamsSummaryLabelKey } from '@/utils/genderTeamsSummaryLabel';
import { gameIsNonRating } from '@/utils/gameRatingSemantics';
import { eventKindI18nKey } from '@/utils/eventListingDisplay';
import { ordinalLabel } from '@/utils/formatOrdinal';
import { WeatherRiskPill } from './WeatherRiskPill';
import { SpotOpenedPill } from '@/features/spot-opened/SpotOpenedPill';
import { resolveSpotOpenedAt } from '@/features/spot-opened/spotOpenedWindow';

interface GameCardHeaderTagsProps {
  game: Game;
  sportTags: React.ReactNode;
  myParticipationBadge: GameCardMyParticipationBadge | null;
  /**
   * PRD 357 — the viewer's 12 h/24 h preference for the weather pill's hour.
   * Threaded from `GameCard`'s `displaySettings` so the pill and the risk banner
   * agree; `undefined` falls back to the locale's own convention.
   */
  hour12?: boolean;
  /**
   * PRD 359 — the viewer's 1-based place in the join queue. `null` (the
   * default) keeps the badge at plain "In queue", which is what an
   * unorderable roster must fall back to.
   */
  queuePosition?: number | null;
}

const PILL = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium';

const PARTICIPATION_PILL_CLASSES: Record<GameCardMyParticipationBadge, string> = {
  owner: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  admin: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  guest: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  invited: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  in_queue: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  playing: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  non_playing: 'bg-gray-100 text-gray-800 dark:bg-gray-800/40 dark:text-gray-300',
};

function participationLabelKey(badge: GameCardMyParticipationBadge): string {
  switch (badge) {
    case 'owner':
      return 'games.owner';
    case 'admin':
      return 'games.admin';
    case 'guest':
      return 'games.statusGuest';
    case 'invited':
      return 'games.statusInvited';
    case 'in_queue':
      return 'games.statusInQueue';
    case 'playing':
      return 'games.badgePlaying';
    case 'non_playing':
      return 'games.statusNonPlaying';
  }
}

export const GameCardHeaderTags = ({
  game,
  sportTags,
  myParticipationBadge,
  hour12,
  queuePosition = null,
}: GameCardHeaderTagsProps) => {
  const { t, i18n } = useTranslation();
  const spotOpenedAt = resolveSpotOpenedAt(game);
  // PRD 359 — "In queue · 2nd". Same pill, same size, one more fact.
  const queuePositionLabel =
    myParticipationBadge === 'in_queue' && queuePosition != null
      ? ordinalLabel(queuePosition, i18n.language, (position) =>
          t('games.queuePositionOrdinal', { position }),
        )
      : null;

  return (
    <>
      {sportTags}
      {game.entityType === 'EVENT' && (
        <span
          className={`${PILL} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300`}
        >
          {t(eventKindI18nKey(game.eventKind), { defaultValue: 'Event' })}
        </span>
      )}
      {/* PRD 345 — recurring series. Neutral tone on purpose: the date tile
          stays the thing the eye lands on, this only says "there is a next
          one". Hidden entirely when the feature flag is off. */}
      {game.seriesLabel && isGameSeriesEnabled() && (
        <span
          className={`${PILL} bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300`}
          title={game.seriesLabel.name}
        >
          <Repeat size={12} aria-hidden />
          <span>{t(cadencePillKey(game.seriesLabel.cadence))}</span>
          <span className="sr-only">{t('series.pillAriaLabel')}</span>
        </span>
      )}
      {myParticipationBadge && (
        <span
          className={`${PILL} whitespace-nowrap ${PARTICIPATION_PILL_CLASSES[myParticipationBadge]}`}
        >
          {myParticipationBadge === 'playing'
            ? t('games.badgePlaying', { defaultValue: 'Playing' })
            : queuePositionLabel
              ? t('games.statusInQueueWithPosition', { position: queuePositionLabel })
              : t(participationLabelKey(myParticipationBadge))}
        </span>
      )}
      {/* PRD 347 — a seat freed in the last 2 h. Never shown once results are
          locked; `resolveSpotOpenedAt` enforces that. */}
      {spotOpenedAt && <SpotOpenedPill openedAt={spotOpenedAt} />}
      {!game.isPublic && (
        <span
          className={`${PILL} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`}
        >
          <Lock size={12} />
          <span className="hidden sm:inline">{t('games.private')}</span>
        </span>
      )}
      {game.genderTeams && game.genderTeams !== 'ANY' && (
        <span
          className="flex shrink-0 items-center"
          title={t(genderTeamsSummaryLabelKey(game.genderTeams) ?? 'createGame.genderTeams.label')}
        >
          {game.genderTeams === 'MIX_PAIRS' ? (
            <span className="flex h-5 items-center justify-center gap-1 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 px-2 dark:from-blue-600 dark:to-pink-600">
              <i className="bi bi-gender-male text-[10px] text-white"></i>
              <i className="bi bi-gender-female -ms-1 text-[10px] text-white"></i>
            </span>
          ) : (
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                game.genderTeams === 'MEN'
                  ? 'bg-blue-500 dark:bg-blue-600'
                  : 'bg-pink-500 dark:bg-pink-600'
              }`}
            >
              <i
                className={`bi ${game.genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-xs text-white`}
              ></i>
            </span>
          )}
        </span>
      )}
      {/* PRD 360 — the organizer's "Novices welcome" promise. Text collapses to
          the icon on a narrow card; the label stays available to screen readers
          and as a tooltip at every width. Never a second tag row. */}
      {game.suitableForNovices && (
        <span
          className={`${PILL} bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300`}
          title={t('games.noviceFriendly')}
        >
          <Sprout size={12} aria-hidden />
          <span className="hidden sm:inline" aria-hidden>
            {t('games.noviceFriendly')}
          </span>
          <span className="sr-only">{t('games.noviceFriendly')}</span>
        </span>
      )}
      {gameIsNonRating(game) && game.entityType !== 'EVENT' && (
        <span
          className={`${PILL} bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400`}
        >
          <Ban size={12} />
          {t('games.noRating')}
        </span>
      )}
      {game.hasFixedTeams && (
        <span
          className={`${PILL} bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}
        >
          <span className="flex items-center">
            <Users size={12} />
            <Users size={12} className="-ms-1" />
          </span>
          <span className="hidden sm:inline">{t('games.fixedTeams')}</span>
        </span>
      )}
      {/* PRD 357 — rain / wind risk. Renders nothing unless the backend decided
          the game is outdoor, inside 48 h and over the threshold. */}
      <WeatherRiskPill
        weatherRisk={game.weatherRisk}
        locale={i18n.language}
        timeZone={game.city?.timezone}
        hour12={hour12}
      />
      {(game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') &&
        game.resultsStatus === 'FINAL' && (
          <span
            className={`${PILL} bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400`}
          >
            <Award size={12} />
            {t('games.resultsAvailable')}
          </span>
        )}
    </>
  );
};
