import { organizerNextActionsSupportsEntity } from './buildOrganizerNextActions';
import type { OrganizerViewerRole } from './organizerNextActionsTypes';

/**
 * PRD 364 — which surface hosts the organizer's attendance strip and the
 * open-spot row: the legacy cards, or the "Next steps" block.
 *
 * The shell reads this once per render and passes the answers down, so the
 * strip can never be on screen twice and the flag-off state is byte-for-byte
 * today's page. Kept pure so the exclusivity is unit-tested rather than hoped.
 */
export interface OrganizerSurfacePlacementInput {
  flagEnabled: boolean;
  viewerRole: OrganizerViewerRole;
  entityType: string;
  status: string;
}

export interface OrganizerSurfacePlacement {
  /** Mount the block (it still renders nothing when it has zero hints). */
  blockEligible: boolean;
  /** `AttendanceCard` must not render `AttendanceOrganizerStrip`. */
  hideAttendanceStrip: boolean;
  /** `GameQueuePanel` must not render the dashed open-spot row for this viewer. */
  hideOpenSpotRow: boolean;
}

export function resolveOrganizerSurfacePlacement(
  input: OrganizerSurfacePlacementInput,
): OrganizerSurfacePlacement {
  const eligibleEntity =
    organizerNextActionsSupportsEntity(input.entityType) && input.status !== 'ARCHIVED';
  const blockEligible =
    input.flagEnabled &&
    eligibleEntity &&
    (input.viewerRole === 'organizer' || input.viewerRole === 'inviter');
  // Only the organizer ever saw the strip and only the organizer gets the
  // attendance row, so the two moves are the same boolean.
  const moved = blockEligible && input.viewerRole === 'organizer';
  return {
    blockEligible,
    hideAttendanceStrip: moved,
    hideOpenSpotRow: moved,
  };
}
