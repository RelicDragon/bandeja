export const EVENT_APPROVAL_STATUS = {
  ON_APPROVE: 'ON_APPROVE',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
} as const;

export type EventApprovalStatusId =
  (typeof EVENT_APPROVAL_STATUS)[keyof typeof EVENT_APPROVAL_STATUS];

export function isEventApproved(game: {
  entityType?: string | null;
  eventApprovalStatus?: string | null;
}): boolean {
  if (game.entityType !== 'EVENT') return true;
  return game.eventApprovalStatus === EVENT_APPROVAL_STATUS.APPROVED;
}

export function isEventAwaitingApproval(game: {
  entityType?: string | null;
  eventApprovalStatus?: string | null;
}): boolean {
  return (
    game.entityType === 'EVENT' &&
    game.eventApprovalStatus === EVENT_APPROVAL_STATUS.ON_APPROVE
  );
}

export function canViewUnapprovedEvent(viewer: {
  isAdmin?: boolean | null;
  isOwner?: boolean | null;
}): boolean {
  return Boolean(viewer.isAdmin || viewer.isOwner);
}
