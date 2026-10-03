import { describe, expect, it } from 'vitest';
import type { Game, GameParticipant, Invite } from '@/types';
import type { OwedCostShare } from '@/api/gameCost';
import { buildAgentPersonalPrompts, formatAgentShortWhen, type AgentPersonalPromptInput } from './agentPersonalPrompts';

const ME = 'me';
const NOW = new Date('2026-10-03T12:00:00.000Z');
const HOUR = 3_600_000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR).toISOString();

const participant = (
  userId: string,
  status: GameParticipant['status'] = 'PLAYING',
  role: GameParticipant['role'] = 'PARTICIPANT',
): GameParticipant =>
  ({ userId, status, role, joinedAt: at(-100), user: { id: userId, firstName: userId } }) as GameParticipant;

function makeGame(id: string, partial: Partial<Game> = {}): Game {
  return {
    id,
    entityType: 'GAME',
    status: 'ANNOUNCED',
    resultsStatus: 'NONE',
    startTime: at(30),
    endTime: at(31.5),
    maxParticipants: 4,
    participants: [participant(ME, 'PLAYING', 'OWNER')],
    club: { name: `Club ${id}` },
    city: { timezone: 'Europe/Belgrade' },
    ...partial,
  } as unknown as Game;
}

const input = (partial: Partial<AgentPersonalPromptInput>): AgentPersonalPromptInput => ({
  userId: ME,
  games: [],
  invites: [],
  owed: null,
  now: NOW,
  formatWhen: (iso, tz) => `${iso}@${tz ?? '-'}`,
  ...partial,
});

describe('buildAgentPersonalPrompts', () => {
  it('is empty without data (the caller falls back to the generic examples)', () => {
    expect(buildAgentPersonalPrompts(input({}))).toEqual([]);
  });

  it('asks to fill open spots on my soonest upcoming game, with the time in the game city', () => {
    const later = makeGame('later', { startTime: at(72) });
    const soon = makeGame('soon', { startTime: at(30), participants: [participant(ME, 'PLAYING', 'OWNER'), participant('a'), participant('b')] });
    const [prompt] = buildAgentPersonalPrompts(input({ games: [later, soon] }));
    expect(prompt).toEqual({
      id: 'needsPlayers:soon',
      kind: 'needsPlayers',
      gameId: 'soon',
      vars: { when: `${at(30)}@Europe/Belgrade`, playing: 3, max: 4 },
      place: 'Club soon',
    });
  });

  it('ignores full games, games I only play in, queued players and unset times', () => {
    const full = makeGame('full', {
      participants: [participant(ME, 'PLAYING', 'OWNER'), participant('a'), participant('b'), participant('c')],
    });
    const notMine = makeGame('notMine', { participants: [participant(ME), participant('o', 'PLAYING', 'OWNER')] });
    const queuedOnly = makeGame('queued', {
      maxParticipants: 2,
      participants: [participant(ME, 'PLAYING', 'OWNER'), participant('q', 'IN_QUEUE'), participant('i', 'INVITED')],
    });
    const unset = makeGame('unset', { timeIsSet: false });
    const kinds = buildAgentPersonalPrompts(input({ games: [full, notMine, unset] })).map((p) => p.kind);
    expect(kinds).not.toContain('needsPlayers');
    // IN_QUEUE / INVITED don't take a seat: the 2-player game still has one free.
    expect(buildAgentPersonalPrompts(input({ games: [queuedOnly] }))[0]).toMatchObject({
      kind: 'needsPlayers',
      vars: { playing: 1, max: 2 },
    });
  });

  it('asks to enter the score of a recently finished game, past-games cache included', () => {
    const finished = makeGame('done', { status: 'FINISHED', startTime: at(-20), endTime: at(-18.5) });
    const old = makeGame('old', { status: 'FINISHED', startTime: at(-100), endTime: at(-98) });
    const final = makeGame('final', { status: 'FINISHED', resultsStatus: 'FINAL', startTime: at(-5), endTime: at(-4) });
    const [prompt] = buildAgentPersonalPrompts(input({ pastGames: [old, finished, final] }));
    expect(prompt).toMatchObject({ kind: 'enterScore', gameId: 'done', place: 'Club done' });
  });

  it('lets a player enter the score only when results are open to anyone', () => {
    const base = { status: 'FINISHED' as const, startTime: at(-5), endTime: at(-4), participants: [participant(ME), participant('o', 'PLAYING', 'OWNER')] };
    expect(buildAgentPersonalPrompts(input({ games: [makeGame('x', base)] }))).toEqual([]);
    expect(buildAgentPersonalPrompts(input({ games: [makeGame('x', { ...base, resultsByAnyone: true })] }))[0].kind).toBe(
      'enterScore',
    );
  });

  it('builds money prompts from the owed summary', () => {
    const share = (gameId: string, startTime: string, state: OwedCostShare['state'] = 'UNPAID'): OwedCostShare => ({
      gameId,
      gameName: null,
      startTime,
      amountMinor: 1000,
      currency: 'EUR',
      state,
      counterparty: { id: 'p', firstName: 'Ana' },
      counterpartyUserId: 'p',
    });
    const prompts = buildAgentPersonalPrompts(
      input({
        owed: {
          owedToMe: [share('g1', at(-30)), share('g1', at(-30)), share('g2', at(-60)), share('g3', at(-10), 'SETTLED')],
          owed: [share('g9', at(-50)), share('g8', at(-80), 'MARKED_PAID')],
        },
      }),
    );
    expect(prompts.map((p) => [p.kind, p.gameId, p.vars])).toEqual([
      ['remindPay', 'g1', { when: `${at(-30)}@-`, count: 2 }],
      ['payShare', 'g9', { when: `${at(-50)}@-`, name: 'Ana' }],
    ]);
  });

  it('mentions a visible invite with the sender name', () => {
    const invite = {
      id: 'inv1',
      senderId: 's',
      receiverId: ME,
      status: 'PENDING',
      createdAt: at(-2),
      sender: { id: 's', firstName: 'Marko' },
      game: makeGame('ig', { participants: [participant('s', 'PLAYING', 'OWNER')] }),
    } as unknown as Invite;
    const expired = { ...invite, id: 'inv2', expiresAt: at(-1) } as Invite;
    const prompts = buildAgentPersonalPrompts(input({ invites: [expired, invite] }));
    expect(prompts).toEqual([
      expect.objectContaining({ kind: 'pendingInvite', id: 'pendingInvite:inv1', vars: { when: `${at(30)}@Europe/Belgrade`, name: 'Marko' } }),
    ]);
  });

  it('suggests the next round of a league season I run', () => {
    const season = makeGame('s1', {
      entityType: 'LEAGUE_SEASON',
      status: 'STARTED',
      leagueSeason: { id: 'ls', leagueId: 'l', league: { id: 'l', name: 'Winter League' } },
    });
    const [prompt] = buildAgentPersonalPrompts(input({ games: [season] }));
    expect(prompt).toMatchObject({ kind: 'leagueNext', vars: { league: 'Winter League' }, place: null });
  });

  it('adds the weather of my next game, never for a game another prompt already covers', () => {
    const mine = makeGame('mine', {
      participants: [participant(ME, 'PLAYING', 'OWNER'), participant('a'), participant('b'), participant('c')],
    });
    expect(buildAgentPersonalPrompts(input({ games: [mine] })).map((p) => p.kind)).toEqual(['nextGameWeather']);
    const open = makeGame('open');
    expect(buildAgentPersonalPrompts(input({ games: [open] })).map((p) => p.kind)).toEqual(['needsPlayers']);
  });

  it('orders by priority and caps at four', () => {
    const games = [
      makeGame('done', { status: 'FINISHED', startTime: at(-5), endTime: at(-4) }),
      makeGame('open'),
      makeGame('s1', {
        entityType: 'LEAGUE_SEASON',
        leagueSeason: { id: 'ls', leagueId: 'l', league: { id: 'l', name: 'L' } },
      }),
    ];
    const owedShare = (gameId: string): OwedCostShare => ({
      gameId,
      gameName: null,
      startTime: at(-30),
      amountMinor: 1,
      currency: 'EUR',
      state: 'UNPAID',
      counterparty: null,
      counterpartyUserId: null,
    });
    const prompts = buildAgentPersonalPrompts(input({ games, owed: { owedToMe: [owedShare('a')], owed: [owedShare('b')] } }));
    expect(prompts.map((p) => p.kind)).toEqual(['enterScore', 'needsPlayers', 'remindPay', 'payShare']);
  });
});

describe('formatAgentShortWhen', () => {
  it('uses the weekday near now and the 12/24 h setting', () => {
    const iso = '2026-10-04T17:00:00.000Z';
    expect(formatAgentShortWhen(iso, { locale: 'en-GB', hour12: false }, 'Europe/Belgrade', NOW)).toBe('Sun 19:00');
    expect(formatAgentShortWhen(iso, { locale: 'en-US', hour12: true }, 'Europe/Belgrade', NOW)).toBe('Sun 7:00 PM');
  });

  it('uses the date further out and is empty for a bad date', () => {
    expect(formatAgentShortWhen('2026-10-20T17:00:00.000Z', { locale: 'en-GB', hour12: false }, 'UTC', NOW)).toBe(
      '20 Oct, 17:00',
    );
    expect(formatAgentShortWhen('nope', { locale: 'en-GB', hour12: false }, null, NOW)).toBe('');
  });
});
