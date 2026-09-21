import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { GameLocalizedAuthoredText } from '@/components/GameDetails/GameLocalizedAuthoredText';
import { GameTextTranslationControl } from '@/components/GameDetails/GameTextTranslationControl';
import { getSportConfig } from '@/sport/sportRegistry';
import { parseGameSport } from '@/utils/gameSport';
import { eventKindI18nKey, formatEventLevelBand } from '@/utils/eventDetails/eventListingFormat';
import { eventOwnerParticipant } from '@/utils/eventDetails/eventParticipantLists';
import { useGameDetailsLocalizedDisplay } from '@/hooks/useGameDetailsLocalizedDisplay';
import type { Game } from '@/types';

type EventPosterHeaderProps = {
  game: Game;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

export function EventPosterHeader({ game, canEdit, onEdit, onDelete }: EventPosterHeaderProps) {
  const { t } = useTranslation();
  const localized = useGameDetailsLocalizedDisplay(game);
  const sport = parseGameSport(game.sport);
  const levelBand = formatEventLevelBand(game);
  const owner = eventOwnerParticipant(game.participants);
  const ownerName = owner?.user
    ? [owner.user.firstName, owner.user.lastName].filter(Boolean).join(' ').trim()
    : '';
  const title =
    localized.name?.trim() ||
    game.name?.trim() ||
    t(eventKindI18nKey(game.eventKind));
  const hasDescription = Boolean(game.description?.trim() || localized.description?.trim());

  return (
    <div className="space-y-3 px-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-800 dark:bg-violet-950/60 dark:text-violet-200">
          {t(eventKindI18nKey(game.eventKind))}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200">
          <SportPublicIcon sport={sport} className="h-3.5 w-3.5 object-contain" />
          {t(getSportConfig(sport).labelKey)}
        </span>
        {levelBand && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            {t('games.level')}: {levelBand}
          </span>
        )}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <GameLocalizedAuthoredText
            as="h1"
            className="text-2xl font-semibold tracking-tight text-gray-950 dark:text-white"
            text={title}
            lang={localized.lang}
          />
          {!hasDescription && (
            <GameTextTranslationControl
              showOriginal={localized.showOriginal}
              hasToggle={localized.hasToggle}
              onToggle={localized.toggleShowOriginal}
              a11yAnnouncement={localized.a11yAnnouncement}
            />
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
              aria-label={t('eventDetails.editListing')}
            >
              <Pencil size={18} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              aria-label={t('eventDetails.deleteEvent')}
            >
              <Trash2 size={18} />
            </button>
          </div>
        )}
      </div>
      {owner?.user && (
        <div className="flex items-center gap-2">
          <PlayerAvatar player={owner.user} extrasmall showName={false} fullHideName levelSport={sport} />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {t('eventDetails.organizer')}
            </p>
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{ownerName || '—'}</p>
          </div>
        </div>
      )}
    </div>
  );
}
