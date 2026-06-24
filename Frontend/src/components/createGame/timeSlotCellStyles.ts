import type { TimeGridCellReservationState } from '@shared/gameBooking/mapBookingsToTimeGridCells';

export function resolveOccupancyCellClasses(args: {
  isBooked: boolean;
  allUnconfirmed: boolean;
  isExternallyBooked: boolean;
  reservationCell: TimeGridCellReservationState | null;
}): string {
  const { isBooked, allUnconfirmed, isExternallyBooked, reservationCell } = args;

  if (reservationCell?.hasSelectedReservation) {
    return 'bg-emerald-200 dark:bg-emerald-900/40 text-emerald-950 dark:text-emerald-50 border-2 border-emerald-500 dark:border-emerald-400';
  }
  if (reservationCell?.hasReservation) {
    return 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-200/80 dark:hover:bg-emerald-900/50';
  }
  if (isBooked) {
    if (isExternallyBooked) {
      return allUnconfirmed
        ? 'bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-500 border border-red-200 dark:border-red-900/30'
        : 'bg-red-200 dark:bg-red-900/30 text-red-800 dark:text-red-300 border border-red-400 dark:border-red-700';
    }
    return allUnconfirmed
      ? 'bg-yellow-50 dark:bg-yellow-900/10 text-yellow-600 dark:text-yellow-500 border border-yellow-200 dark:border-yellow-900/30'
      : 'bg-yellow-200 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 border border-yellow-400 dark:border-yellow-700';
  }
  return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700';
}

export function resolveSelectionCellClasses(isInSelectedRange: boolean): string {
  if (!isInSelectedRange) return '';
  return 'ring-2 ring-inset ring-primary-500/70 dark:ring-primary-400/60';
}

export const SELECTION_TINT_OVERLAY_CLASS =
  'pointer-events-none absolute inset-0 rounded-lg bg-primary-500/10 dark:bg-primary-400/15';

export function shouldShowGameTimeSelectionCheck(args: {
  isInSelectedRange: boolean;
  reservationCell: TimeGridCellReservationState | null;
}): boolean {
  return args.isInSelectedRange && !args.reservationCell?.hasSelectedReservation;
}
