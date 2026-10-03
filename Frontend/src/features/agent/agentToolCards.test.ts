import { describe, expect, it } from 'vitest';
import type {
  AgentEntityRef,
  AgentMessageDto,
  AgentPendingActionDto,
  AgentResultsCard,
  AgentWeatherCard,
  AgentWeatherCardHour,
} from '@shared/agentContract';
import { agentActionOutcomeHaptic, agentActionPhase, agentPreviewLineKind } from './agentActionPhase';
import { agentRunReducer, createRunState } from './agentRunReducer';
import { buildAgentTimeline } from './agentTimeline';
import {
  agentToolCardPath,
  entitiesBesideCard,
  formatCardClock,
  formatCardTemperature,
  isInBestWindow,
  playedSets,
  setWinners,
  weatherHeadlineHour,
  weatherVerdictTone,
} from './agentToolCards';

const results: AgentResultsCard = {
  kind: 'results',
  gameId: 'g1',
  title: 'Friday padel',
  resultsStatus: 'IN_PROGRESS',
  matchCount: 1,
  matches: [
    {
      round: 1,
      match: 1,
      teamA: [{ name: 'Ana', you: true }, { name: 'Bo' }],
      teamB: [{ name: 'Cy' }, { name: 'Di' }],
      sets: [
        { teamA: 6, teamB: 4 },
        { teamA: 3, teamB: 6 },
        { teamA: 10, teamB: 8, tieBreak: true },
        { teamA: 0, teamB: 0 },
      ],
      winner: 'teamA',
    },
  ],
};

const hour = (time: string, playable = true): AgentWeatherCardHour => ({
  time,
  tempC: 21,
  condition: 'clear',
  isDay: true,
  rainChancePct: 0,
  rainMm: null,
  windKmh: 8,
  playable,
});

const weather: AgentWeatherCard = {
  kind: 'weather',
  place: 'Belgrade',
  gameId: null,
  gameTitle: null,
  date: '2026-10-04',
  window: null,
  source: 'forecast',
  stale: false,
  outdoor: null,
  verdict: 'risky',
  bestWindow: { start: '09:00', end: '12:00' },
  hours: [hour('08:00', false), hour('09:00'), hour('10:00'), hour('11:00'), hour('12:00', false), hour('13:00', false)],
};

const game = (id: string): AgentEntityRef => ({
  type: 'game',
  id,
  title: 'Game',
  entityType: 'GAME',
  status: 'FINISHED',
  startTime: null,
  clubName: null,
});

describe('results card helpers', () => {
  it('drops placeholder sets and finds each set winner', () => {
    const match = results.matches[0];
    expect(playedSets(match)).toHaveLength(3);
    expect(setWinners({ ...match, sets: playedSets(match) })).toEqual(['teamA', 'teamB', 'teamA']);
  });

  it('opens the game; the duplicate game entity is dropped beside the card', () => {
    expect(agentToolCardPath(results)).toBe('/games/g1');
    expect(entitiesBesideCard([game('g1'), game('g2')], results).map((e) => (e.type === 'game' ? e.id : ''))).toEqual(['g2']);
    expect(entitiesBesideCard([game('g1')], undefined)).toHaveLength(1);
  });
});

describe('weather card helpers', () => {
  it('a day card has no destination; a game card opens the game', () => {
    expect(agentToolCardPath(weather)).toBeNull();
    expect(agentToolCardPath({ ...weather, gameId: 'g7' })).toBe('/games/g7');
  });

  it('marks the best window with an exclusive end', () => {
    expect(weather.hours.filter((h) => isInBestWindow(weather, h)).map((h) => h.time)).toEqual(['09:00', '10:00', '11:00']);
    expect(isInBestWindow({ bestWindow: null }, hour('10:00'))).toBe(false);
  });

  it('headline hour: the game start, else midday, else the middle', () => {
    expect(weatherHeadlineHour(weather)?.time).toBe('13:00');
    expect(weatherHeadlineHour({ ...weather, window: { start: '10:30', end: '12:00' } })?.time).toBe('10:00');
    expect(weatherHeadlineHour({ ...weather, hours: [hour('18:00'), hour('19:00'), hour('20:00')] })?.time).toBe('19:00');
    expect(weatherHeadlineHour({ ...weather, hours: [] })).toBeNull();
  });

  it('formats temperature, clock and verdict tone', () => {
    expect(formatCardTemperature(21, false)).toBe('21°');
    expect(formatCardTemperature(21, true)).toBe('70°');
    expect(formatCardClock('18:00', 'en-GB', false)).toBe('18:00');
    expect(formatCardClock('18:00', 'en-US', true)).toMatch(/6:00\s?PM/);
    expect(formatCardClock('24:00', 'en-GB', false)).toBe('24:00');
    expect(formatCardClock('bad', 'en-GB', false)).toBe('bad');
    expect(weatherVerdictTone('good')).toBe('good');
    expect(weatherVerdictTone('risky')).toBe('warn');
    expect(weatherVerdictTone('bad')).toBe('bad');
    expect(weatherVerdictTone('indoor')).toBe('info');
  });
});

describe('card in the timeline', () => {
  it('a live tool.finished card and a persisted tool_result card both reach the tool item', () => {
    let live = createRunState('r1', 'chat');
    live = agentRunReducer(live, {
      type: 'event',
      eventId: '1',
      event: { type: 'tool.started', callId: 'c1', name: 'get_weather', label: 'Checking the weather' },
    });
    live = agentRunReducer(live, { type: 'event', eventId: '2', event: { type: 'tool.finished', callId: 'c1', ok: true, summary: 'Weather', card: weather } });
    const liveItems = buildAgentTimeline([], [], live);
    expect(liveItems[0].kind === 'tool' && liveItems[0].tool.card?.kind).toBe('weather');

    const message: AgentMessageDto = {
      id: 'm1',
      chatId: 'chat',
      seq: 2,
      role: 'ASSISTANT',
      runId: 'r1',
      createdAt: '2026-10-03T10:00:00.000Z',
      blocks: [
        { type: 'tool_call', callId: 'c2', name: 'get_game_results', label: 'Results' },
        { type: 'tool_result', callId: 'c2', ok: true, summary: '1 of 1', card: results },
      ],
    };
    const persisted = buildAgentTimeline([message], [], null);
    expect(persisted[0].kind === 'tool' && persisted[0].tool.card?.kind).toBe('results');
  });
});

describe('action card phases', () => {
  const action = (over: Partial<AgentPendingActionDto> = {}): Pick<AgentPendingActionDto, 'status' | 'result'> => ({
    status: 'PENDING',
    result: null,
    ...over,
  });

  it('pending → executing → done / failed / closed', () => {
    expect(agentActionPhase(action(), null)).toBe('pending');
    expect(agentActionPhase(action(), 'reject')).toBe('pending');
    expect(agentActionPhase(action(), 'confirm')).toBe('executing');
    expect(agentActionPhase(action(), 'always')).toBe('executing');
    expect(agentActionPhase(action({ status: 'EXECUTED', result: { ok: true, message: 'Saved' } }), null)).toBe('done');
    expect(agentActionPhase(action({ status: 'EXECUTED', result: { ok: false, message: 'No' } }), null)).toBe('failed');
    expect(agentActionPhase(action({ status: 'FAILED' }), null)).toBe('failed');
    expect(agentActionPhase(action({ status: 'UNKNOWN' }), null)).toBe('failed');
    expect(agentActionPhase(action({ status: 'REJECTED' }), null)).toBe('closed');
    expect(agentActionPhase(action({ status: 'EXPIRED' }), null)).toBe('closed');
  });

  it('outcome haptics only for an outcome that arrives on screen', () => {
    expect(agentActionOutcomeHaptic('executing', 'done')).toBe('success');
    expect(agentActionOutcomeHaptic('pending', 'failed')).toBe('error');
    expect(agentActionOutcomeHaptic(null, 'done')).toBeNull();
    expect(agentActionOutcomeHaptic('done', 'done')).toBeNull();
    expect(agentActionOutcomeHaptic('pending', 'closed')).toBeNull();
  });

  it('classifies preview lines', () => {
    expect(agentPreviewLineKind({ from: '18:00', to: '19:00' })).toBe('change');
    expect(agentPreviewLineKind({ from: null, to: 'Court 1' })).toBe('added');
    expect(agentPreviewLineKind({ from: 'Court 1', to: null })).toBe('removed');
  });
});
