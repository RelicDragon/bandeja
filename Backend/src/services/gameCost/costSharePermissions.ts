/**
 * PRD 348 — who may do what to a game's cost ledger.
 *
 * Pure predicates so the whole matrix can be table-tested without a database.
 * Every mutating endpoint in `gameCost.controller.ts` goes through exactly one
 * of these; none of them re-derives the rules inline.
 */

export type CostShareActorContext = {
  /** The caller. */
  userId: string;
  /** `User.isAdmin` — platform staff, allowed everywhere. */
  isPlatformAdmin: boolean;
  /** `GameParticipant.role === OWNER`. */
  gameOwnerUserId: string | null;
  /** `GameParticipant.role === ADMIN`. */
  gameAdminUserIds: readonly string[];
  /** `Game.costPayerId`. */
  payerUserId: string | null;
  /** Every user on the roster, in any `ParticipantStatus`. */
  rosterUserIds: readonly string[];
  /** Users that currently hold a `GameCostShare` row. */
  shareUserIds: readonly string[];
};

function isGameOrganizer(ctx: CostShareActorContext): boolean {
  return (
    ctx.gameOwnerUserId === ctx.userId || ctx.gameAdminUserIds.includes(ctx.userId)
  );
}

/** Organizers and platform staff configure the ledger. */
export function canManageCostShares(ctx: CostShareActorContext): boolean {
  return ctx.isPlatformAdmin || isGameOrganizer(ctx);
}

/** Anyone who can see the game sees the ledger; strangers do not. */
export function canViewCostShares(ctx: CostShareActorContext): boolean {
  return (
    ctx.isPlatformAdmin ||
    isGameOrganizer(ctx) ||
    ctx.rosterUserIds.includes(ctx.userId) ||
    ctx.shareUserIds.includes(ctx.userId)
  );
}

/** You may only ever mark **your own** share as paid, and only if you have one. */
export function canMarkOwnCostSharePaid(ctx: CostShareActorContext): boolean {
  return ctx.shareUserIds.includes(ctx.userId);
}

/**
 * "Received" is the money side of the ledger: only the person who is owed the
 * money (the payer), the organizers, or platform staff may confirm — never the
 * player who owes it.
 */
export function canConfirmCostShare(
  ctx: CostShareActorContext,
  targetUserId: string,
): boolean {
  if (!ctx.shareUserIds.includes(targetUserId)) return false;
  return (
    ctx.isPlatformAdmin || isGameOrganizer(ctx) || ctx.payerUserId === ctx.userId
  );
}

/** Nudging costs other people a push notification, so it is organizer/payer only. */
export function canRemindCostShares(ctx: CostShareActorContext): boolean {
  return (
    ctx.isPlatformAdmin || isGameOrganizer(ctx) || ctx.payerUserId === ctx.userId
  );
}
