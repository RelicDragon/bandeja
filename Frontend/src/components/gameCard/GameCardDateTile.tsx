import { useMemo } from 'react';
import type { EntityType } from '@/types';

const TILE_ACCENTS: Record<string, string> = {
  GAME: 'bg-primary-100/80 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
  TOURNAMENT: 'bg-red-100/80 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  LEAGUE: 'bg-blue-100/80 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  LEAGUE_SEASON: 'bg-blue-100/80 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  TRAINING: 'bg-green-100/80 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  BAR: 'bg-amber-100/80 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

interface GameCardDateTileProps {
  date: Date | string;
  timezone: string | null;
  locale: string;
  entityType: EntityType;
}

/** Calendar-style tile (weekday / day / month) that anchors the card's "when". */
export function GameCardDateTile({ date, timezone, locale, entityType }: GameCardDateTileProps) {
  const parts = useMemo(() => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const tz = timezone ?? undefined;
    return {
      weekday: new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: 'short' }).format(d),
      day: new Intl.DateTimeFormat(locale, { timeZone: tz, day: 'numeric' }).format(d),
      month: new Intl.DateTimeFormat(locale, { timeZone: tz, month: 'short' }).format(d),
    };
  }, [date, timezone, locale]);

  const accent = TILE_ACCENTS[entityType] ?? TILE_ACCENTS.GAME;

  return (
    <div
      className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl ${accent}`}
      aria-hidden
    >
      <span className="text-[9px] font-semibold uppercase leading-none tracking-wide opacity-80">
        {parts.weekday}
      </span>
      <span className="my-0.5 text-lg font-bold leading-none tabular-nums">{parts.day}</span>
      <span className="text-[9px] font-medium uppercase leading-none opacity-70">{parts.month}</span>
    </div>
  );
}
