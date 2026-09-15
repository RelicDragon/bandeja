import type { EventKind, Game, PriceCurrency, PriceType } from '@/types';
import { getCurrencySymbol } from '@/utils/currency';

export function eventKindI18nKey(kind: EventKind | null | undefined): string {
  if (kind === 'CAMP') return 'createEvent.kinds.CAMP';
  if (kind === 'LEAGUE') return 'createEvent.kinds.LEAGUE';
  if (kind === 'TOURNAMENT') return 'createEvent.kinds.TOURNAMENT';
  return 'games.entityTypes.EVENT';
}

export function formatEventLevelBand(game: Pick<Game, 'minLevel' | 'maxLevel'>): string | null {
  if (typeof game.minLevel !== 'number' || typeof game.maxLevel !== 'number') return null;
  return `${game.minLevel.toFixed(1)}–${game.maxLevel.toFixed(1)}`;
}

export function formatEventDateRange(
  game: Pick<Game, 'startTime' | 'endTime' | 'city'>,
  locale: string,
  hour12: boolean,
): string {
  const tz = game.city?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = new Date(game.startTime);
  const end = new Date(game.endTime);
  const dayFmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  });
  const startDay = dayFmt.format(start);
  const endDay = dayFmt.format(end);
  if (startDay === endDay) {
    return `${startDay}, ${timeFmt.format(start)} – ${timeFmt.format(end)}`;
  }
  return `${startDay} ${timeFmt.format(start)} – ${endDay} ${timeFmt.format(end)}`;
}

export function formatEventPrice(
  game: Pick<Game, 'priceTotal' | 'priceCurrency' | 'priceType'>,
  t: (key: string) => string,
  fallbackCurrency?: PriceCurrency | null,
): string | null {
  if (game.priceType === 'FREE') return t('createGame.priceTypeFree');
  if (game.priceType === 'NOT_KNOWN' || game.priceType == null) return null;
  if (game.priceTotal == null || game.priceTotal <= 0) return null;
  const currency = game.priceCurrency || fallbackCurrency;
  const amount = currency
    ? `${game.priceTotal} ${getCurrencySymbol(currency)}`
    : String(game.priceTotal);
  const typeKey = eventPriceTypeI18nKey(game.priceType);
  return typeKey ? `${amount} · ${t(typeKey)}` : amount;
}

export function eventPriceTypeI18nKey(priceType: PriceType | null | undefined): string | null {
  if (priceType === 'PER_PERSON') return 'createGame.priceTypePerPerson';
  if (priceType === 'PER_TEAM') return 'createGame.priceTypePerTeam';
  if (priceType === 'TOTAL') return 'createGame.priceTypeTotal';
  return null;
}

export function eventVenueLabel(game: Pick<Game, 'clubId' | 'club' | 'venueText'>): string | null {
  if (game.clubId && game.club?.name) return game.club.name;
  const text = game.venueText?.trim();
  return text || null;
}
