import { describe, expect, it } from 'vitest';
import {
  canViewUnapprovedEvent,
  EVENT_APPROVAL_STATUS,
  isEventApproved,
  isEventAwaitingApproval,
} from './eventApproval';

describe('eventApproval', () => {
  it('treats non-EVENT rows as publicly visible', () => {
    expect(isEventApproved({ entityType: 'GAME' })).toBe(true);
    expect(isEventAwaitingApproval({ entityType: 'GAME', eventApprovalStatus: 'ON_APPROVE' })).toBe(
      false,
    );
  });

  it('only APPROVED events are public', () => {
    expect(
      isEventApproved({ entityType: 'EVENT', eventApprovalStatus: EVENT_APPROVAL_STATUS.APPROVED }),
    ).toBe(true);
    expect(
      isEventApproved({
        entityType: 'EVENT',
        eventApprovalStatus: EVENT_APPROVAL_STATUS.ON_APPROVE,
      }),
    ).toBe(false);
    expect(
      isEventApproved({ entityType: 'EVENT', eventApprovalStatus: EVENT_APPROVAL_STATUS.DECLINED }),
    ).toBe(false);
    expect(isEventApproved({ entityType: 'EVENT' })).toBe(false);
  });

  it('ON_APPROVE is waiting for admin', () => {
    expect(
      isEventAwaitingApproval({
        entityType: 'EVENT',
        eventApprovalStatus: EVENT_APPROVAL_STATUS.ON_APPROVE,
      }),
    ).toBe(true);
    expect(
      isEventAwaitingApproval({
        entityType: 'EVENT',
        eventApprovalStatus: EVENT_APPROVAL_STATUS.APPROVED,
      }),
    ).toBe(false);
  });

  it('only admin or owner can see unapproved listings', () => {
    expect(canViewUnapprovedEvent({ isAdmin: true })).toBe(true);
    expect(canViewUnapprovedEvent({ isOwner: true })).toBe(true);
    expect(canViewUnapprovedEvent({})).toBe(false);
  });
});
