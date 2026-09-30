import { describe, expect, it } from 'vitest';
import type { AgentMessageDto, AgentPendingActionDto, AgentStreamEvent } from '@shared/agentContract';
import {
  agentRunReducer,
  createRunState,
  isEventIdAtOrBefore,
  type AgentRunLiveState,
} from './agentRunReducer';
import { buildAgentTimeline } from './agentTimeline';

const game = {
  type: 'game' as const,
  id: 'g1',
  title: 'Thursday padel',
  entityType: 'GAME',
  status: 'ANNOUNCED',
  startTime: '2026-10-01T17:00:00.000Z',
  clubName: 'Club X',
};

function run(events: Array<[AgentStreamEvent, string | null]>, start?: AgentRunLiveState): AgentRunLiveState {
  return events.reduce(
    (s, [event, eventId]) => agentRunReducer(s, { type: 'event', event, eventId }),
    start ?? createRunState('r1', 'c1'),
  );
}

const action: AgentPendingActionDto = {
  id: 'a1',
  chatId: 'c1',
  runId: 'r1',
  toolName: 'update_game',
  status: 'PENDING',
  preview: { title: 'Move game', lines: [{ label: 'Start', from: '18:00', to: '19:00' }], warnings: [] },
  expiresAt: '2026-10-01T18:00:00.000Z',
  result: null,
  createdAt: '2026-10-01T17:45:00.000Z',
  autoApproved: false,
  riskTier: 'standard',
  canAlwaysAllow: true,
  execution: 'server',
};

function message(partial: Partial<AgentMessageDto> & Pick<AgentMessageDto, 'id' | 'seq' | 'role' | 'blocks'>): AgentMessageDto {
  return { chatId: 'c1', runId: 'r1', createdAt: '2026-10-01T17:00:00.000Z', ...partial };
}

describe('agentRunReducer', () => {
  it('starts connecting and streams on run.started', () => {
    const s = run([[{ type: 'run.started', runId: 'r1', chatId: 'c1' }, '1']]);
    expect(s.phase).toBe('streaming');
    expect(s.lastEventId).toBe('1');
  });

  it('concatenates consecutive text deltas into one segment', () => {
    const s = run([
      [{ type: 'text.delta', text: 'Hel' }, '1'],
      [{ type: 'text.delta', text: 'lo' }, '2'],
    ]);
    expect(s.segments).toEqual([{ kind: 'text', text: 'Hello' }]);
  });

  it('orders text and tool segments and finishes tools by callId', () => {
    const s = run([
      [{ type: 'text.delta', text: 'Let me look.' }, '1'],
      [{ type: 'tool.started', callId: 't1', name: 'list_my_games', label: 'Looking up your games' }, '2'],
      [{ type: 'tool.finished', callId: 't1', ok: true, summary: 'Found 1 game', entities: [game] }, '3'],
      [{ type: 'text.delta', text: 'You have one.' }, '4'],
    ]);
    expect(s.segments).toEqual([
      { kind: 'text', text: 'Let me look.' },
      { kind: 'tool', callId: 't1' },
      { kind: 'text', text: 'You have one.' },
    ]);
    expect(s.tools.t1).toMatchObject({ status: 'ok', summary: 'Found 1 game', label: 'Looking up your games' });
    expect(s.touchedEntities).toEqual([game]);
  });

  it('marks a failed tool as error', () => {
    const s = run([
      [{ type: 'tool.started', callId: 't1', name: 'get_game', label: 'Opening game' }, '1'],
      [{ type: 'tool.finished', callId: 't1', ok: false, summary: 'Not found' }, '2'],
    ]);
    expect(s.tools.t1.status).toBe('error');
  });

  it('drops replayed events at or before the last applied id', () => {
    const once = run([
      [{ type: 'text.delta', text: 'a' }, '1-0'],
      [{ type: 'text.delta', text: 'b' }, '2-0'],
    ]);
    const replayed = run(
      [
        [{ type: 'text.delta', text: 'a' }, '1-0'],
        [{ type: 'text.delta', text: 'b' }, '2-0'],
        [{ type: 'text.delta', text: 'c' }, '2-1'],
      ],
      once,
    );
    expect(replayed.segments).toEqual([{ kind: 'text', text: 'abc' }]);
    expect(replayed.lastEventId).toBe('2-1');
  });

  it('clears the draft on message.saved but keeps tool outcomes', () => {
    const s = run([
      [{ type: 'text.delta', text: 'Done' }, '1'],
      [{ type: 'tool.started', callId: 't1', name: 'x', label: 'L' }, '2'],
      [
        {
          type: 'message.saved',
          message: message({ id: 'm2', seq: 2, role: 'ASSISTANT', blocks: [{ type: 'text', text: 'Done' }] }),
        },
        '3',
      ],
    ]);
    expect(s.segments).toEqual([]);
    expect(s.tools.t1).toBeDefined();
  });

  it('records a pending action once', () => {
    const s = run([
      [{ type: 'action.pending', action }, '1'],
      [{ type: 'action.pending', action }, '2'],
    ]);
    expect(s.segments).toEqual([{ kind: 'action', actionId: 'a1' }]);
    expect(s.actions.a1.status).toBe('PENDING');
  });

  it('maps terminal events to phases and ignores anything after', () => {
    const awaiting = run([
      [{ type: 'run.completed', status: 'AWAITING_CONFIRMATION', usage: { inputTokens: 1, outputTokens: 2 } }, '1'],
      [{ type: 'text.delta', text: 'late' }, '2'],
    ]);
    expect(awaiting.phase).toBe('awaiting_confirmation');
    expect(awaiting.segments).toEqual([]);

    const failed = run([[{ type: 'run.failed', code: 'TIMEOUT', message: null }, '1']]);
    expect(failed.phase).toBe('failed');
    expect(failed.error).toEqual({ code: 'TIMEOUT', message: null });

    expect(run([[{ type: 'run.cancelled' }, '1']]).phase).toBe('cancelled');
  });

  it('actionHandled ends AWAITING_CONFIRMATION once no action is pending', () => {
    const awaiting = run([
      [{ type: 'action.pending', action }, '1'],
      [{ type: 'run.completed', status: 'AWAITING_CONFIRMATION', usage: { inputTokens: 1, outputTokens: 2 } }, '2'],
    ]);
    expect(awaiting.phase).toBe('awaiting_confirmation');
    const rejected = agentRunReducer(awaiting, { type: 'actionHandled', action: { ...action, status: 'REJECTED' } });
    expect(rejected.phase).toBe('completed');
    expect(rejected.actions.a1.status).toBe('REJECTED');
    expect(rejected.segments).toEqual([]);

    // Another action of the same run still waits: stay paused.
    const two = run([[{ type: 'action.pending', action: { ...action, id: 'a2' } }, '3']], {
      ...awaiting,
      phase: 'streaming',
    });
    const paused = { ...two, phase: 'awaiting_confirmation' as const };
    expect(agentRunReducer(paused, { type: 'actionHandled', action: { ...action, status: 'REJECTED' } }).phase).toBe(
      'awaiting_confirmation',
    );
  });

  it('settled clears the draft only for a terminal run', () => {
    const streaming = run([[{ type: 'text.delta', text: 'x' }, '1']]);
    expect(agentRunReducer(streaming, { type: 'settled' }).segments).toHaveLength(1);
    const done = run([[{ type: 'run.cancelled' }, '2']], streaming);
    expect(agentRunReducer(done, { type: 'settled' }).segments).toEqual([]);
  });

  it('connectionFailed fails a live run but not a finished one', () => {
    const live = createRunState('r1', 'c1');
    expect(agentRunReducer(live, { type: 'connectionFailed', code: 'INTERNAL', message: null }).phase).toBe('failed');
    const done = run([[{ type: 'run.completed', status: 'COMPLETED', usage: { inputTokens: 0, outputTokens: 0 } }, '1']]);
    expect(agentRunReducer(done, { type: 'connectionFailed', code: 'INTERNAL', message: null }).phase).toBe('completed');
  });

  it('run.queued then run.started: queue position updates, then streams', () => {
    const queued = run([
      [{ type: 'run.queued', runId: 'r1', chatId: 'c1', position: 3 }, '1'],
      [{ type: 'run.queued', runId: 'r1', chatId: 'c1', position: 1 }, '2'],
    ]);
    expect(queued.phase).toBe('queued');
    expect(queued.queuePosition).toBe(1);
    expect(queued.segments).toEqual([]);

    const started = run(
      [
        [{ type: 'run.started', runId: 'r1', chatId: 'c1' }, '3'],
        [{ type: 'text.delta', text: 'Hi' }, '4'],
      ],
      queued,
    );
    expect(started.phase).toBe('streaming');
    expect(started.queuePosition).toBeNull();
    expect(started.segments).toEqual([{ kind: 'text', text: 'Hi' }]);
    expect(started.lastEventId).toBe('4');
  });

  it('ignores a late run.queued once the run has started', () => {
    const s = run([
      [{ type: 'run.started', runId: 'r1', chatId: 'c1' }, '1'],
      [{ type: 'run.queued', runId: 'r1', chatId: 'c1', position: 2 }, '2'],
    ]);
    expect(s.phase).toBe('streaming');
    expect(s.queuePosition).toBeNull();
  });

  it('connected leaves the phase for the first event to decide', () => {
    const s = agentRunReducer(createRunState('r1', 'c1'), { type: 'connected' });
    expect(s.phase).toBe('connecting');
  });

  it('a queued run has no timeline items of its own', () => {
    const s = run([[{ type: 'run.queued', runId: 'r1', chatId: 'c1', position: 2 }, '1']]);
    const user = message({ id: 'u1', seq: 1, role: 'USER', blocks: [{ type: 'text', text: 'Hi' }] });
    expect(buildAgentTimeline([user], [], s).map((i) => i.kind)).toEqual(['user']);
  });
});

describe('isEventIdAtOrBefore', () => {
  it('compares integer and redis-style ids numerically', () => {
    expect(isEventIdAtOrBefore('9', '10')).toBe(true);
    expect(isEventIdAtOrBefore('10', '9')).toBe(false);
    expect(isEventIdAtOrBefore('5', '5')).toBe(true);
    expect(isEventIdAtOrBefore('1727712345678-2', '1727712345678-10')).toBe(true);
    expect(isEventIdAtOrBefore('1727712345679-0', '1727712345678-10')).toBe(false);
  });

  it('falls back to equality for opaque ids', () => {
    expect(isEventIdAtOrBefore('abc', 'abc')).toBe(true);
    expect(isEventIdAtOrBefore('abd', 'abc')).toBe(false);
  });
});

describe('buildAgentTimeline', () => {
  it('joins a persisted tool_call with its later tool_result and does not repeat live content', () => {
    const messages = [
      message({ id: 'm1', seq: 1, role: 'USER', blocks: [{ type: 'text', text: 'My games?' }] }),
      message({
        id: 'm2',
        seq: 2,
        role: 'ASSISTANT',
        blocks: [{ type: 'tool_call', callId: 't1', name: 'list_my_games', label: 'Looking up your games' }],
      }),
      message({
        id: 'm3',
        seq: 3,
        role: 'TOOL',
        blocks: [{ type: 'tool_result', callId: 't1', ok: true, summary: 'Found 1 game', entities: [game] }],
      }),
    ];
    const live = run([
      [{ type: 'tool.started', callId: 't1', name: 'list_my_games', label: 'Looking up your games' }, '1'],
      [{ type: 'text.delta', text: 'You have ' }, '2'],
    ]);
    const items = buildAgentTimeline(messages, [], live);
    expect(items.map((i) => i.kind)).toEqual(['user', 'tool', 'assistantText']);
    const tool = items[1];
    expect(tool.kind === 'tool' && tool.tool).toMatchObject({ status: 'ok', summary: 'Found 1 game', entities: [game] });
    const text = items[2];
    expect(text.kind === 'assistantText' && text.streaming).toBe(true);
  });

  it('renders an action once, preferring the persisted block and cached dto', () => {
    const messages = [
      message({ id: 'm2', seq: 2, role: 'ASSISTANT', blocks: [{ type: 'action', actionId: 'a1' }] }),
    ];
    const live = run([[{ type: 'action.pending', action }, '1']]);
    const executed = { ...action, status: 'EXECUTED' as const };
    const items = buildAgentTimeline(messages, [executed], live);
    expect(items).toHaveLength(1);
    expect(items[0].kind === 'action' && items[0].action?.status).toBe('EXECUTED');
  });
});
