import { describe, expect, it } from 'vitest';
import type { Game, GameParticipant } from '@/types';
import {
  REMATCH_EXCLUDED_KEYS,
  buildDuplicateGameInitialData,
  buildRematchGameInitialData,
  previousRosterInvitees,
} from './buildDuplicateGameInitialData';

function makeGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    entityType: 'GAME',
    gameType: 'CLASSIC',
    sport: 'PADEL',
    status: 'FINISHED',
    resultsStatus: 'FINAL',
    startTime: '2026-09-20T10:00:00.000Z',
    endTime: '2026-09-20T11:30:00.000Z',
    maxParticipants: 4,
    playersPerMatch: 4,
    minParticipants: 2,
    isPublic: true,
    affectsRating: true,
    allowDirectJoin: false,
    afterGameGoToBar: false,
    suitableForNovices: true,
    ...overrides,
  } as unknown as Game;
}

function participant(
  userId: string,
  status: GameParticipant['status'],
  role: GameParticipant['role'] = 'PARTICIPANT',
): GameParticipant {
  return {
    userId,
    status,
    role,
    joinedAt: '2026-09-01T00:00:00.000Z',
    user: { id: userId, firstName: userId, level: 3, socialLevel: 3 },
  } as GameParticipant;
}

describe('buildDuplicateGameInitialData', () => {
  /*
   * PRD 360 / plan §5.4 allow-list. "Novices welcome" describes how this
   * organizer runs a game, not what happened in this one, so it rides into the
   * duplicate / "play again" draft — where the organizer can still turn it off
   * before confirming.
   */
  it('copies the novice promise into the draft', () => {
    expect(buildDuplicateGameInitialData(makeGame()).suitableForNovices).toBe(true);
    expect(
      buildDuplicateGameInitialData(makeGame({ suitableForNovices: false })).suitableForNovices,
    ).toBe(false);
  });

  it('leaves it undefined when the source game predates the column', () => {
    const legacy = makeGame();
    delete (legacy as Partial<Game>).suitableForNovices;
    expect(buildDuplicateGameInitialData(legacy).suitableForNovices).toBeUndefined();
  });

  it('never copies the played-out state of the source game', () => {
    const data = buildDuplicateGameInitialData(makeGame()) as Record<string, unknown>;
    for (const key of ['resultsStatus', 'status', 'participants', 'outcomes', 'id']) {
      expect(data[key]).toBeUndefined();
    }
  });
});

/*
 * PRD 362 — the rematch draft. Duplicate keeps the slot and court because it
 * moves an unplayed game; a rematch starts from a finished one, so the old
 * "when / where / booked" must not look current in the new draft.
 */
describe('buildRematchGameInitialData', () => {
  const played = makeGame({
    clubId: 'club-1',
    courtId: 'court-7',
    hasBookedCourt: true,
    bookingStatus: 'EXTERNAL_FULL',
    gameCourts: [{ id: 'gc1', courtId: 'court-7', order: 0 }] as Game['gameCourts'],
    seriesId: 'series-1',
    trainerId: 'coach',
    autoFillFromQueue: true,
    showOnLiveRail: false,
    paymentHint: 'Revolut @me',
    minLevel: 3.2,
    maxLevel: 4.6,
    genderTeams: 'MIX_PAIRS',
    priceType: 'PER_PERSON',
    priceCurrency: 'EUR',
    priceTotal: 40,
    anyoneCanInvite: true,
    resultsByAnyone: true,
    fixedNumberOfSets: 3,
    participants: [participant('me', 'PLAYING', 'OWNER'), participant('ana', 'PLAYING')],
    resultsSummaryText: 'Great game',
  } as Partial<Game>);

  it('copies the format allow-list', () => {
    const draft = buildRematchGameInitialData(played);
    expect(draft).toMatchObject({
      entityType: 'GAME',
      gameType: 'CLASSIC',
      sport: 'PADEL',
      clubId: 'club-1',
      maxParticipants: 4,
      playersPerMatch: 4,
      minLevel: 3.2,
      maxLevel: 4.6,
      genderTeams: 'MIX_PAIRS',
      priceType: 'PER_PERSON',
      priceCurrency: 'EUR',
      priceTotal: 40,
      isPublic: true,
      affectsRating: true,
      anyoneCanInvite: true,
      resultsByAnyone: true,
      allowDirectJoin: false,
      afterGameGoToBar: false,
      suitableForNovices: true,
      fixedNumberOfSets: 3,
    });
  });

  it('drops every excluded key and marks the schedule as not set', () => {
    const draft = buildRematchGameInitialData(played) as Record<string, unknown>;
    for (const key of REMATCH_EXCLUDED_KEYS) {
      expect(draft[key], key).toBeUndefined();
    }
    expect(draft.timeIsSet).toBe(false);
  });

  it('is strictly a subset of the duplicate draft plus the explicit timeIsSet flag', () => {
    const duplicate = buildDuplicateGameInitialData(played) as Record<string, unknown>;
    const rematch = buildRematchGameInitialData(played) as Record<string, unknown>;
    for (const [key, value] of Object.entries(rematch)) {
      if (key === 'timeIsSet') continue;
      expect(duplicate[key], key).toEqual(value);
    }
    // The excluded list names the schedule/court/booking keys the duplicate does carry.
    expect(duplicate.courtId).toBe('court-7');
    expect(duplicate.startTime).toBe('2026-09-20T10:00:00.000Z');
    expect(duplicate.hasBookedCourt).toBe(true);
  });

  it('keeps the authored name only, never a suffix', () => {
    expect(buildRematchGameInitialData(makeGame({ name: 'Tuesday regulars' })).name).toBe(
      'Tuesday regulars',
    );
    expect(buildRematchGameInitialData(makeGame({ name: '' })).name).toBeNull();
  });
});

describe('previousRosterInvitees', () => {
  const roster = [
    participant('me', 'PLAYING', 'OWNER'),
    participant('ana', 'PLAYING'),
    participant('marko', 'PLAYING'),
    participant('queued', 'IN_QUEUE'),
    participant('invited', 'INVITED'),
    participant('guest', 'GUEST'),
    participant('coach', 'NON_PLAYING'),
  ];

  it('invites the PLAYING roster minus the viewer, in roster order, with their users', () => {
    const result = previousRosterInvitees(
      { entityType: 'GAME', participants: roster, trainerId: null },
      'me',
    );
    expect(result.playerIds).toEqual(['ana', 'marko']);
    expect(result.players.map((p) => p.id)).toEqual(['ana', 'marko']);
    expect(result.trainerId).toBeNull();
  });

  it('never counts queue, invited, guest or NON_PLAYING rows', () => {
    const result = previousRosterInvitees(
      { entityType: 'GAME', participants: roster, trainerId: null },
      'ana',
    );
    expect(result.playerIds).toEqual(['me', 'marko']);
  });

  it('TRAINING: a trainee rematching re-invites the trainer as trainer', () => {
    const result = previousRosterInvitees(
      { entityType: 'TRAINING', participants: roster, trainerId: 'coach' },
      'ana',
    );
    expect(result.trainerId).toBe('coach');
    // Appended after the players so the chips read "players, then trainer".
    expect(result.playerIds).toEqual(['me', 'marko', 'coach']);
    expect(result.players.at(-1)?.id).toBe('coach');
  });

  it('TRAINING: the trainer rematching invites only the players', () => {
    const result = previousRosterInvitees(
      { entityType: 'TRAINING', participants: roster, trainerId: 'coach' },
      'coach',
    );
    expect(result.trainerId).toBeNull();
    expect(result.playerIds).toEqual(['me', 'ana', 'marko']);
  });

  it('non-TRAINING entity types ignore trainerId even if present', () => {
    const result = previousRosterInvitees(
      { entityType: 'GAME', participants: roster, trainerId: 'coach' },
      'me',
    );
    expect(result.trainerId).toBeNull();
    expect(result.playerIds).not.toContain('coach');
  });

  it('empty roster yields no invitees', () => {
    expect(previousRosterInvitees({ entityType: 'GAME', participants: [], trainerId: null }, 'me'))
      .toEqual({ playerIds: [], players: [], trainerId: null });
  });
});
