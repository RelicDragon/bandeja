import type { Game } from '@/types';

export type WidgetUiLanguage = 'en' | 'es' | 'ru' | 'sr' | 'cs';

export const WIDGET_UI_LANGUAGES: readonly WidgetUiLanguage[] = [
  'en',
  'es',
  'ru',
  'sr',
  'cs',
] as const;

export interface CachedNextGameDTO {
  id: string;
  title: string;
  clubName: string | null;
  startTime: string;
  status: string;
  resultsStatus: string;
  gameType: string;
  participantCount: number;
  maxParticipants: number | null;
  sport: string | null;
  playersPerMatch: number | null;
}

export interface NextGamesEnvelope {
  isAuthenticated: boolean;
  language: WidgetUiLanguage;
  games: CachedNextGameDTO[];
}

export function resolveWidgetUiLanguage(raw: string | null | undefined): WidgetUiLanguage {
  const code = (raw ?? 'en').split('-')[0]?.toLowerCase() || 'en';
  return (WIDGET_UI_LANGUAGES as readonly string[]).includes(code)
    ? (code as WidgetUiLanguage)
    : 'en';
}

export function resolveCachedNextGameTitle(game: Pick<Game, 'name' | 'club' | 'gameType'>): string {
  const name = game.name?.trim();
  if (name) return name;
  const clubName = game.club?.name?.trim();
  if (clubName) return clubName;
  return game.gameType;
}

export function countPlayingParticipants(
  participants: Game['participants'] | null | undefined,
): number {
  if (!participants?.length) return 0;
  return participants.reduce((n, p) => (p.status === 'PLAYING' ? n + 1 : n), 0);
}

export function mapGameToCachedNextGameDTO(game: Game): CachedNextGameDTO {
  return {
    id: game.id,
    title: resolveCachedNextGameTitle(game),
    clubName: game.club?.name?.trim() || null,
    startTime: game.startTime,
    status: game.status,
    resultsStatus: game.resultsStatus,
    gameType: game.gameType,
    participantCount: countPlayingParticipants(game.participants),
    maxParticipants: game.maxParticipants ?? null,
    sport: game.sport ?? null,
    playersPerMatch: game.playersPerMatch ?? null,
  };
}

export function mapGamesToCachedNextGameDTOs(games: Game[]): CachedNextGameDTO[] {
  return games.map(mapGameToCachedNextGameDTO);
}

export function buildAuthenticatedNextGamesEnvelope(
  games: Game[],
  language: string | null | undefined,
): NextGamesEnvelope {
  return {
    isAuthenticated: true,
    language: resolveWidgetUiLanguage(language),
    games: mapGamesToCachedNextGameDTOs(games),
  };
}

export function buildUnauthenticatedNextGamesEnvelope(
  language: string | null | undefined = 'en',
): NextGamesEnvelope {
  return {
    isAuthenticated: false,
    language: resolveWidgetUiLanguage(language),
    games: [],
  };
}
