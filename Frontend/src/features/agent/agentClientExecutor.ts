import type {
  AgentClientClaimResponse,
  AgentClientPlan,
  AgentClientReportRequest,
  AgentClientReportResult,
  AgentPendingActionDto,
} from '@shared/agentContract';
import type { ClubIntegrationType } from '@shared/clubIntegration';
import type { Club } from '@/types';
import type { BookSlotContext, BookSlotParams, ClubBookingProvider } from '@/integrations/booking/ClubBookingProvider';
import {
  createAgentClientAttemptStorage,
  getAgentClientKey,
  type AgentClientAttemptStorage,
  type StoredAgentClientAttempt,
} from './agentClientAttemptStore';

/**
 * Client-executed agent actions (booking plan §14.5 (ii), docs/domains/agent.md
 * "Client-executed actions"): claim → run the hydrated provider adapter in the app → report.
 *
 * Invariants:
 * - The attempt is persisted before and after every provider call; a call that was started
 *   for an `attemptId` is never started again (not on retry, not on resume).
 * - No provider call starts once the lease is (about to be) over, except undoing this attempt's
 *   own bookings (rollback): cancelling what we just booked is always safer than leaving it.
 * - `plan.rollbackOnPartial` (booking plan §14.6): when a multi-court booking fails part-way,
 *   the courts already booked are cancelled again and reported with `rolledBack` (true = undone,
 *   false = the undo failed or its outcome is unknown → the server says UNKNOWN).
 * - Results that never reached the server are re-reported on resume with the same attemptId.
 */

/** Providers the app writes to for the agent (§14.5: Nspadel / Weltner are server-side). */
export const AGENT_CLIENT_PROVIDERS: readonly ClubIntegrationType[] = ['BOOKTIME', 'PADELOO', 'KLIKTEREN'];

/** Don't start a provider call with less lease than this left. */
export const AGENT_CLIENT_LEASE_MARGIN_MS = 10_000;

export type AgentClientProgress =
  | { kind: 'claiming' }
  | { kind: 'rechecking' }
  | { kind: 'writing'; index: number; total: number; operation: AgentClientPlan['operation'] }
  | { kind: 'saving' };

export interface AgentClientPriceQuote {
  total: number;
  currency: string | null;
}

/** Optional pre-write quote; today's adapters quote inside `bookSlot`, so this is opt-in per adapter. */
export interface AgentClientQuotingProvider {
  quoteSlot(params: BookSlotParams, selectedDate: Date): Promise<{ price: number | null; currency?: string | null }>;
}

export type AgentClientRunResult =
  /** The server has the report: `action` is the settled state, `runId` the follow-up run. */
  | {
      kind: 'reported';
      action: AgentPendingActionDto;
      runId: string | null;
      notConnected: boolean;
      leaseExpired: boolean;
    }
  /** Claimed (or reported) on another device / by another attempt. */
  | { kind: 'handled' }
  /** Claim gave no attempt (re-authorization failed, or already settled): `action` says why. */
  | { kind: 'not_claimed'; action: AgentPendingActionDto; runId: string | null }
  /** Provider calls done but the report didn't get through; kept locally and re-reported on resume. */
  | { kind: 'report_pending' }
  /**
   * An earlier run of this attempt died mid-call and nothing is known to have succeeded:
   * nothing is reported, the lease sweep makes it UNKNOWN ("check Club bookings").
   */
  | { kind: 'interrupted' };

export interface AgentClientExecutorDeps {
  claim(actionId: string, clientKey: string): Promise<AgentClientClaimResponse>;
  report(actionId: string, body: AgentClientReportRequest): Promise<{ action: AgentPendingActionDto; runId: string | null }>;
  loadClub(clubId: string): Promise<Club>;
  createProvider(club: Club, durationMinutes: number): Promise<ClubBookingProvider | null>;
  isConnected(provider: ClubIntegrationType, clubId: string): Promise<boolean>;
  storage: AgentClientAttemptStorage;
  clientKey(): string;
  now(): number;
}

export interface RunAgentClientActionOptions {
  actionId: string;
  chatId: string;
  onProgress?: (progress: AgentClientProgress) => void;
  /** Called with the adapter's quote before any write; false = stop, nothing booked. */
  confirmPrice?: (quote: AgentClientPriceQuote) => Promise<boolean>;
}

/** Actions executing in this JS session; resume must not report them from under the run. */
const activeActions = new Set<string>();

export function isAgentClientActionRunning(actionId: string): boolean {
  return activeActions.has(actionId);
}

function apiErrorInfo(err: unknown): { status: number | null; code: string | null } {
  const res = (err as { response?: { status?: unknown; data?: { code?: unknown } } } | null)?.response;
  return {
    status: typeof res?.status === 'number' ? res.status : null,
    code: typeof res?.data?.code === 'string' ? res.data.code : null,
  };
}

export function isAgentActionHandledError(err: unknown): boolean {
  const { status, code } = apiErrorInfo(err);
  return status === 409 && code === 'ACTION_HANDLED';
}

function shortError(err: unknown): string {
  const raw =
    err && typeof err === 'object' && 'code' in err && typeof (err as { code: unknown }).code === 'string'
      ? `${(err as { code: string }).code}: ${String((err as { message?: unknown }).message ?? '')}`
      : err instanceof Error
        ? err.message
        : String(err);
  return raw.slice(0, 300) || 'error';
}

function isAuthExpired(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'AuthExpired';
}

function plannedCount(plan: AgentClientPlan): number {
  return plan.operation === 'book' ? plan.courts.length : plan.bookings.length;
}

function baseResult(plan: AgentClientPlan): Pick<AgentClientReportResult, 'provider' | 'date' | 'start' | 'durationMinutes'> {
  return { provider: plan.provider, date: plan.date, start: plan.start, durationMinutes: plan.durationMinutes };
}

/** The report entry for planned call `index` that did not succeed. */
function failedResult(plan: AgentClientPlan, index: number, error: string): AgentClientReportResult {
  if (plan.operation === 'book') {
    const court = plan.courts[index];
    return { ...baseResult(plan), courtId: court.courtId, ok: false, externalBookingId: null, bookingRef: null, error };
  }
  const booking = plan.bookings[index];
  return {
    ...baseResult(plan),
    courtId: booking.courtId,
    ok: false,
    externalBookingId: booking.externalBookingId,
    bookingRef: booking.bookingRef,
    error,
  };
}

function failedFrom(plan: AgentClientPlan, from: number, error: string): AgentClientReportResult[] {
  const out: AgentClientReportResult[] = [];
  for (let i = from; i < plannedCount(plan); i++) out.push(failedResult(plan, i, error));
  return out;
}

/** Club-local plan date as a Date (noon, so no DST / tz edge moves it to another day). */
function planDate(plan: AgentClientPlan): Date {
  return new Date(`${plan.date}T12:00:00`);
}

/** Book + `rollbackOnPartial`: a court failed while others are booked and not yet undone. */
function needsRollback(plan: AgentClientPlan, results: AgentClientReportResult[]): boolean {
  return (
    plan.operation === 'book' &&
    Boolean(plan.rollbackOnPartial) &&
    results.some((r) => !r.ok) &&
    results.some((r) => r.ok && r.rolledBack == null)
  );
}

/** The hydrated adapter for the plan's club, or null (not connected / failed to load). */
async function openProvider(deps: AgentClientExecutorDeps, plan: AgentClientPlan): Promise<ClubBookingProvider | null> {
  try {
    return await deps.createProvider(await deps.loadClub(plan.clubId), plan.durationMinutes);
  } catch {
    return null;
  }
}

/**
 * Cancels the courts this attempt booked (`ok`, no `rolledBack` yet), persisting before and
 * after each cancel. A cancel that was in flight when the app died is never repeated: its
 * outcome is unknown, so it is reported `rolledBack: false` (may still be booked).
 */
async function rollBack(
  deps: AgentClientExecutorDeps,
  attempt: StoredAgentClientAttempt,
  provider: ClubBookingProvider | null,
  opts: Pick<RunAgentClientActionOptions, 'onProgress'>,
): Promise<void> {
  const results = [...attempt.results];
  if (attempt.rollbackInFlight != null) {
    const interrupted = results[attempt.rollbackInFlight];
    if (interrupted?.ok && interrupted.rolledBack == null) {
      results[attempt.rollbackInFlight] = { ...interrupted, rolledBack: false, error: 'rollback_interrupted' };
    }
  }
  attempt.results = results;
  attempt.phase = 'rolling_back';
  attempt.inFlight = null;
  attempt.rollbackInFlight = null;
  deps.storage.put(attempt);

  const pending = results.flatMap((r, i) => (r.ok && r.rolledBack == null ? [i] : []));
  for (const [n, i] of pending.entries()) {
    const booked = results[i];
    if (!provider || !booked.externalBookingId) {
      results[i] = { ...booked, rolledBack: false, error: 'rollback_unavailable' };
      attempt.results = results;
      deps.storage.put(attempt);
      continue;
    }
    attempt.results = results;
    attempt.rollbackInFlight = i;
    deps.storage.put(attempt);
    opts.onProgress?.({ kind: 'writing', index: n, total: pending.length, operation: 'cancel' });
    try {
      await provider.cancelBooking(booked.externalBookingId, NOOP_CONTEXT.refreshSnapshot);
      results[i] = { ...booked, rolledBack: true };
    } catch (err) {
      results[i] = { ...booked, rolledBack: false, error: `rollback: ${shortError(err)}`.slice(0, 300) };
    }
    attempt.results = results;
    attempt.rollbackInFlight = null;
    deps.storage.put(attempt);
  }
}

function isQuoting(provider: ClubBookingProvider): provider is ClubBookingProvider & AgentClientQuotingProvider {
  return typeof (provider as Partial<AgentClientQuotingProvider>).quoteSlot === 'function';
}

const NOOP_CONTEXT: BookSlotContext = {
  // The agent card has no busy grid to refresh; the adapter's own live re-check still runs.
  refreshSnapshot: async () => true,
  lastFetchedAt: null,
};

function bookParams(plan: AgentClientPlan, club: Club, index: number): BookSlotParams | null {
  const court = plan.courts[index];
  if (!court.externalCourtId) return null;
  const clubCourt = club.courts?.find((c) => c.id === court.courtId);
  return {
    courtId: court.courtId,
    externalCourtId: court.externalCourtId,
    courtName: clubCourt?.name ?? court.courtId,
    dateKey: plan.date,
    startTime: plan.start,
    durationMinutes: plan.durationMinutes,
    sport: clubCourt?.sport ?? null,
  };
}

async function sendReport(
  deps: AgentClientExecutorDeps,
  attempt: StoredAgentClientAttempt,
  flags: { notConnected: boolean; leaseExpired: boolean },
): Promise<AgentClientRunResult> {
  try {
    const { action, runId } = await deps.report(attempt.actionId, {
      attemptId: attempt.attemptId,
      results: attempt.results,
    });
    deps.storage.remove(attempt.actionId);
    return { kind: 'reported', action, runId, ...flags };
  } catch (err) {
    const { status } = apiErrorInfo(err);
    if (isAgentActionHandledError(err)) {
      deps.storage.remove(attempt.actionId);
      return { kind: 'handled' };
    }
    // 400 (report doesn't match the plan) / 404 (gone): retrying cannot help.
    if (status === 400 || status === 404) {
      deps.storage.remove(attempt.actionId);
      throw err;
    }
    return { kind: 'report_pending' };
  }
}

async function runProviderCalls(
  deps: AgentClientExecutorDeps,
  attempt: StoredAgentClientAttempt,
  opts: RunAgentClientActionOptions,
): Promise<{ notConnected: boolean; leaseExpired: boolean; interrupted?: boolean }> {
  const { plan } = attempt;
  const total = plannedCount(plan);
  const leaseMs = attempt.leaseExpiresAt ? Date.parse(attempt.leaseExpiresAt) : Number.NaN;
  const leaseOver = () => Number.isFinite(leaseMs) && deps.now() >= leaseMs - AGENT_CLIENT_LEASE_MARGIN_MS;
  const finish = (results: AgentClientReportResult[]) => {
    attempt.results = results;
    attempt.phase = 'ran';
    attempt.inFlight = null;
    attempt.rollbackInFlight = null;
    deps.storage.put(attempt);
  };

  // Resuming a rollback (or a failure recorded just before it started): finish undoing, book nothing.
  if (attempt.phase === 'rolling_back' || (attempt.inFlight == null && needsRollback(plan, attempt.results))) {
    await rollBack(deps, attempt, await openProvider(deps, plan), opts);
    finish(attempt.results);
    return { notConnected: false, leaseExpired: false };
  }

  // Resuming the same attempt: calls already done (or started) are never repeated.
  const startAt = attempt.results.length + (attempt.inFlight != null ? 1 : 0);
  if (attempt.inFlight != null) {
    // The call in flight when the app died: its outcome is unknown, so it is left out of the
    // report (never reported as failed). Nothing further runs.
    if (!attempt.results.some((r) => r.ok)) return { notConnected: false, leaseExpired: false, interrupted: true };
    finish(attempt.results);
    return { notConnected: false, leaseExpired: false };
  }

  if (leaseOver()) {
    finish([...attempt.results, ...failedFrom(plan, startAt, 'lease_expired')]);
    return { notConnected: false, leaseExpired: true };
  }
  if (!AGENT_CLIENT_PROVIDERS.includes(plan.provider) || !(await deps.isConnected(plan.provider, plan.clubId))) {
    finish([...attempt.results, ...failedFrom(plan, startAt, 'not_connected')]);
    return { notConnected: true, leaseExpired: false };
  }

  opts.onProgress?.({ kind: 'rechecking' });
  let provider: ClubBookingProvider | null = null;
  let club: Club | null = null;
  try {
    club = await deps.loadClub(plan.clubId);
    provider = await deps.createProvider(club, plan.durationMinutes);
  } catch (err) {
    finish([...attempt.results, ...failedFrom(plan, startAt, shortError(err))]);
    return { notConnected: false, leaseExpired: false };
  }
  if (!provider || !club) {
    finish([...attempt.results, ...failedFrom(plan, startAt, 'not_connected')]);
    return { notConnected: true, leaseExpired: false };
  }

  if (plan.operation === 'book' && opts.confirmPrice && isQuoting(provider) && startAt === 0) {
    let quote: AgentClientPriceQuote | null = null;
    try {
      let sum = 0;
      let currency: string | null = null;
      let any = false;
      for (let i = 0; i < total; i++) {
        const params = bookParams(plan, club, i);
        if (!params) continue;
        const q = await provider.quoteSlot(params, planDate(plan));
        if (q.price != null) {
          any = true;
          sum += q.price;
          currency = q.currency ?? currency;
        }
      }
      quote = any ? { total: sum, currency } : null;
    } catch {
      quote = null; // A failed quote is not a failed booking: the adapter re-checks on write.
    }
    if (quote && !(await opts.confirmPrice(quote))) {
      finish(failedFrom(plan, 0, 'price_declined'));
      return { notConnected: false, leaseExpired: false };
    }
  }

  const results = [...attempt.results];
  let notConnected = false;
  let leaseExpired = false;
  for (let i = startAt; i < total; i++) {
    if (leaseOver()) {
      results.push(...failedFrom(plan, i, 'lease_expired'));
      leaseExpired = true;
      break;
    }
    const params = plan.operation === 'book' ? bookParams(plan, club, i) : null;
    if (plan.operation === 'book' && !params) {
      results.push(failedResult(plan, i, 'no_external_court'));
      results.push(...failedFrom(plan, i + 1, 'skipped'));
      break;
    }
    // Persist BEFORE the call: if the app dies now, this call is never started again.
    attempt.results = results;
    attempt.phase = 'running';
    attempt.inFlight = i;
    deps.storage.put(attempt);
    opts.onProgress?.({ kind: 'writing', index: i, total, operation: plan.operation });

    let stop = false;
    try {
      if (plan.operation === 'book') {
        const booked = await provider.bookSlot(params as BookSlotParams, planDate(plan), NOOP_CONTEXT);
        results.push({
          ...baseResult(plan),
          courtId: plan.courts[i].courtId,
          ok: true,
          externalBookingId: booked.externalBookingId,
          bookingRef: null,
          price: booked.price ?? null,
          currency: null,
          error: null,
        });
      } else {
        const booking = plan.bookings[i];
        await provider.cancelBooking(booking.externalBookingId, NOOP_CONTEXT.refreshSnapshot);
        results.push({
          ...baseResult(plan),
          courtId: booking.courtId,
          ok: true,
          externalBookingId: booking.externalBookingId,
          bookingRef: booking.bookingRef,
          error: null,
        });
      }
    } catch (err) {
      results.push(failedResult(plan, i, shortError(err)));
      if (isAuthExpired(err)) notConnected = true;
      // Booking: stop at the first failure (don't pay for a partial set). Cancel: each
      // booking is independent, keep going unless the session is gone.
      stop = plan.operation === 'book' || notConnected;
    }
    // Persist AFTER the call.
    attempt.results = results;
    attempt.inFlight = null;
    deps.storage.put(attempt);
    if (stop) {
      results.push(...failedFrom(plan, i + 1, notConnected ? 'not_connected' : 'skipped'));
      break;
    }
  }
  if (needsRollback(plan, results)) {
    attempt.results = results;
    await rollBack(deps, attempt, provider, opts);
    finish(attempt.results);
    return { notConnected, leaseExpired };
  }
  finish(results);
  return { notConnected, leaseExpired };
}

/** Claim → provider calls → report. Throws only on unexpected claim / report errors. */
export async function runAgentClientAction(
  opts: RunAgentClientActionOptions,
  deps: AgentClientExecutorDeps = defaultAgentClientExecutorDeps(),
): Promise<AgentClientRunResult> {
  if (activeActions.has(opts.actionId)) return { kind: 'report_pending' };
  activeActions.add(opts.actionId);
  try {
    opts.onProgress?.({ kind: 'claiming' });
    let claim: AgentClientClaimResponse;
    try {
      claim = await deps.claim(opts.actionId, deps.clientKey());
    } catch (err) {
      if (isAgentActionHandledError(err)) return { kind: 'handled' };
      throw err;
    }

    const stored = deps.storage.get(opts.actionId);
    if (!claim.attemptId || !claim.clientPlan) {
      // Settled server-side. Results of an older attempt of ours may still be unreported.
      if (stored && stored.phase === 'ran') return sendReport(deps, stored, { notConnected: false, leaseExpired: false });
      return { kind: 'not_claimed', action: claim.action, runId: claim.runId };
    }

    const attempt: StoredAgentClientAttempt =
      stored && stored.attemptId === claim.attemptId
        ? { ...stored, leaseExpiresAt: claim.leaseExpiresAt }
        : {
            actionId: opts.actionId,
            chatId: opts.chatId,
            attemptId: claim.attemptId,
            leaseExpiresAt: claim.leaseExpiresAt,
            plan: claim.clientPlan,
            phase: 'claimed',
            results: [],
            inFlight: null,
            updatedAt: deps.now(),
          };
    deps.storage.put(attempt);

    if (attempt.phase === 'abandoned') return { kind: 'interrupted' };
    const { interrupted, ...flags } =
      attempt.phase === 'ran'
        ? { notConnected: false, leaseExpired: false, interrupted: false }
        : await runProviderCalls(deps, attempt, opts);
    if (interrupted) {
      // Kept (never reported) so a later tap within the lease cannot start the calls again.
      deps.storage.put({ ...attempt, phase: 'abandoned' });
      return { kind: 'interrupted' };
    }
    opts.onProgress?.({ kind: 'saving' });
    return await sendReport(deps, attempt, flags);
  } finally {
    activeActions.delete(opts.actionId);
  }
}

/**
 * On app resume / chat open: report stored attempts this session isn't running.
 * - `ran`: re-report the stored results (same attemptId; the server upgrades UNKNOWN).
 * - `running` (app died mid-call): report the calls that finished, only if one succeeded —
 *   otherwise mark it `abandoned` (never reported, never re-run) and leave it to the lease
 *   sweep (UNKNOWN, "check Club bookings").
 * - `claimed` (died before any call): report every call as not run → FAILED, nothing changed.
 * - `rolling_back` (died while undoing a partial multi-court booking): finish undoing the courts
 *   not yet tried (the cancel in flight is reported `rolledBack: false`), then report.
 * Returns the chats whose actions changed.
 */
export async function resumeAgentClientAttempts(
  deps: AgentClientExecutorDeps = defaultAgentClientExecutorDeps(),
): Promise<Array<{ chatId: string; result: AgentClientRunResult }>> {
  const out: Array<{ chatId: string; result: AgentClientRunResult }> = [];
  for (const attempt of deps.storage.list()) {
    if (activeActions.has(attempt.actionId)) continue;
    if (attempt.phase === 'abandoned') {
      const lease = attempt.leaseExpiresAt ? Date.parse(attempt.leaseExpiresAt) : 0;
      if (!(deps.now() < lease)) deps.storage.remove(attempt.actionId);
      continue;
    }
    const rollingBack =
      attempt.phase === 'rolling_back' ||
      (attempt.phase === 'running' && attempt.inFlight == null && needsRollback(attempt.plan, attempt.results));
    // A rollback's undo calls run below, inside the active guard, before the report.
    if (!rollingBack && attempt.phase === 'running') {
      if (!attempt.results.some((r) => r.ok)) {
        deps.storage.put({ ...attempt, phase: 'abandoned' });
        continue;
      }
      attempt.phase = 'ran';
      attempt.inFlight = null;
      deps.storage.put(attempt);
    } else if (!rollingBack && attempt.phase === 'claimed') {
      attempt.results = [...attempt.results, ...failedFrom(attempt.plan, attempt.results.length, 'interrupted')];
      attempt.phase = 'ran';
      deps.storage.put(attempt);
    }
    activeActions.add(attempt.actionId);
    try {
      if (rollingBack) {
        await rollBack(deps, attempt, await openProvider(deps, attempt.plan), {});
        attempt.phase = 'ran';
        attempt.rollbackInFlight = null;
        deps.storage.put(attempt);
      }
      const result = await sendReport(deps, attempt, { notConnected: false, leaseExpired: false });
      if (result.kind !== 'report_pending') out.push({ chatId: attempt.chatId, result });
    } catch {
      // 400 / 404: dropped by sendReport; nothing to show.
    } finally {
      activeActions.delete(attempt.actionId);
    }
  }
  return out;
}

/** Real dependencies; heavy provider modules load lazily (only when a client action runs). */
export function defaultAgentClientExecutorDeps(): AgentClientExecutorDeps {
  return {
    claim: async (actionId, clientKey) => (await import('@/api/agent')).agentApi.claimAction(actionId, clientKey),
    report: async (actionId, body) => (await import('@/api/agent')).agentApi.reportAction(actionId, body),
    loadClub: async (clubId) => (await (await import('@/api/clubs')).clubsApi.getById(clubId)).data,
    createProvider: async (club, durationMinutes) =>
      (await import('@/integrations/booking/createClubBookingProvider')).createHydratedClubBookingProvider(club, {
        durationMinutes,
      }),
    isConnected: agentClientProviderConnected,
    storage: createAgentClientAttemptStorage(),
    clientKey: () => getAgentClientKey(),
    now: () => Date.now(),
  };
}

/** Local provider session for the club (the same check Connected clubs uses). */
async function agentClientProviderConnected(provider: ClubIntegrationType, clubId: string): Promise<boolean> {
  if (provider === 'BOOKTIME') return (await import('@/integrations/booktime/session')).hasBooktimeSession(clubId);
  if (provider === 'PADELOO') return (await import('@/integrations/padeloo/session')).hasPadelooSession(clubId);
  if (provider === 'KLIKTEREN') return (await import('@/integrations/klikteren/session')).hasKlikterenSession(clubId);
  return false;
}
