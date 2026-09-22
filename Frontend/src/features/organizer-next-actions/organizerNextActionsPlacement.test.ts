/**
 * PRD 364 — exactly one surface hosts the organizer's attendance strip.
 *
 * The shell hands `hideAttendanceStrip` to `AttendanceCard` and mounts the
 * block on `blockEligible`, so the exclusivity below is what stops the strip
 * from ever rendering twice, in either flag state.
 */
import { describe, expect, it } from 'vitest';
import { resolveOrganizerSurfacePlacement } from './organizerNextActionsPlacement';
import type { OrganizerViewerRole } from './organizerNextActionsTypes';

const ROLES: OrganizerViewerRole[] = ['organizer', 'inviter', 'participant', 'none'];
const ENTITIES = ['GAME', 'TOURNAMENT', 'TRAINING', 'BAR', 'LEAGUE', 'LEAGUE_SEASON', 'EVENT'];
const STATUSES = ['ANNOUNCED', 'STARTED', 'FINISHED', 'ARCHIVED'];

describe('resolveOrganizerSurfacePlacement', () => {
  it('flag off: legacy surfaces stay, block never mounts', () => {
    for (const viewerRole of ROLES) {
      for (const entityType of ENTITIES) {
        expect(
          resolveOrganizerSurfacePlacement({ flagEnabled: false, viewerRole, entityType, status: 'ANNOUNCED' }),
        ).toEqual({ blockEligible: false, hideAttendanceStrip: false, hideOpenSpotRow: false });
      }
    }
  });

  it('flag on, organizer: the strip and the open-spot row move into the block', () => {
    expect(
      resolveOrganizerSurfacePlacement({
        flagEnabled: true,
        viewerRole: 'organizer',
        entityType: 'GAME',
        status: 'ANNOUNCED',
      }),
    ).toEqual({ blockEligible: true, hideAttendanceStrip: true, hideOpenSpotRow: true });
  });

  it('flag on, inviter: the block mounts (seats only) and nothing else moves', () => {
    expect(
      resolveOrganizerSurfacePlacement({
        flagEnabled: true,
        viewerRole: 'inviter',
        entityType: 'GAME',
        status: 'ANNOUNCED',
      }),
    ).toEqual({ blockEligible: true, hideAttendanceStrip: false, hideOpenSpotRow: false });
  });

  it('flag on, participant or guest: unchanged page', () => {
    for (const viewerRole of ['participant', 'none'] as const) {
      expect(
        resolveOrganizerSurfacePlacement({ flagEnabled: true, viewerRole, entityType: 'GAME', status: 'ANNOUNCED' }),
      ).toEqual({ blockEligible: false, hideAttendanceStrip: false, hideOpenSpotRow: false });
    }
  });

  it('never moves a surface for an entity type or state the block does not cover', () => {
    for (const entityType of ['LEAGUE', 'LEAGUE_SEASON', 'EVENT']) {
      expect(
        resolveOrganizerSurfacePlacement({ flagEnabled: true, viewerRole: 'organizer', entityType, status: 'ANNOUNCED' }),
      ).toEqual({ blockEligible: false, hideAttendanceStrip: false, hideOpenSpotRow: false });
    }
    expect(
      resolveOrganizerSurfacePlacement({ flagEnabled: true, viewerRole: 'organizer', entityType: 'GAME', status: 'ARCHIVED' }),
    ).toEqual({ blockEligible: false, hideAttendanceStrip: false, hideOpenSpotRow: false });
  });

  it('invariant: a hidden strip always has an eligible block to live in', () => {
    for (const flagEnabled of [true, false]) {
      for (const viewerRole of ROLES) {
        for (const entityType of ENTITIES) {
          for (const status of STATUSES) {
            const placement = resolveOrganizerSurfacePlacement({ flagEnabled, viewerRole, entityType, status });
            if (placement.hideAttendanceStrip) expect(placement.blockEligible).toBe(true);
            expect(placement.hideOpenSpotRow).toBe(placement.hideAttendanceStrip);
          }
        }
      }
    }
  });
});
