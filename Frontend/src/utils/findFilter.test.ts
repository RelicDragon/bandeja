import { describe, expect, it } from 'vitest';
import { format, startOfDay } from 'date-fns';
import type { Game, User } from '@/types';
import { DEFAULT_AVAILABLE_GAME_PANEL_FILTERS } from '@/utils/availableGamePanelFilters';
import {
  aggregateFindGamesByDay,
  filterFindGames,
  passesFindFilter,
  type FindFilterState,
} from './findFilter';

function baseGame(overrides: Partial<Game> = {}): Game {
  const start = startOfDay(new Date());
  start.setDate(start.getDate() + 1);
  start.setHours(18, 0, 0, 0);
  return {
    id: 'g1',
    entityType: 'GAME',
    sport: 'PADEL',
    gameType: 'CLASSIC',
    name: 'Test',
    status: 'SCHEDULED',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 90 * 60_000).toISOString(),
    timeIsSet: true,
    maxParticipants: 4,
    playersPerMatch: 4,
    minLevel: 2,
    maxLevel: 5,
    isPublic: true,
    affectsRating: true,
    genderTeams: 'ANY',
    participants: [
      {
        userId: 'owner-1',
        role: 'OWNER',
        status: 'PLAYING',
        user: { id: 'owner-1', firstName: 'O', lastName: 'W', gender: 'MALE' },
      } as Game['participants'][number],
    ],
    ...overrides,
  } as Game;
}

function baseViewer(overrides: Partial<User> = {}): User {
  return {
    id: 'viewer-1',
    gender: 'MALE',
    level: 3.5,
    blockedUserIds: [],
    favoriteTrainerId: null,
    isAdmin: false,
    primarySport: 'PADEL',
    sportsEnabled: ['PADEL'],
    ...overrides,
  } as User;
}

function baseState(overrides: Partial<FindFilterState> = {}): FindFilterState {
  return {
    filterAvailableSlots: false,
    filterSuitableRating: false,
    hideBarGames: false,
    gameFilter: false,
    trainingFilter: false,
    tournamentFilter: false,
    leaguesFilter: false,
    showPrivateGames: false,
    findDiscoveryEnabled: false,
    filterNoRating: false,
    panel: { ...DEFAULT_AVAILABLE_GAME_PANEL_FILTERS },
    ...overrides,
  };
}

describe('findFilter', () => {
  it('filters by entity type for list and day counts in parity', () => {
    const day = startOfDay(new Date());
    day.setDate(day.getDate() + 2);
    day.setHours(10, 0, 0, 0);
    const games = [
      baseGame({ id: 'game', entityType: 'GAME', startTime: day.toISOString() }),
      baseGame({ id: 'train', entityType: 'TRAINING', startTime: day.toISOString() }),
      baseGame({ id: 'tourney', entityType: 'TOURNAMENT', startTime: day.toISOString() }),
    ];
    const viewer = baseViewer();
    const state = baseState({ gameFilter: true });

    const list = filterFindGames(games, viewer, state, { mode: 'list' });
    const dayKey = format(day, 'yyyy-MM-dd');
    const aggregates = aggregateFindGamesByDay(games, viewer, state);

    expect(list.map((g) => g.id)).toEqual(['game']);
    expect(aggregates.get(dayKey)?.gameCount).toBe(1);
    expect(aggregates.get(dayKey)?.gameIds).toEqual(['game']);
  });

  it('hides full games when available-slots filter is on', () => {
    const game = baseGame({
      maxParticipants: 2,
      participants: [
        { userId: 'a', role: 'OWNER', status: 'PLAYING', user: { id: 'a', gender: 'MALE' } },
        { userId: 'b', role: 'PLAYER', status: 'PLAYING', user: { id: 'b', gender: 'FEMALE' } },
      ] as Game['participants'],
    });
    const viewer = baseViewer();
    const state = baseState({ filterAvailableSlots: true });

    expect(passesFindFilter(game, viewer, state)).toBe(false);
    expect(filterFindGames([game], viewer, state)).toHaveLength(0);
    expect(aggregateFindGamesByDay([game], viewer, state).size).toBe(0);
  });

  it('applies suitable rating filter', () => {
    const game = baseGame({ minLevel: 5, maxLevel: 7 });
    const viewer = baseViewer({
      level: 3,
      sportProfiles: undefined,
    } as Partial<User>);
    const state = baseState({ filterSuitableRating: true });

    expect(passesFindFilter(game, viewer, state)).toBe(false);
  });

  it('hides private games unless participant or admin show-private', () => {
    const game = baseGame({ isPublic: false });
    const outsider = baseViewer({ id: 'outsider' });
    const participant = baseViewer({
      id: 'owner-1',
    });
    const admin = baseViewer({ id: 'admin', isAdmin: true });
    const state = baseState();

    expect(passesFindFilter(game, outsider, state)).toBe(false);
    expect(passesFindFilter(game, participant, state)).toBe(true);
    expect(passesFindFilter(game, admin, { ...state, showPrivateGames: true })).toBe(true);
  });

  it('hides bar games when hideBarGames is on', () => {
    const game = baseGame({ entityType: 'BAR' });
    expect(passesFindFilter(game, baseViewer(), baseState({ hideBarGames: true }))).toBe(false);
  });

  it('honors no-rating discovery filter when discovery enabled', () => {
    const rated = baseGame({ affectsRating: true });
    const casual = baseGame({ id: 'casual', affectsRating: false });
    const state = baseState({ findDiscoveryEnabled: true, filterNoRating: true });
    const viewer = baseViewer();

    expect(passesFindFilter(rated, viewer, state)).toBe(false);
    expect(passesFindFilter(casual, viewer, state)).toBe(true);
  });

  it('list allows LEAGUE_SEASON without time; calendar does not', () => {
    const season = baseGame({
      id: 'season',
      entityType: 'LEAGUE_SEASON',
      timeIsSet: false,
    });
    const viewer = baseViewer();
    const state = baseState({ leaguesFilter: true });

    expect(passesFindFilter(season, viewer, state, { mode: 'list' })).toBe(true);
    expect(passesFindFilter(season, viewer, state, { mode: 'calendar' })).toBe(false);
  });

  it('selected-day list length matches calendar day count', () => {
    const dayA = startOfDay(new Date());
    dayA.setDate(dayA.getDate() + 3);
    dayA.setHours(12, 0, 0, 0);
    const dayB = startOfDay(new Date());
    dayB.setDate(dayB.getDate() + 4);
    dayB.setHours(12, 0, 0, 0);

    const games = [
      baseGame({ id: 'a1', startTime: dayA.toISOString() }),
      baseGame({ id: 'a2', startTime: dayA.toISOString(), entityType: 'TRAINING' }),
      baseGame({ id: 'b1', startTime: dayB.toISOString() }),
    ];
    const viewer = baseViewer();
    const state = baseState({ gameFilter: true });

    const dayList = filterFindGames(games, viewer, state, {
      mode: 'calendar',
      selectedDay: dayA,
    });
    const aggregates = aggregateFindGamesByDay(games, viewer, state);
    const dayKey = format(dayA, 'yyyy-MM-dd');

    expect(dayList).toHaveLength(1);
    expect(aggregates.get(dayKey)?.gameCount).toBe(dayList.length);
    expect(aggregates.get(dayKey)?.gameIds).toEqual(dayList.map((g) => g.id));
  });

  it('blocks games owned by blocked users', () => {
    const game = baseGame();
    const viewer = baseViewer({ blockedUserIds: ['owner-1'] });
    expect(passesFindFilter(game, viewer, baseState())).toBe(false);
  });

  it('hides gender-restricted games for PREFER_NOT_TO_SAY viewers (list + calendar)', () => {
    const game = baseGame({ genderTeams: 'MEN' });
    const viewer = baseViewer({ gender: 'PREFER_NOT_TO_SAY' });
    const state = baseState();

    expect(passesFindFilter(game, viewer, state, { mode: 'list' })).toBe(false);
    expect(passesFindFilter(game, viewer, state, { mode: 'calendar' })).toBe(false);
    expect(aggregateFindGamesByDay([game], viewer, state).size).toBe(0);
  });

  it('favorite trainer chip keeps only that trainer’s trainings', () => {
    const day = startOfDay(new Date());
    day.setDate(day.getDate() + 2);
    day.setHours(10, 0, 0, 0);
    const favorite = baseGame({
      id: 'fav',
      entityType: 'TRAINING',
      trainerId: 'trainer-1',
      startTime: day.toISOString(),
      participants: [
        {
          userId: 'trainer-1',
          role: 'OWNER',
          status: 'PLAYING',
          user: { id: 'trainer-1', gender: 'MALE' },
        },
      ] as Game['participants'],
    });
    const other = baseGame({
      id: 'other',
      entityType: 'TRAINING',
      trainerId: 'trainer-2',
      startTime: day.toISOString(),
      participants: [
        {
          userId: 'trainer-2',
          role: 'OWNER',
          status: 'PLAYING',
          user: { id: 'trainer-2', gender: 'MALE' },
        },
      ] as Game['participants'],
    });
    const viewer = baseViewer({ favoriteTrainerId: 'trainer-1' });
    const state = baseState({ trainingFilter: true });

    const list = filterFindGames([favorite, other], viewer, state, { mode: 'list' });
    const aggregates = aggregateFindGamesByDay([favorite, other], viewer, state);
    const dayKey = format(day, 'yyyy-MM-dd');

    expect(list.map((g) => g.id)).toEqual(['fav']);
    expect(aggregates.get(dayKey)?.gameCount).toBe(1);
    expect(aggregates.get(dayKey)?.gameIds).toEqual(['fav']);
  });

  it('records participant pills before slots filter excludes the game from counts', () => {
    const day = startOfDay(new Date());
    day.setDate(day.getDate() + 2);
    day.setHours(10, 0, 0, 0);
    const full = baseGame({
      id: 'full',
      startTime: day.toISOString(),
      maxParticipants: 2,
      participants: [
        {
          userId: 'viewer-1',
          role: 'PLAYER',
          status: 'PLAYING',
          user: { id: 'viewer-1', gender: 'MALE' },
        },
        {
          userId: 'owner-1',
          role: 'OWNER',
          status: 'PLAYING',
          user: { id: 'owner-1', gender: 'FEMALE' },
        },
      ] as Game['participants'],
    });
    const viewer = baseViewer();
    const state = baseState({ filterAvailableSlots: true });
    const aggregates = aggregateFindGamesByDay([full], viewer, state);
    const dayKey = format(day, 'yyyy-MM-dd');

    expect(aggregates.get(dayKey)?.gameCount).toBe(0);
    expect(aggregates.get(dayKey)?.participantEntityTypes.has('GAME')).toBe(true);
  });
});
