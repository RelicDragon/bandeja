/**
 * `/report` body checks against the claimed plan (booking plan §14.5 step 4): same
 * provider, date, start and duration; only planned courts (`book`) or bookings
 * (`cancel`), each at most once; never more results than planned calls. The report is
 * trusted as much as today's app booking flow, no more.
 */
import { z } from 'zod';
import type { AgentClientPlan, AgentClientReportResult } from '@bandeja/shared/agentContract';
import { ApiError } from '../../../utils/ApiError';
import { plannedCallCount } from './clientPlan';

const id = z.string().trim().min(1).max(128);

export const agentClientReportResultSchema = z
  .object({
    provider: z.enum(['BOOKTIME', 'PADELOO', 'KLIKTEREN', 'NSPADELSUPABASE', 'WELTNER']),
    courtId: id.nullable(),
    date: z.string().max(10),
    start: z.string().max(5),
    durationMinutes: z.number().int(),
    ok: z.boolean(),
    externalBookingId: id.nullable(),
    bookingRef: id.nullable(),
    price: z.number().finite().nullable().optional(),
    currency: z.string().trim().max(8).nullable().optional(),
    error: z.string().max(500).nullable().optional(),
    rolledBack: z.boolean().nullable().optional(),
  })
  .strict();

export const agentClientReportBodySchema = z
  .object({ attemptId: z.string().trim().min(1).max(64), results: z.array(agentClientReportResultSchema).max(8) })
  .strict();

function invalid(detail: string): ApiError {
  return new ApiError(400, `Report does not match the plan: ${detail}`, true, { code: 'validation.invalidInput' });
}

export type ValidatedClientReport = {
  results: AgentClientReportResult[];
  /** `ok` and not rolled back: what the provider still holds. */
  succeeded: AgentClientReportResult[];
  planned: number;
  /**
   * Set when the app rolled back a partial multi-court booking (`rollbackOnPartial`):
   * `stillBooked` = courts whose undo failed or is unknown. Empty → nothing stays booked.
   */
  rollback: { stillBooked: AgentClientReportResult[] } | null;
};

export function validateAgentClientReport(
  plan: AgentClientPlan,
  results: AgentClientReportResult[],
): ValidatedClientReport {
  const planned = plannedCallCount(plan);
  if (results.length > planned) throw invalid(`${results.length} results for ${planned} planned`);
  const seen = new Set<string>();
  const bookingIds = new Set<string>();
  const normalized: AgentClientReportResult[] = [];
  for (const reported of results) {
    let result = reported;
    if (result.provider !== plan.provider) throw invalid('provider');
    if (result.date !== plan.date || result.start !== plan.start || result.durationMinutes !== plan.durationMinutes) {
      throw invalid('time');
    }
    let key: string;
    if (plan.operation === 'book') {
      if (!result.courtId || !plan.courts.some((c) => c.courtId === result.courtId)) throw invalid('court');
      if (result.bookingRef) throw invalid('bookingRef');
      if (result.ok && !result.externalBookingId) throw invalid('externalBookingId');
      key = result.courtId;
    } else {
      const booking = plan.bookings.find((b) => b.bookingRef === result.bookingRef);
      if (!booking) throw invalid('booking');
      if (result.courtId && booking.courtId && result.courtId !== booking.courtId) throw invalid('court');
      if (result.externalBookingId && result.externalBookingId !== booking.externalBookingId) {
        throw invalid('externalBookingId');
      }
      key = booking.bookingRef;
      result = { ...result, externalBookingId: booking.externalBookingId, courtId: result.courtId ?? booking.courtId };
    }
    if (result.rolledBack != null) {
      // Only an undo of a court this attempt booked, and only when the plan asked for it.
      if (plan.operation !== 'book' || !plan.rollbackOnPartial || !result.ok) throw invalid('rolledBack');
    }
    if (seen.has(key)) throw invalid('duplicate');
    seen.add(key);
    if (result.ok && result.externalBookingId) {
      if (bookingIds.has(result.externalBookingId)) throw invalid('duplicate booking');
      bookingIds.add(result.externalBookingId);
    }
    normalized.push(result);
  }
  const succeeded = normalized.filter((r) => r.ok && r.rolledBack !== true);
  const rollbackTried = normalized.some((r) => r.ok && r.rolledBack != null);
  return { results: normalized, succeeded, planned, rollback: rollbackTried ? { stillBooked: succeeded } : null };
}
