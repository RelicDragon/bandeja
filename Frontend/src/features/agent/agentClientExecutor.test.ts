import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentClientClaimResponse,
  AgentClientPlan,
  AgentClientReportRequest,
  AgentPendingActionDto,
} from '@shared/agentContract';
import type { Club } from '@/types';
import type { ClubBookingProvider } from '@/integrations/booking/ClubBookingProvider';
import { createAgentClientAttemptStorage, getAgentClientKey } from './agentClientAttemptStore';
import {
  resumeAgentClientAttempts,
  runAgentClientAction,
  type AgentClientExecutorDeps,
} from './agentClientExecutor';
import { agentClientActionButtons, agentClientOperationForTool } from './agentActionButtons';

const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() }));
vi.mock('@/api/axios', () => ({ default: http }));
const { agentApi } = await import('@/api/agent');

const NOW = Date.parse('2026-10-01T10:00:00Z');
const LEASE = '2026-10-01T10:03:00Z';

function memoryBacking() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

const bookPlan = (courts = 2): AgentClientPlan => ({
  provider: 'BOOKTIME',
  clubId: 'club-1',
  courts: Array.from({ length: courts }, (_, i) => ({ courtId: `c${i + 1}`, externalCourtId: `ext-c${i + 1}` })),
  date: '2026-10-02',
  start: '18:00',
  durationMinutes: 90,
  operation: 'book',
  bookings: [],
  postStep: { kind: 'create_game', gameId: null },
});

const cancelPlan = (): AgentClientPlan => ({
  ...bookPlan(0),
  operation: 'cancel',
  bookings: [
    { bookingRef: 'geb:1', externalBookingId: 'bk-1', courtId: 'c1' },
    { bookingRef: 'geb:2', externalBookingId: 'bk-2', courtId: 'c2' },
  ],
  postStep: { kind: 'unlink_game', gameId: 'g1' },
});

const action = (over: Partial<AgentPendingActionDto> = {}): AgentPendingActionDto => ({
  id: 'a1',
  chatId: 'chat-1',
  runId: 'run-1',
  toolName: 'book_court',
  status: 'CONFIRMED',
  preview: { title: 'Book', lines: [], warnings: [] },
  expiresAt: LEASE,
  result: null,
  createdAt: LEASE,
  autoApproved: false,
  riskTier: 'critical',
  canAlwaysAllow: false,
  execution: 'client',
  ...over,
});

function apiError(status: number, code: string) {
  return Object.assign(new Error(code), { response: { status, data: { code } } });
}

function setup(plan: AgentClientPlan, opts: { attemptId?: string | null; lease?: string } = {}) {
  const backing = memoryBacking();
  const storage = createAgentClientAttemptStorage(backing, () => NOW);
  const provider = {
    bookSlot: vi.fn(async (params: { courtId: string }) => ({
      externalBookingId: `bk-${params.courtId}`,
      bookingStart: '',
      bookingEnd: '',
      price: 30,
    })),
    cancelBooking: vi.fn(async () => undefined),
    listUpcoming: vi.fn(),
    fetchSnapshotCourts: vi.fn(),
  };
  const reports: AgentClientReportRequest[] = [];
  const claimResponse = (): AgentClientClaimResponse => ({
    action: action(),
    attemptId: opts.attemptId === undefined ? 'att-1' : opts.attemptId,
    clientPlan: opts.attemptId === null ? null : plan,
    leaseExpiresAt: opts.lease ?? LEASE,
    runId: null,
  });
  const deps: AgentClientExecutorDeps = {
    claim: vi.fn(async () => claimResponse()),
    report: vi.fn(async (_id: string, body: AgentClientReportRequest) => {
      reports.push(body);
      const ok = body.results.filter((r) => r.ok).length;
      return {
        action: action({
          status: ok ? 'EXECUTED' : 'FAILED',
          result: { ok: ok > 0, message: null, partial: ok > 0 && ok < body.results.length },
        }),
        runId: 'run-2',
      };
    }),
    loadClub: vi.fn(async () => ({ id: 'club-1', courts: [] }) as unknown as Club),
    createProvider: vi.fn(async () => provider as unknown as ClubBookingProvider),
    isConnected: vi.fn(async () => true),
    storage,
    clientKey: () => 'device-key-1',
    now: () => NOW,
    bookingsChanged: vi.fn(async () => {}),
  };
  return { deps, provider, reports, storage };
}

describe('runAgentClientAction', () => {
  it('happy path: claims, books every court, reports each result and clears the attempt', async () => {
    const { deps, provider, reports, storage } = setup(bookPlan(2));
    const progress: string[] = [];
    const res = await runAgentClientAction(
      { actionId: 'a1', chatId: 'chat-1', onProgress: (p) => progress.push(p.kind === 'writing' ? `w${p.index + 1}/${p.total}` : p.kind) },
      deps,
    );
    expect(deps.claim).toHaveBeenCalledWith('a1', 'device-key-1');
    expect(provider.bookSlot).toHaveBeenCalledTimes(2);
    expect(provider.bookSlot.mock.calls[0][0]).toMatchObject({ courtId: 'c1', externalCourtId: 'ext-c1', dateKey: '2026-10-02', startTime: '18:00', durationMinutes: 90 });
    expect(reports).toHaveLength(1);
    expect(reports[0].attemptId).toBe('att-1');
    expect(reports[0].results).toEqual([
      expect.objectContaining({ provider: 'BOOKTIME', courtId: 'c1', ok: true, externalBookingId: 'bk-c1', bookingRef: null, price: 30 }),
      expect.objectContaining({ courtId: 'c2', ok: true, externalBookingId: 'bk-c2' }),
    ]);
    expect(progress).toEqual(['claiming', 'rechecking', 'w1/2', 'w2/2', 'saving']);
    expect(res).toMatchObject({ kind: 'reported', runId: 'run-2', notConnected: false });
    expect(storage.list()).toEqual([]);
    expect(deps.bookingsChanged).toHaveBeenCalledTimes(1);
  });

  it('partial: stops booking at the first failure and reports the rest as skipped', async () => {
    const { deps, provider, reports } = setup(bookPlan(3));
    provider.bookSlot
      .mockResolvedValueOnce({ externalBookingId: 'bk-c1', bookingStart: '', bookingEnd: '', price: 30 })
      .mockRejectedValueOnce({ code: 'SlotTaken', message: 'taken' });
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps);
    expect(provider.bookSlot).toHaveBeenCalledTimes(2);
    expect(reports[0].results.map((r) => [r.courtId, r.ok, r.error ?? null])).toEqual([
      ['c1', true, null],
      ['c2', false, 'SlotTaken: taken'],
      ['c3', false, 'skipped'],
    ]);
    expect(res.kind === 'reported' && res.action.result?.partial).toBe(true);
  });

  it('report rejected (400) after booking: "Try again" within the lease never books again', async () => {
    const { deps, provider } = setup(bookPlan(2));
    (deps.report as ReturnType<typeof vi.fn>).mockRejectedValueOnce(apiError(400, 'bad_report'));
    await expect(runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps)).rejects.toBeTruthy();
    expect(provider.bookSlot).toHaveBeenCalledTimes(2);
    // The re-claim returns the same attempt: it must stop, not run the provider calls again.
    const again = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps);
    expect(again).toEqual({ kind: 'interrupted' });
    expect(provider.bookSlot).toHaveBeenCalledTimes(2);
  });

  it('all failed (cancel): every booking is tried, all reported failed', async () => {
    const { deps, provider, reports } = setup(cancelPlan());
    provider.cancelBooking.mockRejectedValue(new Error('boom'));
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps);
    expect(provider.cancelBooking).toHaveBeenCalledTimes(2);
    expect(reports[0].results).toEqual([
      expect.objectContaining({ bookingRef: 'geb:1', externalBookingId: 'bk-1', ok: false, error: 'boom' }),
      expect.objectContaining({ bookingRef: 'geb:2', externalBookingId: 'bk-2', ok: false, error: 'boom' }),
    ]);
    expect(res.kind === 'reported' && res.action.status).toBe('FAILED');
    expect(deps.bookingsChanged).not.toHaveBeenCalled();
  });

  it('lease expired before start: no provider call, all reported failed', async () => {
    const { deps, provider, reports } = setup(bookPlan(2), { lease: '2026-10-01T10:00:05Z' });
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps);
    expect(deps.loadClub).not.toHaveBeenCalled();
    expect(provider.bookSlot).not.toHaveBeenCalled();
    expect(reports[0].results.every((r) => !r.ok && r.error === 'lease_expired')).toBe(true);
    expect(res).toMatchObject({ kind: 'reported', leaseExpired: true });
  });

  it('not connected: no provider call, reported failed, flagged for the Connected clubs hand-off', async () => {
    const { deps, provider, reports } = setup(bookPlan(1));
    deps.isConnected = vi.fn(async () => false);
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps);
    expect(provider.bookSlot).not.toHaveBeenCalled();
    expect(reports[0].results[0]).toMatchObject({ ok: false, error: 'not_connected' });
    expect(res).toMatchObject({ kind: 'reported', notConnected: true });
  });

  it('ACTION_HANDLED on claim: nothing runs', async () => {
    const { deps, provider } = setup(bookPlan(1));
    deps.claim = vi.fn(async () => {
      throw apiError(409, 'ACTION_HANDLED');
    });
    await expect(runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps)).resolves.toEqual({ kind: 'handled' });
    expect(provider.bookSlot).not.toHaveBeenCalled();
  });

  it('claim without an attempt (lost rights): returns the settled action, nothing runs', async () => {
    const { deps, provider } = setup(bookPlan(1), { attemptId: null });
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps);
    expect(res.kind).toBe('not_claimed');
    expect(provider.bookSlot).not.toHaveBeenCalled();
  });

  it('price quote: waits for the extra tap; declining books nothing', async () => {
    const { deps, provider, reports } = setup(bookPlan(2));
    const quoting = provider as typeof provider & { quoteSlot: ReturnType<typeof vi.fn> };
    quoting.quoteSlot = vi.fn(async () => ({ price: 25, currency: 'EUR' }));
    const confirmPrice = vi.fn(async () => false);
    await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1', confirmPrice }, deps);
    expect(confirmPrice).toHaveBeenCalledWith({ total: 50, currency: 'EUR' });
    expect(provider.bookSlot).not.toHaveBeenCalled();
    expect(reports[0].results.every((r) => r.error === 'price_declined')).toBe(true);
  });
});

describe('crash / resume', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup(bookPlan(2));
  });

  it('report lost after the provider calls: resume re-reports the same attempt, provider not called again', async () => {
    ctx.deps.report = vi.fn(async () => {
      throw new Error('Network Error');
    });
    const first = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, ctx.deps);
    expect(first).toEqual({ kind: 'report_pending' });
    expect(ctx.provider.bookSlot).toHaveBeenCalledTimes(2);
    expect(ctx.storage.get('a1')).toMatchObject({ phase: 'ran', attemptId: 'att-1' });

    const reports: AgentClientReportRequest[] = [];
    ctx.deps.report = vi.fn(async (_id: string, body: AgentClientReportRequest) => {
      reports.push(body);
      return { action: action({ status: 'EXECUTED' }), runId: 'run-2' };
    });
    const resumed = await resumeAgentClientAttempts(ctx.deps);
    expect(resumed).toEqual([{ chatId: 'chat-1', result: expect.objectContaining({ kind: 'reported' }) }]);
    expect(reports[0]).toMatchObject({ attemptId: 'att-1' });
    expect(reports[0].results.filter((r) => r.ok)).toHaveLength(2);
    expect(ctx.provider.bookSlot).toHaveBeenCalledTimes(2);
    expect(ctx.storage.list()).toEqual([]);
  });

  it('re-tap after a lost report (same attempt): only re-reports', async () => {
    ctx.deps.report = vi.fn(async () => {
      throw new Error('Network Error');
    });
    await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, ctx.deps);
    ctx.deps.report = vi.fn(async () => ({ action: action({ status: 'EXECUTED' }), runId: null }));
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, ctx.deps);
    expect(res.kind).toBe('reported');
    expect(ctx.provider.bookSlot).toHaveBeenCalledTimes(2);
  });

  it('died mid-call after one success: resume reports the finished call only; a re-tap never repeats a call', async () => {
    ctx.storage.put({
      actionId: 'a1',
      chatId: 'chat-1',
      attemptId: 'att-1',
      leaseExpiresAt: LEASE,
      plan: bookPlan(2),
      phase: 'running',
      inFlight: 1,
      results: [
        { provider: 'BOOKTIME', courtId: 'c1', date: '2026-10-02', start: '18:00', durationMinutes: 90, ok: true, externalBookingId: 'bk-c1', bookingRef: null },
      ],
      updatedAt: NOW,
    });
    const tap = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, ctx.deps);
    expect(ctx.provider.bookSlot).not.toHaveBeenCalled();
    expect(tap.kind).toBe('reported');
    expect(ctx.reports[0].results).toHaveLength(1);
  });

  it('died mid-call with no success: never reported, never re-run (lease sweep → UNKNOWN)', async () => {
    ctx.storage.put({
      actionId: 'a1',
      chatId: 'chat-1',
      attemptId: 'att-1',
      leaseExpiresAt: LEASE,
      plan: bookPlan(2),
      phase: 'running',
      inFlight: 0,
      results: [],
      updatedAt: NOW,
    });
    expect(await resumeAgentClientAttempts(ctx.deps)).toEqual([]);
    expect(ctx.storage.get('a1')?.phase).toBe('abandoned');
    const tap = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, ctx.deps);
    expect(tap).toEqual({ kind: 'interrupted' });
    expect(ctx.provider.bookSlot).not.toHaveBeenCalled();
    expect(ctx.deps.report).not.toHaveBeenCalled();
  });

  it('died after the claim, before any call: resume reports nothing done (FAILED)', async () => {
    ctx.storage.put({
      actionId: 'a1',
      chatId: 'chat-1',
      attemptId: 'att-1',
      leaseExpiresAt: LEASE,
      plan: bookPlan(2),
      phase: 'claimed',
      inFlight: null,
      results: [],
      updatedAt: NOW,
    });
    await resumeAgentClientAttempts(ctx.deps);
    expect(ctx.reports[0].results.map((r) => [r.ok, r.error])).toEqual([
      [false, 'interrupted'],
      [false, 'interrupted'],
    ]);
  });

  it('late report answered ACTION_HANDLED: dropped locally', async () => {
    ctx.storage.put({
      actionId: 'a1',
      chatId: 'chat-1',
      attemptId: 'att-old',
      leaseExpiresAt: LEASE,
      plan: bookPlan(1),
      phase: 'ran',
      inFlight: null,
      results: [],
      updatedAt: NOW,
    });
    ctx.deps.report = vi.fn(async () => {
      throw apiError(409, 'ACTION_HANDLED');
    });
    const out = await resumeAgentClientAttempts(ctx.deps);
    expect(out).toEqual([{ chatId: 'chat-1', result: { kind: 'handled' } }]);
    expect(ctx.storage.list()).toEqual([]);
  });
});

describe('client key', () => {
  it('is stable per device', () => {
    const backing = memoryBacking();
    const a = getAgentClientKey(backing);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(getAgentClientKey(backing)).toBe(a);
  });
});

describe('agent API sends the client caps header', () => {
  const caps = { headers: { 'X-Agent-Client-Caps': 'booking-v1' } };
  beforeEach(() => {
    http.post.mockReset();
    http.get.mockReset();
    http.post.mockResolvedValue({ data: { data: {} } });
    http.get.mockResolvedValue({ data: { data: { chats: [] } } });
  });

  it('on messages, claim and report', async () => {
    await agentApi.sendMessage('chat-1', 'hi');
    expect(http.post).toHaveBeenCalledWith('/agent/chats/chat-1/messages', { text: 'hi' }, caps);
    await agentApi.claimAction('a1', 'device-key-1');
    expect(http.post).toHaveBeenCalledWith('/agent/actions/a1/claim', { clientKey: 'device-key-1' }, caps);
    await agentApi.reportAction('a1', { attemptId: 'att-1', results: [] });
    expect(http.post).toHaveBeenCalledWith('/agent/actions/a1/report', { attemptId: 'att-1', results: [] }, caps);
    await agentApi.listChats();
    expect(http.get).toHaveBeenCalledWith('/agent/chats', caps);
  });
});

describe('client action card buttons', () => {
  it('matrix', () => {
    const pending = { status: 'PENDING' as const, toolName: 'book_court' };
    expect(agentClientActionButtons(pending, null)).toEqual({ reject: true, run: 'book', retry: false, alwaysAllow: false });
    expect(agentClientActionButtons({ ...pending, toolName: 'cancel_booking' }, null).run).toBe('cancel');
    expect(agentClientActionButtons(pending, 'progress')).toMatchObject({ reject: false, run: null });
    expect(agentClientActionButtons(pending, 'price')).toMatchObject({ reject: false, run: null });
    expect(agentClientActionButtons(pending, 'error')).toMatchObject({ reject: true, run: 'book', retry: true });
    expect(agentClientActionButtons({ ...pending, status: 'CONFIRMED' }, null)).toMatchObject({ run: null });
    expect(agentClientActionButtons({ ...pending, status: 'CONFIRMED' }, 'report_pending')).toMatchObject({ reject: false, run: 'book', retry: true });
    for (const status of ['EXECUTED', 'FAILED', 'UNKNOWN', 'REJECTED', 'EXPIRED'] as const) {
      expect(agentClientActionButtons({ ...pending, status }, null)).toMatchObject({ reject: false, run: null });
    }
    expect(agentClientOperationForTool('cancel_game')).toBe('cancel');
    expect(agentClientOperationForTool('create_game_with_booking')).toBe('book');
  });
});

describe('rollback on partial (booking plan §14.6)', () => {
  const rollbackPlan = (courts = 3): AgentClientPlan => ({ ...bookPlan(courts), rollbackOnPartial: true });
  const booked = (courtId: string, over: Partial<AgentClientReportRequest['results'][number]> = {}) => ({
    provider: 'BOOKTIME' as const,
    courtId,
    date: '2026-10-02',
    start: '18:00',
    durationMinutes: 90,
    ok: true,
    externalBookingId: `bk-${courtId}`,
    bookingRef: null,
    ...over,
  });

  it('a later court fails: the booked ones are cancelled again and reported rolledBack', async () => {
    const { deps, provider, reports, storage } = setup(rollbackPlan(3));
    provider.bookSlot
      .mockResolvedValueOnce({ externalBookingId: 'bk-c1', bookingStart: '', bookingEnd: '', price: 30 })
      .mockRejectedValueOnce({ code: 'SlotTaken', message: 'taken' });
    const progress: string[] = [];
    await runAgentClientAction(
      { actionId: 'a1', chatId: 'chat-1', onProgress: (p) => progress.push(p.kind === 'writing' ? `${p.operation}${p.index + 1}/${p.total}` : p.kind) },
      deps,
    );
    expect(provider.bookSlot).toHaveBeenCalledTimes(2);
    expect(provider.cancelBooking).toHaveBeenCalledTimes(1);
    expect(provider.cancelBooking.mock.calls[0][0]).toBe('bk-c1');
    expect(reports[0].results.map((r) => [r.courtId, r.ok, r.rolledBack ?? null])).toEqual([
      ['c1', true, true],
      ['c2', false, null],
      ['c3', false, null],
    ]);
    expect(progress).toEqual(['claiming', 'rechecking', 'book1/3', 'book2/3', 'cancel1/1', 'saving']);
    expect(storage.list()).toEqual([]);
  });

  it('no rollback when every court is booked, or without rollbackOnPartial', async () => {
    const all = setup(rollbackPlan(2));
    await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, all.deps);
    expect(all.provider.cancelBooking).not.toHaveBeenCalled();
    expect(all.reports[0].results.every((r) => r.rolledBack === undefined)).toBe(true);

    const legacy = setup(bookPlan(2));
    legacy.provider.bookSlot
      .mockResolvedValueOnce({ externalBookingId: 'bk-c1', bookingStart: '', bookingEnd: '', price: 30 })
      .mockRejectedValueOnce({ code: 'SlotTaken', message: 'taken' });
    await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, legacy.deps);
    expect(legacy.provider.cancelBooking).not.toHaveBeenCalled();
  });

  it('undo fails: the court is reported rolledBack false (server → UNKNOWN)', async () => {
    const { deps, provider, reports } = setup(rollbackPlan(2));
    provider.bookSlot
      .mockResolvedValueOnce({ externalBookingId: 'bk-c1', bookingStart: '', bookingEnd: '', price: 30 })
      .mockRejectedValueOnce({ code: 'SlotTaken', message: 'taken' });
    provider.cancelBooking.mockRejectedValueOnce({ code: 'CancelFailed', message: 'too late' });
    deps.report = vi.fn(async (_id: string, body: AgentClientReportRequest) => {
      reports.push(body);
      return { action: action({ status: 'UNKNOWN', result: { ok: false, message: 'still booked: Court 1' } }), runId: null };
    });
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, deps);
    expect(reports[0].results[0]).toMatchObject({ courtId: 'c1', ok: true, rolledBack: false, error: 'rollback: CancelFailed: too late' });
    expect(res.kind === 'reported' && res.action.status).toBe('UNKNOWN');
  });

  it('died mid-rollback: resume never repeats the cancel in flight, finishes the rest, then reports', async () => {
    const ctx = setup(rollbackPlan(3));
    ctx.storage.put({
      actionId: 'a1',
      chatId: 'chat-1',
      attemptId: 'att-1',
      leaseExpiresAt: LEASE,
      plan: rollbackPlan(3),
      phase: 'rolling_back',
      inFlight: null,
      rollbackInFlight: 0,
      results: [booked('c1'), booked('c2'), { ...booked('c3'), ok: false, externalBookingId: null, error: 'SlotTaken: taken' }],
      updatedAt: NOW,
    });
    const out = await resumeAgentClientAttempts(ctx.deps);
    expect(out).toEqual([{ chatId: 'chat-1', result: expect.objectContaining({ kind: 'reported' }) }]);
    expect(ctx.provider.bookSlot).not.toHaveBeenCalled();
    expect(ctx.provider.cancelBooking).toHaveBeenCalledTimes(1);
    expect(ctx.provider.cancelBooking.mock.calls[0][0]).toBe('bk-c2');
    expect(ctx.reports[0].results.map((r) => [r.courtId, r.ok, r.rolledBack ?? null, r.error ?? null])).toEqual([
      ['c1', true, false, 'rollback_interrupted'],
      ['c2', true, true, null],
      ['c3', false, null, 'SlotTaken: taken'],
    ]);
    expect(ctx.storage.list()).toEqual([]);
  });

  it('died after the failure was saved but before the rollback started: a re-tap undoes, never books again', async () => {
    const ctx = setup(rollbackPlan(3));
    ctx.storage.put({
      actionId: 'a1',
      chatId: 'chat-1',
      attemptId: 'att-1',
      leaseExpiresAt: LEASE,
      plan: rollbackPlan(3),
      phase: 'running',
      inFlight: null,
      results: [booked('c1'), { ...booked('c2'), ok: false, externalBookingId: null, error: 'SlotTaken: taken' }],
      updatedAt: NOW,
    });
    const res = await runAgentClientAction({ actionId: 'a1', chatId: 'chat-1' }, ctx.deps);
    expect(res.kind).toBe('reported');
    expect(ctx.provider.bookSlot).not.toHaveBeenCalled();
    expect(ctx.provider.cancelBooking.mock.calls.map((c) => c[0])).toEqual(['bk-c1']);
    expect(ctx.reports[0].results.map((r) => [r.courtId, r.rolledBack ?? null])).toEqual([
      ['c1', true],
      ['c2', null],
    ]);
  });
});
