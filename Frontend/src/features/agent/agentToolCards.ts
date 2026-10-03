import type {
  AgentEntityRef,
  AgentResultsCardMatch,
  AgentToolCard,
  AgentWeatherCard,
  AgentWeatherCardHour,
  AgentWeatherVerdict,
} from '@shared/agentContract';

/**
 * Pure helpers of the rich result cards (plan §16.6 slice 9e). The server builds the card
 * (`tool.finished.card`, `preview.card`); these only shape it for display.
 */

/** In-app path a card opens, or null (play intent and day weather have no single destination). */
export function agentToolCardPath(card: AgentToolCard): string | null {
  if (card.kind === 'results') return `/games/${card.gameId}`;
  if (card.kind === 'weather' && card.gameId) return `/games/${card.gameId}`;
  return null;
}

/** Entities still worth a card beside the rich card: the game a results card already shows is dropped. */
export function entitiesBesideCard(entities: AgentEntityRef[], card: AgentToolCard | undefined): AgentEntityRef[] {
  if (!card) return entities;
  const gameId = card.kind === 'results' ? card.gameId : card.kind === 'weather' ? card.gameId : null;
  if (!gameId) return entities;
  return entities.filter((e) => !(e.type === 'game' && e.id === gameId));
}

/** Per set: which side won it (for bolding), or null for a level / empty set. */
export function setWinners(match: AgentResultsCardMatch): Array<'teamA' | 'teamB' | null> {
  return match.sets.map((s) => (s.teamA > s.teamB ? 'teamA' : s.teamB > s.teamA ? 'teamB' : null));
}

/** Sets that were actually played (0-0 rows are placeholders). */
export function playedSets(match: AgentResultsCardMatch): AgentResultsCardMatch['sets'] {
  return match.sets.filter((s) => s.teamA > 0 || s.teamB > 0);
}

export type AgentCardTone = 'good' | 'warn' | 'bad' | 'info';

export function weatherVerdictTone(verdict: AgentWeatherVerdict): AgentCardTone {
  switch (verdict) {
    case 'good':
      return 'good';
    case 'risky':
      return 'warn';
    case 'bad':
      return 'bad';
    case 'indoor':
      return 'info';
  }
}

/** Hours in the day's best window (`end` is exclusive, `HH:mm` strings compare as text). */
export function isInBestWindow(card: Pick<AgentWeatherCard, 'bestWindow'>, hour: Pick<AgentWeatherCardHour, 'time'>): boolean {
  const w = card.bestWindow;
  return w != null && hour.time >= w.start && hour.time < w.end;
}

/** The hour that represents the card in its header: the game start, else midday, else the first. */
export function weatherHeadlineHour(card: AgentWeatherCard): AgentWeatherCardHour | null {
  if (card.hours.length === 0) return null;
  const at = card.window?.start ?? '13:00';
  const exact = card.hours.find((h) => h.time.slice(0, 2) === at.slice(0, 2));
  return exact ?? card.hours[Math.floor(card.hours.length / 2)] ?? card.hours[0];
}

/** Temperature in the viewer's unit: °F for Fahrenheit regions, else °C. */
export function formatCardTemperature(tempC: number, fahrenheit: boolean): string {
  return fahrenheit ? `${Math.round((tempC * 9) / 5 + 32)}°` : `${Math.round(tempC)}°`;
}

/** Local `HH:mm` (from the server) in the viewer's 12 / 24 h format. "24:00" stays as is in 24 h. */
export function formatCardClock(hhmm: string, locale: string, hour12: boolean): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return hhmm;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours === 24 && !hour12) return hhmm;
  const date = new Date(Date.UTC(2000, 0, 1, hours % 24, minutes));
  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', hour12, timeZone: 'UTC' }).format(date);
  } catch {
    return hhmm;
  }
}

/** `YYYY-MM-DD` as "Sat, 4 Oct" in the viewer's locale. */
export function formatCardDate(dateKey: string, locale: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return dateKey;
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${dateKey}T12:00:00Z`),
    );
  } catch {
    return dateKey;
  }
}
