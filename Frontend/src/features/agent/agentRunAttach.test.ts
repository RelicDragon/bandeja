import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMessageDto, AgentStreamEvent } from '@shared/agentContract';
import { agentRunIdToAttach, attachAgentRun, type AgentRunAttachDeps } from './agentRunAttach';
import { resetAgentRunStore, useAgentRunStore } from './agentRunStore';
import { buildAgentTimeline } from './agentTimeline';

const RUN = 'r1';
const CHAT = 'c1';

const userMessage: AgentMessageDto = {
  id: 'm-user',
  chatId: CHAT,
  seq: 1,
  role: 'USER',
  blocks: [{ type: 'text', text: 'What games do I have?' }],
  runId: null,
  createdAt: '2026-10-01T17:00:00.000Z',
};

const savedAssistant: AgentMessageDto = {
  id: 'm-a1',
  chatId: CHAT,
  seq: 2,
  role: 'ASSISTANT',
  blocks: [
    { type: 'text', text: 'Let me check.' },
    { type: 'tool_call', callId: 't1', name: 'list_my_games', label: 'Looking up your games' },
  ],
  runId: RUN,
  createdAt: '2026-10-01T17:00:01.000Z',
};

const savedTool: AgentMessageDto = {
  id: 'm-t1',
  chatId: CHAT,
  seq: 3,
  role: 'TOOL',
  blocks: [{ type: 'tool_result', callId: 't1', ok: true, summary: 'Found 1 game' }],
  runId: RUN,
  createdAt: '2026-10-01T17:00:02.000Z',
};

/** The whole run so far, as the server would replay it from the start. */
const RUN_EVENTS: Array<[string, AgentStreamEvent]> = [
  ['1', { type: 'run.queued', runId: RUN, chatId: CHAT, position: 2 }],
  ['2', { type: 'run.queued', runId: RUN, chatId: CHAT, position: 1 }],
  ['3', { type: 'run.started', runId: RUN, chatId: CHAT }],
  ['4', { type: 'text.delta', text: 'Let me ' }],
  ['5', { type: 'text.delta', text: 'check.' }],
  ['6', { type: 'tool.started', callId: 't1', name: 'list_my_games', label: 'Looking up your games' }],
  ['7', { type: 'tool.finished', callId: 't1', ok: true, summary: 'Found 1 game' }],
  ['8', { type: 'message.saved', message: savedAssistant }],
  ['9', { type: 'message.saved', message: savedTool }],
  ['10', { type: 'text.delta', text: 'You have ' }],
  ['11', { type: 'text.delta', text: 'one game.' }],
];

function sseBody(events: Array<[string, AgentStreamEvent]>): string {
  return events.map(([id, e]) => `id: ${id}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

/**
 * Fake `/events` endpoint: serves the given slice of events, then keeps the connection open
 * (the run is still going) until the client aborts it.
 */
function fakeServer(slice: (after: string | null) => Array<[string, AgentStreamEvent]>) {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    const after = new URL(url).searchParams.get('after');
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody(slice(after))));
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  });
  return { fetchImpl, urls };
}

function deps(fetchImpl: typeof fetch, extra: Partial<AgentRunAttachDeps> = {}): AgentRunAttachDeps {
  return {
    fetch: fetchImpl,
    apiBaseUrl: () => 'https://api.test/api',
    headers: () => ({}),
    native: false,
    refreshToken: async () => null,
    ...extra,
  };
}

/** The chat detail after the `message.saved` events (what a refetch returns). */
function persisted(lastEventId: string): AgentMessageDto[] {
  const n = Number(lastEventId);
  return [userMessage, ...(n >= 8 ? [savedAssistant] : []), ...(n >= 9 ? [savedTool] : [])];
}

const runState = () => useAgentRunStore.getState().runs[RUN];

describe('attachAgentRun', () => {
  beforeEach(() => resetAgentRunStore());
  afterEach(() => resetAgentRunStore());

  it('re-attaches after unmount + reload with a full replay and no duplicated text or chips', async () => {
    const first = fakeServer(() => RUN_EVENTS.slice(0, 5));
    const a = attachAgentRun(RUN, CHAT, deps(first.fetchImpl));
    await vi.waitFor(() => expect(runState()?.lastEventId).toBe('5'));
    expect(runState().phase).toBe('streaming');
    a.detach(); // view unmounted

    // State kept after unmount…
    expect(runState().segments).toEqual([{ kind: 'text', text: 'Let me check.' }]);
    // …but a page reload loses it.
    resetAgentRunStore();

    const second = fakeServer((after) => (after ? RUN_EVENTS.filter(([id]) => Number(id) > Number(after)) : RUN_EVENTS));
    const b = attachAgentRun(RUN, CHAT, deps(second.fetchImpl));
    await vi.waitFor(() => expect(runState()?.lastEventId).toBe('11'));
    b.detach();

    expect(second.urls).toHaveLength(1);
    expect(second.urls[0]).not.toContain('after=');

    const live = runState();
    expect(live.phase).toBe('streaming');
    expect(live.queuePosition).toBeNull();
    // Saved content left the draft; only the unsaved tail remains.
    expect(live.segments).toEqual([{ kind: 'text', text: 'You have one game.' }]);

    const timeline = buildAgentTimeline(persisted(live.lastEventId as string), [], live);
    expect(timeline.map((i) => i.kind)).toEqual(['user', 'assistantText', 'tool', 'assistantText']);
    const texts = timeline.flatMap((i) => (i.kind === 'assistantText' ? [i.text] : []));
    expect(texts).toEqual(['Let me check.', 'You have one game.']);
    const tools = timeline.flatMap((i) => (i.kind === 'tool' ? [i.tool] : []));
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ callId: 't1', status: 'ok', summary: 'Found 1 game' });
  });

  it('re-attaches with the stored state: resumes after the last event id, overlap is ignored', async () => {
    const first = fakeServer(() => RUN_EVENTS.slice(0, 6));
    const a = attachAgentRun(RUN, CHAT, deps(first.fetchImpl));
    await vi.waitFor(() => expect(runState()?.lastEventId).toBe('6'));
    a.detach();

    // Server overlaps the resume point by two events.
    const second = fakeServer((after) => RUN_EVENTS.filter(([id]) => Number(id) > Number(after) - 2).slice(0, 3));
    const b = attachAgentRun(RUN, CHAT, deps(second.fetchImpl));
    await vi.waitFor(() => expect(runState()?.lastEventId).toBe('7'));
    b.detach();

    expect(second.urls[0]).toContain('after=6');
    const live = runState();
    expect(live.segments).toEqual([
      { kind: 'text', text: 'Let me check.' },
      { kind: 'tool', callId: 't1' },
    ]);
    expect(live.tools.t1.status).toBe('ok');
  });

  it('shows the queue position while queued', async () => {
    const server = fakeServer(() => RUN_EVENTS.slice(0, 2));
    const a = attachAgentRun(RUN, CHAT, deps(server.fetchImpl));
    await vi.waitFor(() => expect(runState()?.lastEventId).toBe('2'));
    a.detach();
    expect(runState()).toMatchObject({ phase: 'queued', queuePosition: 1, segments: [] });
  });

  it('settles and calls onTerminal on run.cancelled (e.g. Stop while queued)', async () => {
    const onTerminal = vi.fn();
    const server = fakeServer(() => [RUN_EVENTS[0], ['12', { type: 'run.cancelled' }]]);
    const a = attachAgentRun(RUN, CHAT, deps(server.fetchImpl, { onTerminal }));
    await a.done;
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(runState().phase).toBe('cancelled');
  });

  it('a refused attach does not stick: the next attach replays from the start', async () => {
    const onRefused = vi.fn();
    const refused = vi.fn(async () => new Response(null, { status: 404 }));
    const a = attachAgentRun(RUN, CHAT, deps(refused, { onRefused }));
    await a.done;
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(runState()).toMatchObject({ phase: 'failed', connectionFailed: true });

    const server = fakeServer(() => RUN_EVENTS.slice(0, 3));
    const b = attachAgentRun(RUN, CHAT, deps(server.fetchImpl));
    await vi.waitFor(() => expect(runState()?.lastEventId).toBe('3'));
    b.detach();
    expect(server.urls[0]).not.toContain('after=');
    expect(runState()).toMatchObject({ phase: 'streaming', connectionFailed: false, error: null });
  });

  it('reconciles a run the server ended while attached: re-attaches and shows the failure', async () => {
    const first = fakeServer(() => RUN_EVENTS.slice(0, 5));
    const a = attachAgentRun(RUN, CHAT, deps(first.fetchImpl));
    await vi.waitFor(() => expect(runState()?.lastEventId).toBe('5'));
    a.detach(); // the chat refetch said `activeRun: null` before `run.failed` arrived

    // No live run on the server, but the stored state never saw a terminal event: keep watching.
    expect(agentRunIdToAttach({ liveServerRunId: null, lastRunId: RUN, storedRun: runState() })).toBe(RUN);

    // Finished run: the replay ends with the terminal event (ids rebuilt from the DB are higher).
    const onTerminal = vi.fn();
    const second = fakeServer(() => [
      ['8000000000000001', { type: 'run.failed', code: 'INTERNAL', message: 'The run was interrupted' }],
    ]);
    const b = attachAgentRun(RUN, CHAT, deps(second.fetchImpl, { onTerminal }));
    await b.done;
    expect(second.urls[0]).toContain('after=5');
    expect(onTerminal).toHaveBeenCalledTimes(1);
    expect(runState()).toMatchObject({
      phase: 'failed',
      connectionFailed: false,
      error: { code: 'INTERNAL', message: 'The run was interrupted' },
    });
    // Terminal now: attaching again is a no-op, so the view may keep the id.
    const noop = fakeServer(() => []);
    await attachAgentRun(RUN, CHAT, deps(noop.fetchImpl)).done;
    expect(noop.urls).toHaveLength(0);
  });
});

describe('agentRunIdToAttach', () => {
  beforeEach(() => resetAgentRunStore());

  it('prefers the live server run, else the last watched run, never a refused one', () => {
    const stored = useAgentRunStore.getState().ensureRun(RUN, CHAT);
    expect(agentRunIdToAttach({ liveServerRunId: 'r2', lastRunId: RUN, storedRun: stored })).toBe('r2');
    expect(agentRunIdToAttach({ liveServerRunId: null, lastRunId: null, storedRun: null })).toBeNull();
    expect(agentRunIdToAttach({ liveServerRunId: null, lastRunId: RUN, storedRun: null })).toBeNull();
    expect(
      agentRunIdToAttach({ liveServerRunId: null, lastRunId: RUN, storedRun: { ...stored, runId: 'other' } }),
    ).toBeNull();
    expect(
      agentRunIdToAttach({
        liveServerRunId: null,
        lastRunId: RUN,
        storedRun: { ...stored, phase: 'failed', connectionFailed: true },
      }),
    ).toBeNull();
  });
});
