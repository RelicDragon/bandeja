import { useTranslation } from 'react-i18next';
import { CalendarDays, MapPin, Banknote } from 'lucide-react';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { resolveUserCurrency } from '@/utils/currency';
import { useAuthStore } from '@/store/authStore';
import {
  formatEventDateRange,
  formatEventPrice,
  eventVenueLabel,
} from '@/utils/eventDetails/eventListingFormat';
import { GameLocalizedAuthoredText } from '@/components/GameDetails/GameLocalizedAuthoredText';
import { GameTextTranslationControl } from '@/components/GameDetails/GameTextTranslationControl';
import { useGameDetailsLocalizedDisplay } from '@/hooks/useGameDetailsLocalizedDisplay';
import type { Game } from '@/types';

type EventMetaBlockProps = {
  game: Game;
};

export function EventMetaBlock({ game }: EventMetaBlockProps) {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const localized = useGameDetailsLocalizedDisplay(game);
  const settings = resolveDisplaySettings(user);
  const dateRange = formatEventDateRange(game, settings.locale || i18n.language, settings.hour12);
  const venue = eventVenueLabel(game);
  const price = formatEventPrice(game, t, resolveUserCurrency(user?.defaultCurrency));
  const description = localized.description?.trim() || game.description?.trim();

  return (
    <div className="space-y-4 px-4">
      <div className="space-y-2.5 rounded-2xl border border-gray-200/80 bg-white/80 p-4 dark:border-gray-800 dark:bg-gray-900/60">
        <div className="flex items-start gap-3 text-sm text-gray-800 dark:text-gray-200">
          <CalendarDays size={18} className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
          <span>{dateRange}</span>
        </div>
        {venue && (
          <div className="flex items-start gap-3 text-sm text-gray-800 dark:text-gray-200">
            <MapPin size={18} className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
            <span>{venue}</span>
          </div>
        )}
        {price && (
          <div className="flex items-start gap-3 text-sm text-gray-800 dark:text-gray-200">
            <Banknote size={18} className="mt-0.5 shrink-0 text-violet-600 dark:text-violet-400" />
            <span>{price}</span>
          </div>
        )}
      </div>
      {description && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('gameDetails.gameText.descriptionHeading', { defaultValue: 'Description' })}
            </span>
            <GameTextTranslationControl
              compact
              showOriginal={localized.showOriginal}
              hasToggle={localized.hasToggle}
              showPendingHint={localized.showPendingHint}
              onToggle={localized.toggleShowOriginal}
              a11yAnnouncement={localized.a11yAnnouncement}
            />
          </div>
          <GameLocalizedAuthoredText
            as="p"
            className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300"
            text={description}
            lang={localized.lang}
          />
        </div>
      )}
    </div>
  );
}
