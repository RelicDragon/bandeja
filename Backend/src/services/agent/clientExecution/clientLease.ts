/**
 * Leases of client-executed actions (booking plan §14.5 step 7). `/claim` gives the app
 * `AGENT_CLIENT_LEASE_MS` to run the provider calls and `/report`. A lease that ran out
 * with no report (or with a report whose post-step never finished) → UNKNOWN: the app may
 * or may not have booked. The card says "Outcome unknown — check Club bookings" with a
 * handoff to `/profile/connected-clubs`, and the model gets the same as the tool result.
 * No follow-up run. A late report with the same `attemptId` still upgrades it.
 *
 * Run by the agent queue sweep (`AgentRunService.sweep`) and lazily on claim.
 */
import { AgentActionStatus } from '@prisma/client';
import prisma from '../../../config/database';
import { closeAgentAction, readStoredActionArgs, type AgentActionClosing } from '../agentActionOutcome';
import { agentClientExecT } from './clientExecutionI18n';

export const AGENT_CLIENT_LEASE_MS = 3 * 60 * 1000;
/** A report that started its post-step this long ago and never closed is treated as lost. */
export const AGENT_CLIENT_REPORT_STALE_MS = 2 * 60 * 1000;
export const AGENT_CONNECTED_CLUBS_PATH = '/profile/connected-clubs';

export function unknownClosing(locale: string): AgentActionClosing {
  return {
    status: 'UNKNOWN',
    result: {
      ok: false,
      message: agentClientExecT(locale, 'unknown'),
      entities: [{ type: 'handoff', url: AGENT_CONNECTED_CLUBS_PATH, label: agentClientExecT(locale, 'connectedClubs') }],
    },
    modelStatus: 'unknown',
    modelNote:
      'The user confirmed and the app started the change at the club, but it never reported back, so the outcome is UNKNOWN: it may or may not have happened. Tell the user to check Club bookings in the app. Do not retry without asking.',
  };
}

/** CONFIRMED client actions whose lease ran out → UNKNOWN. Bounded per call. */
export async function sweepExpiredAgentClientLeases(now: Date, scope: { actionId?: string } = {}): Promise<number> {
  const stale = await prisma.agentPendingAction.findMany({
    where: {
      status: AgentActionStatus.CONFIRMED,
      attemptId: { not: null },
      leaseExpiresAt: { lte: now },
      OR: [{ reportedAt: null }, { reportedAt: { lt: new Date(now.getTime() - AGENT_CLIENT_REPORT_STALE_MS) } }],
      ...(scope.actionId ? { id: scope.actionId } : {}),
    },
    orderBy: { leaseExpiresAt: 'asc' },
    take: 100,
  });
  let closed = 0;
  for (const action of stale) {
    const { locale } = readStoredActionArgs(action.args);
    const message = await prisma.$transaction((tx) =>
      closeAgentAction(tx, action, [AgentActionStatus.CONFIRMED], unknownClosing(locale)),
    );
    if (message) closed += 1;
  }
  return closed;
}
