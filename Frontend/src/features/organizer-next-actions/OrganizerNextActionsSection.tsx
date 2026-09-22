/**
 * PRD 364 — wires the "Next steps" block to data the game page already has.
 *
 * Nothing here fetches anything new: attendance comes from the shell's
 * `useGameAttendance`, booking coverage is derived from the game payload,
 * and the cost ledger is the same TanStack query the Cost card owns (same key,
 * so one request). Each action lands on the existing workflow — the invite
 * picker, the queue list, the bookings section, the court editor, the Nudge
 * mutation, the Cost card and its settle sheet.
 */
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { PANEL_TRANSITION } from '@/components/motion/motionTokens';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useGameCostQuery } from '@/queries/useGameCostQuery';
import { isCostLedgerHidden } from '@/features/cost/costViewModel';
import { attendanceErrorKey } from '@/features/attendance/attendanceVisuals';
import type { UseGameAttendanceResult } from '@/features/attendance/useGameAttendance';
import { resolveGameBookingBadgeKind } from '@/utils/gameHasConfirmedClubBooking';
import type { CostShare } from '@/api/gameCost';
import type { Game } from '@/types';
import { buildOrganizerNextActions } from './buildOrganizerNextActions';
import { OrganizerNextActions } from './OrganizerNextActions';
import { scrollToSection } from './scrollToSection';
import type {
  OrganizerCostInput,
  OrganizerHint,
  OrganizerViewerRole,
} from './organizerNextActionsTypes';

export interface OrganizerNextActionsSectionProps {
  game: Game;
  viewerRole: OrganizerViewerRole;
  /** The shell's `canInvitePlayers`. */
  canInvite: boolean;
  /** The shell's `canManageJoinQueue`. */
  canManageQueue: boolean;
  attendance: UseGameAttendanceResult;
  /** The shell's `attendanceEnabled` gate — `false` skips the row entirely. */
  attendanceEnabled: boolean;
  /** `canViewGameCost(game, user)` — the Cost card mounts under the same gate. */
  costVisible: boolean;
  /** Opens the existing invite picker (`PlayerListModal`, players mode). */
  onInvite: () => void;
  /** Opens the existing court/time editor (`EditGameInfoModal`, location tab). */
  onEditCourt: () => void;
}

function apiErrorCode(error: unknown): string | undefined {
  const data = (error as { response?: { data?: { code?: string; message?: string } } })?.response
    ?.data;
  if (!data || typeof data !== 'object') return undefined;
  return data.code ?? data.message;
}

export function OrganizerNextActionsSection({
  game,
  viewerRole,
  canInvite,
  canManageQueue,
  attendance,
  attendanceEnabled,
  costVisible,
  onInvite,
  onEditCourt,
}: OrganizerNextActionsSectionProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = usePrefersReducedMotion();

  const { data: costSummary } = useGameCostQuery(game.id, costVisible);

  const cost = useMemo<OrganizerCostInput | null>(() => {
    if (!costVisible || !costSummary || isCostLedgerHidden(costSummary)) return null;
    const unpaidCount = costSummary.shares.filter(
      (share: CostShare) => !share.isPayer && share.state === 'UNPAID',
    ).length;
    const mine = costSummary.viewerShare;
    return {
      unpaidCount,
      viewerOwesUnpaid: Boolean(mine && !mine.isPayer && mine.state === 'UNPAID'),
    };
  }, [costSummary, costVisible]);

  const details = attendance.details;
  const hints = useMemo(
    () =>
      buildOrganizerNextActions({
        game: {
          entityType: game.entityType,
          status: game.status,
          resultsStatus: game.resultsStatus,
          timeIsSet: game.timeIsSet,
          maxParticipants: game.maxParticipants,
          participants: game.participants ?? [],
          joinQueues: game.joinQueues,
          hasClub: Boolean(game.clubId || game.club || game.court?.club),
          linkedBookingCount: game.linkedBookings?.length ?? 0,
        },
        viewerRole,
        canInvite,
        canManageQueue,
        attendance:
          attendanceEnabled && details
            ? {
                enabled: true,
                answersOpen: details.answersOpen,
                confirmedCount: details.confirmedCount,
                playingCount: details.playingCount,
                nudgeAllowed: details.nudge.allowed,
                nudgeRemainingHours: details.nudge.remainingHours,
              }
            : null,
        bookingCoverage: resolveGameBookingBadgeKind(game),
        cost,
      }),
    [game, viewerRole, canInvite, canManageQueue, attendanceEnabled, details, cost],
  );

  const handleNudge = useCallback(async () => {
    try {
      await attendance.nudge();
      toast.success(t('attendance.organizer.nudgeSent'));
    } catch (error) {
      toast.error(t(attendanceErrorKey(apiErrorCode(error))));
    }
  }, [attendance, t]);

  const handleAction = useCallback(
    (hint: OrganizerHint) => {
      switch (hint.key) {
        case 'seats':
          if (hint.action === 'reviewQueue') {
            if (!scrollToSection('queue', reduceMotion)) onInvite();
          } else {
            onInvite();
          }
          return;
        case 'booking':
          if (hint.action === 'seeBookings' && scrollToSection('bookings', reduceMotion)) return;
          // The section only renders for bookings the viewer owns; the court
          // editor is the workflow that covers every other case.
          onEditCourt();
          return;
        case 'attendance':
          void handleNudge();
          return;
        case 'cost':
          if (hint.action === 'settle') {
            // PRD 348's own deep link: the Cost card scrolls into view, opens
            // the settle sheet and strips the params again.
            const params = new URLSearchParams(location.search);
            params.set('section', 'cost');
            params.set('settle', '1');
            navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
          } else {
            scrollToSection('cost', reduceMotion);
          }
          return;
      }
    },
    [handleNudge, location.pathname, location.search, navigate, onEditCourt, onInvite, reduceMotion],
  );

  const block = (
    <OrganizerNextActions hints={hints} onAction={handleAction} isNudging={attendance.isNudging} />
  );

  if (reduceMotion) {
    return hints.length > 0 ? block : null;
  }

  return (
    <AnimatePresence initial={false}>
      {hints.length > 0 ? (
        <motion.div
          key="organizer-next-actions"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={PANEL_TRANSITION}
          className="overflow-hidden"
        >
          {block}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
