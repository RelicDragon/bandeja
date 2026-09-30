/**
 * Stored plan of a client-executed action (booking plan §14.5 step 1):
 *   `AgentPendingAction.args.plan = { executor: 'client', clientPlan, post }`
 * `clientPlan` is what the app runs after `/claim`; `post` is the tool's own server-side
 * payload for its post-step (create / link / unlink / delete), never sent to the app.
 * The DTO shows `execution: 'client'` from `executor` (`agentChat.service.ts`).
 */
import { z } from 'zod';
import type { AgentClientPlan } from '@bandeja/shared/agentContract';
import { proposeAgentAction, type ProposeAgentActionParams } from '../agentActionPropose';
import type { AgentToolContext, AgentToolResult } from '../tools/registry';

const PROVIDERS = ['BOOKTIME', 'PADELOO', 'KLIKTEREN', 'NSPADELSUPABASE', 'WELTNER'] as const;
const id = z.string().trim().min(1).max(128);

export const agentClientPlanSchema = z
  .object({
    provider: z.enum(PROVIDERS),
    clubId: id,
    courts: z.array(z.object({ courtId: id, externalCourtId: z.string().max(128).nullable() }).strict()).max(8),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    durationMinutes: z.number().int().min(15).max(24 * 60),
    operation: z.enum(['book', 'cancel']),
    bookings: z
      .array(z.object({ bookingRef: id, externalBookingId: id, courtId: id.nullable() }).strict())
      .max(8),
    postStep: z
      .object({
        kind: z.enum(['none', 'create_game', 'link_game', 'unlink_game', 'delete_game']),
        gameId: id.nullable(),
      })
      .strict(),
    rollbackOnPartial: z.boolean().optional(),
  })
  .strict()
  .superRefine((plan, issue) => {
    if (plan.operation === 'book' && plan.courts.length === 0) {
      issue.addIssue({ code: 'custom', message: 'book needs at least one court' });
    }
    if (plan.operation === 'cancel' && plan.bookings.length === 0) {
      issue.addIssue({ code: 'custom', message: 'cancel needs at least one booking' });
    }
  });

export type AgentClientExecutedPlan = {
  executor: 'client';
  clientPlan: AgentClientPlan;
  /** Tool-specific payload for the post-step handler (`clientPostSteps.ts`). */
  post: unknown;
};

/** Planned provider calls: one per court (`book`) or per booking (`cancel`). */
export function plannedCallCount(plan: AgentClientPlan): number {
  return plan.operation === 'book' ? plan.courts.length : plan.bookings.length;
}

/** The stored plan when it is client-executed and well-formed; else null. */
export function readClientExecutedPlan(plan: unknown): AgentClientExecutedPlan | null {
  if (!plan || typeof plan !== 'object' || (plan as { executor?: unknown }).executor !== 'client') return null;
  const parsed = agentClientPlanSchema.safeParse((plan as { clientPlan?: unknown }).clientPlan);
  if (!parsed.success) return null;
  return { executor: 'client', clientPlan: parsed.data, post: (plan as { post?: unknown }).post ?? null };
}

/** Cheap check (no validation): the action must never run on the server (`/confirm`, auto-approve). */
export function isClientExecutedPlan(plan: unknown): boolean {
  return Boolean(plan && typeof plan === 'object' && (plan as { executor?: unknown }).executor === 'client');
}

export type ProposeClientExecutedActionParams = Omit<ProposeAgentActionParams, 'plan' | 'currentState'> & {
  clientPlan: AgentClientPlan;
  post?: unknown;
};

/**
 * For write tools (slice 7g): saves a PENDING client-executed action. Always critical
 * (never auto-approved, no "Always allow"): it needs the device, so it always asks.
 * The tool's `confirm.authorize(principal, plan)` receives the whole stored plan at claim
 * time; `confirm.execute` is never called (`/confirm` → 409 CLIENT_EXECUTION_REQUIRED).
 * Tools may propose without the `booking-v1` cap (Telegram shows "Open in app"; old builds get
 * 409 on `/confirm`); `supportsClientExecution(ctx)` tells whether this client can run it.
 */
export async function proposeClientExecutedAction(
  ctx: AgentToolContext,
  params: ProposeClientExecutedActionParams,
): Promise<AgentToolResult> {
  const clientPlan = agentClientPlanSchema.parse(params.clientPlan);
  const plan: AgentClientExecutedPlan = { executor: 'client', clientPlan, post: params.post ?? null };
  // Without `ctx.tool` the proposal's effective tier is critical (see `proposeAgentAction`).
  return proposeAgentAction(
    { ...ctx, tool: undefined },
    { toolName: params.toolName, input: params.input, plan, preview: params.preview },
  );
}
