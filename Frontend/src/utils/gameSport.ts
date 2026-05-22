import { parseSport, DEFAULT_SPORT, type Sport } from '@shared/sport';

/** Parse sport from API/game payloads; invalid values fall back to padel. */
export function parseGameSport(sport: unknown): Sport {
  return parseSport(sport, DEFAULT_SPORT);
}
