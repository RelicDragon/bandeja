import type { EventKind, Game } from '@/types';

export function countEventGoingLooking(game: Pick<Game, 'participants'>): {
  going: number;
  looking: number;
} {
  const participants = game.participants ?? [];
  let going = 0;
  let looking = 0;
  for (const participant of participants) {
    if (participant.status === 'PLAYING') going += 1;
    if (participant.lookingForPartner) looking += 1;
  }
  return { going, looking };
}

export function eventKindI18nKey(kind: EventKind | null | undefined): string {
  if (kind === 'TOURNAMENT') return 'games.eventKinds.TOURNAMENT';
  if (kind === 'LEAGUE') return 'games.eventKinds.LEAGUE';
  if (kind === 'CAMP') return 'games.eventKinds.CAMP';
  return 'games.entityTypes.EVENT';
}

export function eventPosterImageUrl(game: Pick<Game, 'eventHeroes'>): string | null {
  const heroes = [...(game.eventHeroes ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  return heroes[0]?.thumbnailUrl || heroes[0]?.originalUrl || null;
}

export function eventVenueLabel(game: Pick<Game, 'club' | 'court' | 'venueText'>): string | null {
  return game.court?.club?.name || game.club?.name || game.venueText || null;
}

export function formatEventDateRange(
  startTime: string,
  endTime: string,
  timezone: string | null,
  locale: string,
): string {
  const tz = timezone ?? undefined;
  const start = new Date(startTime);
  const end = new Date(endTime);
  const dayOpts: Intl.DateTimeFormatOptions = {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  const startDay = new Intl.DateTimeFormat('en-CA', dayOpts).format(start);
  const endDay = new Intl.DateTimeFormat('en-CA', dayOpts).format(end);
  const shortOpts: Intl.DateTimeFormatOptions = { timeZone: tz, month: 'short', day: 'numeric' };
  const startLabel = new Intl.DateTimeFormat(locale, shortOpts).format(start);
  if (startDay === endDay) return startLabel;
  const endLabel = new Intl.DateTimeFormat(locale, shortOpts).format(end);
  return `${startLabel} – ${endLabel}`;
}
