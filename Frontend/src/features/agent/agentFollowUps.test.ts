import { describe, expect, it } from 'vitest';
import type { AgentEntityRef, AgentMessageDto, AgentPendingActionDto } from '@shared/agentContract';
import {
  AGENT_FOLLOW_UP_KEYS,
  AGENT_FOLLOW_UP_MAX,
  agentFollowUps,
  summarizeAgentTurn,
  type AgentTurnSummary,
} from './agentFollowUps';
import en from '@/i18n/locales/en/agent.json';

const USER = { isAdmin: false };
const ADMIN = { isAdmin: true };

const game: AgentEntityRef = {
  type: 'game',
  id: 'g1',
  title: 'Evening',
  entityType: 'GAME',
  status: 'ANNOUNCED',
  startTime: '2026-10-04T17:00:00.000Z',
  clubName: 'Club',
};
const slot: AgentEntityRef = {
  type: 'slot',
  slotRef: 's1.x.y',
  clubId: 'c1',
  clubName: 'Club',
  courtNames: ['1'],
  start: '2026-10-04T17:00:00.000Z',
  end: '2026-10-04T18:30:00.000Z',
  timeZone: 'Europe/Belgrade',
  confidence: 'live',
  asOf: null,
};

const turn = (partial: Partial<AgentTurnSummary>): AgentTurnSummary => ({
  tools: [],
  actions: [],
  hasText: true,
  ...partial,
});
const read = (name: string, entities: AgentEntityRef[] = [], ok: boolean | null = true) => ({ name, ok, entities });

describe('agentFollowUps', () => {
  it('offers roster and weather chips after list_my_games', () => {
    expect(agentFollowUps(turn({ tools: [read('list_my_games', [game])] }), USER)).toEqual([
      'whoMissing',
      'weatherNext',
      'splitCost',
    ]);
  });

  it('offers booking the first slot only when slots came back', () => {
    expect(agentFollowUps(turn({ tools: [read('find_available_slots', [slot])] }), USER)).toEqual([
      'bookFirstSlot',
      'laterSlots',
    ]);
    expect(agentFollowUps(turn({ tools: [read('find_available_slots')] }), USER)).toEqual(['otherDay']);
  });

  it('does not repeat the league view the user just saw', () => {
    expect(agentFollowUps(turn({ tools: [read('get_league_standings')] }), USER)).toEqual(['nextRound']);
    expect(agentFollowUps(turn({ tools: [read('get_league_schedule')] }), USER)).toEqual(['standings']);
    expect(agentFollowUps(turn({ tools: [read('get_league_season')] }), USER)).toEqual(['standings', 'nextRound']);
  });

  it('leads with the executed write, then the reads', () => {
    const keys = agentFollowUps(
      turn({
        tools: [read('find_available_slots', [slot]), read('create_game_with_booking')],
        actions: [{ toolName: 'create_game_with_booking', status: 'EXECUTED' }],
      }),
      USER,
    );
    expect(keys).toEqual(['invitePlayers', 'splitCost', 'weatherNext']);
  });

  it('offers score entry after results', () => {
    expect(agentFollowUps(turn({ tools: [read('get_game_results', [game])] }), USER)).toEqual([
      'enterScore',
      'finishResults',
    ]);
    expect(
      agentFollowUps(turn({ actions: [{ toolName: 'enter_match_score', status: 'EXECUTED' }] }), USER),
    ).toEqual(['finishResults', 'showResults']);
  });

  it('shows nothing while a write card waits for the user', () => {
    const pending = turn({
      tools: [read('list_my_games', [game])],
      actions: [{ toolName: 'update_game', status: 'PENDING' }],
    });
    expect(agentFollowUps(pending, USER)).toEqual([]);
    const confirming = turn({ actions: [{ toolName: 'update_game', status: 'CONFIRMED' }] });
    expect(agentFollowUps(confirming, USER)).toEqual([]);
  });

  it('a rejected write gives no write chips but keeps the read chips', () => {
    expect(
      agentFollowUps(
        turn({ tools: [read('get_weather')], actions: [{ toolName: 'update_game', status: 'REJECTED' }] }),
        USER,
      ),
    ).toEqual(['findIndoor', 'moveGame']);
  });

  it('offers a retry when every tool failed or the write failed', () => {
    expect(agentFollowUps(turn({ tools: [read('list_my_games', [], false)] }), USER)).toEqual(['retry']);
    expect(agentFollowUps(turn({ actions: [{ toolName: 'book_court', status: 'FAILED' }] }), USER)).toEqual(['retry']);
  });

  it('a plain text reply (no tools) has no chips', () => {
    expect(agentFollowUps(turn({}), USER)).toEqual([]);
    expect(agentFollowUps(null, USER)).toEqual([]);
  });

  it('keeps admin chips for admins only', () => {
    const t = turn({ tools: [read('admin_list_pending_events')] });
    expect(agentFollowUps(t, USER)).toEqual([]);
    expect(agentFollowUps(t, ADMIN)).toEqual(['adminApproveFirst']);
  });

  it('dedupes and caps at the maximum', () => {
    const keys = agentFollowUps(
      turn({ tools: [read('get_weather'), read('list_my_games', [game]), read('get_game', [game])] }),
      USER,
    );
    expect(keys).toHaveLength(AGENT_FOLLOW_UP_MAX);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['whoMissing', 'weatherNext', 'splitCost']);
  });

  it('every key has an English string', () => {
    const strings = (en as { agent: { followUps: Record<string, string> } }).agent.followUps;
    for (const key of AGENT_FOLLOW_UP_KEYS) expect(strings[key], key).toBeTruthy();
  });
});

const msg = (id: string, seq: number, role: AgentMessageDto['role'], blocks: AgentMessageDto['blocks']): AgentMessageDto => ({
  id,
  chatId: 'c',
  seq,
  role,
  blocks,
  runId: role === 'USER' ? null : 'r2',
  createdAt: '2026-10-03T10:00:00.000Z',
});

const action = (id: string, status: AgentPendingActionDto['status'], runId = 'r2'): AgentPendingActionDto => ({
  id,
  chatId: 'c',
  runId,
  toolName: 'update_game',
  status,
  preview: { title: 'x', lines: [], warnings: [] },
  expiresAt: '2026-10-03T11:00:00.000Z',
  result: null,
  createdAt: '2026-10-03T10:00:00.000Z',
  autoApproved: false,
  riskTier: 'standard',
  canAlwaysAllow: true,
  execution: 'server',
});

describe('summarizeAgentTurn', () => {
  it('reads only the turn after the last user message', () => {
    const messages = [
      msg('u1', 1, 'USER', [{ type: 'text', text: 'slots?' }]),
      msg('a1', 2, 'ASSISTANT', [{ type: 'tool_call', callId: 'old', name: 'find_available_slots', label: 'x' }]),
      msg('u2', 3, 'USER', [{ type: 'text', text: 'my games' }]),
      msg('a2', 4, 'ASSISTANT', [{ type: 'tool_call', callId: 'c1', name: 'list_my_games', label: 'Games' }]),
      msg('t2', 5, 'TOOL', [{ type: 'tool_result', callId: 'c1', ok: true, summary: '1 game', entities: [game] }]),
      msg('a3', 6, 'ASSISTANT', [{ type: 'text', text: 'You have one game.' }]),
    ];
    expect(summarizeAgentTurn(messages, [])).toEqual({
      tools: [{ name: 'list_my_games', ok: true, entities: [game] }],
      actions: [],
      hasText: true,
    });
  });

  it('is null when the chat ends with the user message or is empty', () => {
    expect(summarizeAgentTurn([], [])).toBeNull();
    expect(summarizeAgentTurn([msg('u1', 1, 'USER', [{ type: 'text', text: 'hi' }])], [])).toBeNull();
  });

  it('picks up actions by block and by run id', () => {
    const messages = [
      msg('u1', 1, 'USER', [{ type: 'text', text: 'move it' }]),
      msg('a1', 2, 'ASSISTANT', [{ type: 'action', actionId: 'x1' }]),
    ];
    const summary = summarizeAgentTurn(messages, [action('x1', 'EXECUTED'), action('x2', 'PENDING'), action('old', 'PENDING', 'r1')]);
    expect(summary?.actions).toEqual([
      { toolName: 'update_game', status: 'EXECUTED' },
      { toolName: 'update_game', status: 'PENDING' },
    ]);
  });

  it('marks a call without a result as unfinished', () => {
    const messages = [
      msg('u1', 1, 'USER', [{ type: 'text', text: 'games' }]),
      msg('a1', 2, 'ASSISTANT', [{ type: 'tool_call', callId: 'c1', name: 'list_my_games', label: 'Games' }]),
    ];
    expect(summarizeAgentTurn(messages, [])?.tools).toEqual([{ name: 'list_my_games', ok: null, entities: [] }]);
  });
});
