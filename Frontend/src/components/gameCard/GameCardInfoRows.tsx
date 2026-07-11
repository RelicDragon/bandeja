import { useTranslation } from 'react-i18next';
import { MapPin, Users, Plane, Check, CalendarOff } from 'lucide-react';
import type { Game, GameParticipant } from '@/types';
import { GameCardDateTile } from '@/components/gameCard/GameCardDateTile';

interface GameCardInfoRowsProps {
  game: Game;
  participants: GameParticipant[];
  /** "Today" / "Tomorrow" / "Yesterday" or null when the date is further away. */
  dayLabel: string | null;
  timeText?: string | null;
  hintText?: string | null;
  timezone: string | null;
  locale: string;
  /** Right-side photo thumbnail, rendered inside the block to align with the tile. */
  photoUrl?: string | null;
  className?: string;
}

export const GameCardInfoRows = ({
  game,
  participants,
  dayLabel,
  timeText,
  hintText,
  timezone,
  locale,
  photoUrl,
  className = '',
}: GameCardInfoRowsProps) => {
  const { t } = useTranslation();
  const playingCount = participants.filter((p) => p.status === 'PLAYING').length;
  const hasLevels = typeof game.minLevel === 'number' && typeof game.maxLevel === 'number';
  const fillRatio = game.maxParticipants
    ? Math.min(playingCount / game.maxParticipants, 1)
    : 0;
  const isFull = fillRatio >= 1;
  const timeNotSet = game.timeIsSet === false;
  const clubName = game.court?.club?.name || game.club?.name;

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {timeNotSet ? (
          <div
            className="flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-gray-100/80 text-gray-400 dark:bg-gray-800/80 dark:text-gray-500"
            aria-hidden
          >
            <CalendarOff size={18} />
          </div>
        ) : (
          <GameCardDateTile
            date={game.startTime}
            timezone={timezone}
            locale={locale}
            entityType={game.entityType}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          {timeNotSet ? (
            <span className="text-xs italic text-gray-500 dark:text-gray-400">
              {t('gameDetails.datetimeNotSet')}
            </span>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              {dayLabel && (
                <span className="rounded-md bg-primary-100/90 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                  {dayLabel}
                </span>
              )}
              {timeText && (
                <span className="whitespace-nowrap text-[15px] font-semibold tabular-nums text-gray-900 dark:text-white">
                  {timeText}
                </span>
              )}
            </div>
          )}
          {hintText && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Plane size={12} className="shrink-0" />
              {hintText}
            </span>
          )}
          {clubName && (
            <span className="flex min-w-0 items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
              <MapPin size={13} className="shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="truncate">
                {clubName}
                {game.court?.name && ` • ${game.court.name}`}
              </span>
            </span>
          )}
        </div>

        {photoUrl && (
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl shadow-sm ring-1 ring-gray-200 transition-shadow duration-300 group-hover:shadow-md dark:ring-gray-700">
            <img
              src={photoUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
              loading="lazy"
            />
          </div>
        )}
      </div>

      {/* Capacity / level strip */}
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1.5">
          <Users size={14} className="shrink-0 text-gray-400 dark:text-gray-500" />
          {game.entityType === 'BAR' ? (
            <span className="tabular-nums">{playingCount}</span>
          ) : (
            <>
              <span className="font-medium tabular-nums text-gray-800 dark:text-gray-200">
                {playingCount}
                <span className="font-normal text-gray-500 dark:text-gray-400">
                  {' / '}
                  {game.maxParticipants}
                </span>
              </span>
              {Boolean(game.maxParticipants) &&
                (isFull ? (
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_6px_rgba(16,185,129,0.45)]">
                    <Check size={11} strokeWidth={3} />
                  </span>
                ) : (
                  <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-gray-200/90 dark:bg-gray-700/90">
                    <span
                      className="block h-full rounded-full bg-gradient-to-r from-primary-400 to-primary-500 transition-[width] duration-500 ease-out"
                      style={{ width: `${fillRatio * 100}%` }}
                    />
                  </span>
                ))}
            </>
          )}
        </span>
        {game.entityType !== 'BAR' && hasLevels && (
          <span className="flex items-center gap-1 text-xs">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              {t('games.level')}:
            </span>
            <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-300">
              {(game.minLevel as number).toFixed(1)}-{(game.maxLevel as number).toFixed(1)}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};
