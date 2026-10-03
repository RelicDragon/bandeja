import { organizerNextActionsSupportsEntity } from './buildOrganizerNextActions';
import type { OrganizerViewerRole } from './organizerNextActionsTypes';

/**
 * PRD 364 — which surface hosts the organizer's Nudge: the Players card tray,
 * or the "Next steps" block.
 *
 * The shell reads this once per render and passes the answer down, so Nudge
 * can never be on screen twice. Kept pure so the exclusivity is unit-tested rather than hoped.
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
  /** `GameRoster` must not render Nudge in its tray. */
  hideAttendanceStrip: boolean;
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
  // Only the organizer ever saw Nudge, and only the organizer gets the
  // attendance row in the block.
  const moved = blockEligible && input.viewerRole === 'organizer';
  return {
    blockEligible,
    hideAttendanceStrip: moved,
  };
}
