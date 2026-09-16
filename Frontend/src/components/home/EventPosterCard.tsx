import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarDays, MapPin } from 'lucide-react';
import type { Game } from '@/types';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getClubTimezone, getUserTimezone } from '@/utils/gameTimeDisplay';
import { useAuthStore } from '@/store/authStore';
import {
  countEventGoingLooking,
  eventKindI18nKey,
  eventPosterImageUrl,
  eventVenueLabel,
  formatEventDateRange,
} from '@/utils/eventListingDisplay';
import { formatEventLevelBand, formatEventPrice } from '@/utils/eventDetails/eventListingFormat';
import { getSportConfig } from '@/sport/sportRegistry';
import { parseGameSport } from '@/utils/gameSport';
import { resolveUserCurrency } from '@/utils/currency';
import { useGameLocalizedText } from '@/hooks/useGameLocalizedText';

type EventPosterCardProps = {
  game: Game;
  variant?: 'strip' | 'list';
  onClick?: () => void;
};

export function EventPosterCard({ game, variant = 'strip', onClick }: EventPosterCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { name: localizedName } = useGameLocalizedText(game);
  const displaySettings = resolveDisplaySettings(user);
  const imageUrl = eventPosterImageUrl(game);
  const venue = eventVenueLabel(game);
  const { going, looking } = countEventGoingLooking(game);
  const timezone = getClubTimezone(game) ?? getUserTimezone();
  const dateRange = formatEventDateRange(
    game.startTime,
    game.endTime,
    timezone,
    displaySettings.locale || i18n.language,
  );
  const title =
    localizedName?.trim() || t('games.entityTypes.EVENT', { defaultValue: 'Event/Ad' });
  const isList = variant === 'list';
  const sportLabel = t(getSportConfig(parseGameSport(game.sport)).labelKey);
  const levelBand = formatEventLevelBand(game);
  const price = formatEventPrice(game, t, resolveUserCurrency(user?.defaultCurrency));

  return (
    <button
      type="button"
      onClick={() => {
        if (onClick) {
          onClick();
          return;
        }
        navigate(`/games/${game.id}`);
      }}
      className={
        isList
          ? 'w-full overflow-hidden rounded-2xl border border-gray-200 bg-white text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900'
          : 'w-44 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-white text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900'
      }
    >
      <div
        className={
          isList
            ? 'relative aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-800'
            : 'relative aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-800'
        }
      >
        {imageUrl ? (
          <img src={imageUrl} alt={title} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-gray-400 dark:text-gray-500">
            <CalendarDays size={isList ? 40 : 28} />
          </span>
        )}
        <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
          {t(eventKindI18nKey(game.eventKind), { defaultValue: 'Event' })}
        </span>
        {game.eventApprovalStatus === 'ON_APPROVE' ? (
          <span className="absolute end-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-medium text-white">
            {t('eventDetails.pendingBadge')}
          </span>
        ) : null}
      </div>
      <div className={isList ? 'space-y-1.5 p-3.5' : 'space-y-1 p-2.5'}>
        <p
          className={
            isList
              ? 'line-clamp-2 text-[15px] font-semibold leading-snug text-gray-900 dark:text-white'
              : 'line-clamp-2 text-[13px] font-semibold leading-snug text-gray-900 dark:text-white'
          }
        >
          {title}
        </p>
        <p className="text-[11px] font-medium tabular-nums text-gray-700 dark:text-gray-300">{dateRange}</p>
        <p className="truncate text-[11px] text-gray-600 dark:text-gray-400">
          {[sportLabel, levelBand, price].filter(Boolean).join(' · ')}
        </p>
        {venue ? (
          <p className="flex min-w-0 items-center gap-1 text-[11px] text-gray-600 dark:text-gray-400">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{venue}</span>
          </p>
        ) : null}
        <p className="text-[11px] text-gray-500 dark:text-gray-400">
          {t('games.goingNeedPartner', {
            going,
            looking,
            defaultValue: '{{going}} going · {{looking}} need partner',
          })}
        </p>
      </div>
    </button>
  );
}
