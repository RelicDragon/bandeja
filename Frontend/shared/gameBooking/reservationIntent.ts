export type ReservationLocationTimeMode = 'timeSlots' | 'bookings';

export type ReservationIntent = 'reserveNow' | 'useExisting' | 'gameOnly' | 'manualBooked';

export type EditReservationAction =
  | 'keepCurrent'
  | 'changeGameTimeOnly'
  | 'useExisting'
  | 'reserveNew'
  | 'unlink'
  | 'gameOnly';

export type ReservationIntentProjection = {
  locationTimeMode: ReservationLocationTimeMode;
  selectedBookingIds: string[];
  skipRealCourtBooking: boolean;
  hasBookedCourt: boolean;
  requiresBooktimeAuth: boolean;
  opensBooktimeConfirm: boolean;
  preservesLinkedBookings: boolean;
  removesLinkedBookings: boolean;
};

export type ReservationIntentOption = {
  id: ReservationIntent;
  enabled: boolean;
  recommended?: boolean;
};

export type EditReservationActionOption = {
  id: EditReservationAction;
  enabled: boolean;
  recommended?: boolean;
};

export type ReservationValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'authRequired'
        | 'bookingSelectionRequired'
        | 'bookingRecordsLoading'
        | 'courtSelectionRequired'
        | 'integratedCourtSelectionRequired'
        | 'timeRequired'
        | 'durationRequired';
    };

export function resolveInitialReservationIntent(input: {
  hasPreselectedBookings: boolean;
  clubBookingFlowActive: boolean;
  initialHasBookedCourt?: boolean;
  hasReservationsForDate?: boolean;
}): ReservationIntent {
  if (input.hasPreselectedBookings) return 'useExisting';
  if (input.clubBookingFlowActive && input.hasReservationsForDate) return 'useExisting';
  if (input.clubBookingFlowActive) return 'reserveNow';
  if (input.initialHasBookedCourt) return 'manualBooked';
  return 'gameOnly';
}

export function resolveReservationIntentOptions(input: {
  clubBookingFlowActive: boolean;
  hasBooktimeAuthPath: boolean;
  manualBookedAvailable?: boolean;
  hasReservationsForDate?: boolean;
}): ReservationIntentOption[] {
  const showUseExisting =
    input.clubBookingFlowActive &&
    input.hasBooktimeAuthPath &&
    input.hasReservationsForDate === true;

  const manualBookedAvailable = input.manualBookedAvailable ?? !input.clubBookingFlowActive;

  const options: ReservationIntentOption[] = [];

  if (input.clubBookingFlowActive) {
    options.push({
      id: 'reserveNow',
      enabled: true,
      recommended: !input.hasReservationsForDate,
    });
  }

  if (showUseExisting) {
    options.push({
      id: 'useExisting',
      enabled: true,
      recommended: true,
    });
  }

  options.push({
    id: 'gameOnly',
    enabled: true,
    recommended: !input.clubBookingFlowActive && !manualBookedAvailable,
  });

  if (manualBookedAvailable) {
    options.push({
      id: 'manualBooked',
      enabled: true,
      recommended: !input.clubBookingFlowActive,
    });
  }

  return options;
}

export function resolveInitialEditReservationAction(input: {
  hasLinkedBookings: boolean;
  clubBookingFlowActive: boolean;
  hasBookedCourt?: boolean;
}): EditReservationAction {
  if (input.hasLinkedBookings) return 'keepCurrent';
  if (input.clubBookingFlowActive) return 'reserveNew';
  if (input.hasBookedCourt) return 'changeGameTimeOnly';
  return 'gameOnly';
}

export function resolveEditReservationActionOptions(input: {
  hasLinkedBookings: boolean;
  clubBookingFlowActive: boolean;
  hasBooktimeAuthPath: boolean;
  hasReservationsForDate?: boolean;
}): EditReservationActionOption[] {
  const showUseExisting =
    input.clubBookingFlowActive &&
    input.hasBooktimeAuthPath &&
    input.hasReservationsForDate === true;

  const options: EditReservationActionOption[] = [];

  if (input.hasLinkedBookings) {
    options.push({
      id: 'keepCurrent',
      enabled: true,
      recommended: true,
    });
  }

  options.push({
    id: 'changeGameTimeOnly',
    enabled: true,
  });

  if (showUseExisting) {
    options.push({
      id: 'useExisting',
      enabled: true,
    });
  }

  if (input.clubBookingFlowActive) {
    options.push({
      id: 'reserveNew',
      enabled: true,
      recommended: !input.hasLinkedBookings,
    });
  }

  options.push(
    ...(input.hasLinkedBookings
      ? [
          {
            id: 'unlink' as const,
            enabled: true,
          },
        ]
      : []),
    {
      id: 'gameOnly',
      enabled: true,
      recommended: !input.hasLinkedBookings && !input.clubBookingFlowActive,
    },
  );

  return options;
}

export function projectReservationIntentToState(input: {
  intent: ReservationIntent;
  selectedBookingIds: string[];
  hasBookedCourt: boolean;
  needsBooktimeAuth: boolean;
}): ReservationIntentProjection {
  if (input.intent === 'useExisting') {
    return {
      locationTimeMode: 'bookings',
      selectedBookingIds: input.selectedBookingIds,
      skipRealCourtBooking: false,
      hasBookedCourt: input.selectedBookingIds.length > 0,
      requiresBooktimeAuth: input.needsBooktimeAuth,
      opensBooktimeConfirm: false,
      preservesLinkedBookings: false,
      removesLinkedBookings: false,
    };
  }

  if (input.intent === 'manualBooked') {
    return {
      locationTimeMode: 'timeSlots',
      selectedBookingIds: [],
      skipRealCourtBooking: true,
      hasBookedCourt: true,
      requiresBooktimeAuth: false,
      opensBooktimeConfirm: false,
      preservesLinkedBookings: false,
      removesLinkedBookings: false,
    };
  }

  if (input.intent === 'gameOnly') {
    return {
      locationTimeMode: 'timeSlots',
      selectedBookingIds: [],
      skipRealCourtBooking: true,
      hasBookedCourt: false,
      requiresBooktimeAuth: false,
      opensBooktimeConfirm: false,
      preservesLinkedBookings: false,
      removesLinkedBookings: false,
    };
  }

  return {
    locationTimeMode: 'timeSlots',
    selectedBookingIds: [],
    skipRealCourtBooking: false,
    hasBookedCourt: false,
    requiresBooktimeAuth: input.needsBooktimeAuth,
    opensBooktimeConfirm: !input.needsBooktimeAuth,
    preservesLinkedBookings: false,
    removesLinkedBookings: false,
  };
}

export function projectEditReservationActionToState(input: {
  action: EditReservationAction;
  initialLinkedBookingIds: string[];
  selectedBookingIds: string[];
  hasBookedCourt: boolean;
  needsBooktimeAuth: boolean;
}): ReservationIntentProjection {
  if (input.action === 'keepCurrent') {
    return {
      locationTimeMode: 'bookings',
      selectedBookingIds: input.initialLinkedBookingIds,
      skipRealCourtBooking: false,
      hasBookedCourt: input.initialLinkedBookingIds.length > 0 || input.hasBookedCourt,
      requiresBooktimeAuth: false,
      opensBooktimeConfirm: false,
      preservesLinkedBookings: true,
      removesLinkedBookings: false,
    };
  }

  if (input.action === 'useExisting') {
    return {
      locationTimeMode: 'bookings',
      selectedBookingIds: input.selectedBookingIds,
      skipRealCourtBooking: false,
      hasBookedCourt: input.selectedBookingIds.length > 0,
      requiresBooktimeAuth: input.needsBooktimeAuth,
      opensBooktimeConfirm: false,
      preservesLinkedBookings: false,
      removesLinkedBookings: false,
    };
  }

  if (input.action === 'reserveNew') {
    return {
      locationTimeMode: 'timeSlots',
      selectedBookingIds: [],
      skipRealCourtBooking: false,
      hasBookedCourt: false,
      requiresBooktimeAuth: input.needsBooktimeAuth,
      opensBooktimeConfirm: !input.needsBooktimeAuth,
      preservesLinkedBookings: false,
      removesLinkedBookings: input.initialLinkedBookingIds.length > 0,
    };
  }

  if (input.action === 'unlink' || input.action === 'gameOnly') {
    return {
      locationTimeMode: 'timeSlots',
      selectedBookingIds: [],
      skipRealCourtBooking: true,
      hasBookedCourt: false,
      requiresBooktimeAuth: false,
      opensBooktimeConfirm: false,
      preservesLinkedBookings: false,
      removesLinkedBookings: input.initialLinkedBookingIds.length > 0,
    };
  }

  return {
    locationTimeMode: 'timeSlots',
    selectedBookingIds: input.initialLinkedBookingIds,
    skipRealCourtBooking: true,
    hasBookedCourt: input.hasBookedCourt,
    requiresBooktimeAuth: false,
    opensBooktimeConfirm: false,
    preservesLinkedBookings: input.initialLinkedBookingIds.length > 0,
    removesLinkedBookings: false,
  };
}

export function resolveReservationValidation(input: {
  intent: ReservationIntent;
  needsBooktimeAuth: boolean;
  selectedBookingCount: number;
  selectedBookingRecordsCount?: number;
  selectedCourtCount?: number;
  bookingSelectionMin: number;
  selectedTime?: string;
  duration?: number;
}): ReservationValidationResult {
  if ((input.intent === 'reserveNow' || input.intent === 'useExisting') && input.needsBooktimeAuth) {
    return { ok: false, reason: 'authRequired' };
  }
  if (input.intent === 'useExisting') {
    if (input.selectedBookingCount < input.bookingSelectionMin) {
      return { ok: false, reason: 'bookingSelectionRequired' };
    }
    if ((input.selectedBookingRecordsCount ?? input.selectedBookingCount) < input.selectedBookingCount) {
      return { ok: false, reason: 'bookingRecordsLoading' };
    }
    return { ok: true };
  }
  if (input.intent === 'reserveNow' && (input.selectedCourtCount ?? 0) < input.bookingSelectionMin) {
    return { ok: false, reason: 'integratedCourtSelectionRequired' };
  }
  if (input.intent === 'reserveNow' && !input.selectedTime) {
    return { ok: false, reason: 'timeRequired' };
  }
  if (input.intent === 'reserveNow' && !input.duration) {
    return { ok: false, reason: 'durationRequired' };
  }
  if ((input.intent === 'gameOnly' || input.intent === 'manualBooked') && !input.selectedTime) {
    return { ok: false, reason: 'timeRequired' };
  }
  if ((input.intent === 'gameOnly' || input.intent === 'manualBooked') && !input.duration) {
    return { ok: false, reason: 'durationRequired' };
  }
  return { ok: true };
}

export function resolveEditReservationValidation(input: {
  action: EditReservationAction;
  needsBooktimeAuth: boolean;
  selectedBookingCount: number;
  selectedBookingRecordsCount: number;
  selectedCourtCount: number;
  integratedCourtCount: number;
  bookingSelectionMin: number;
  selectedTime?: string;
  duration?: number;
  requiresSchedule: boolean;
}): ReservationValidationResult {
  if (
    (input.action === 'reserveNew' || input.action === 'useExisting') &&
    input.needsBooktimeAuth
  ) {
    return { ok: false, reason: 'authRequired' };
  }

  if (input.action === 'useExisting') {
    if (input.selectedBookingCount < input.bookingSelectionMin) {
      return { ok: false, reason: 'bookingSelectionRequired' };
    }
    if (input.selectedBookingRecordsCount < input.selectedBookingCount) {
      return { ok: false, reason: 'bookingRecordsLoading' };
    }
    return { ok: true };
  }

  if (input.action === 'reserveNew') {
    if (input.selectedCourtCount < input.bookingSelectionMin) {
      return { ok: false, reason: 'courtSelectionRequired' };
    }
    if (input.integratedCourtCount < input.bookingSelectionMin) {
      return { ok: false, reason: 'integratedCourtSelectionRequired' };
    }
    if (!input.selectedTime) {
      return { ok: false, reason: 'timeRequired' };
    }
    if (!input.duration) {
      return { ok: false, reason: 'durationRequired' };
    }
    return { ok: true };
  }

  if (input.requiresSchedule) {
    if (!input.selectedTime) {
      return { ok: false, reason: 'timeRequired' };
    }
    if (!input.duration) {
      return { ok: false, reason: 'durationRequired' };
    }
  }

  return { ok: true };
}

export type ReservationValidationMessage = {
  key: string;
  values?: Record<string, number>;
};

export function resolveReservationValidationMessage(
  result: Exclude<ReservationValidationResult, { ok: true }>,
  bookingSelectionMin: number,
): ReservationValidationMessage {
  if (result.reason === 'authRequired') {
    return { key: 'createGame.booktime.signInToContinue' };
  }
  if (result.reason === 'bookingSelectionRequired') {
    return {
      key: 'createGame.reservationIntent.validation.selectReservations',
      values: { count: bookingSelectionMin },
    };
  }
  if (result.reason === 'bookingRecordsLoading') {
    return { key: 'createGame.reservationIntent.validation.bookingRecordsLoading' };
  }
  if (result.reason === 'courtSelectionRequired') {
    return {
      key: 'createGame.reservationIntent.validation.selectCourt',
      values: { count: bookingSelectionMin },
    };
  }
  if (result.reason === 'integratedCourtSelectionRequired') {
    return {
      key: 'createGame.reservationIntent.validation.selectBookableCourt',
      values: { count: bookingSelectionMin },
    };
  }
  if (result.reason === 'durationRequired') {
    return { key: 'createGame.reservationIntent.validation.selectDuration' };
  }
  return { key: 'createGame.reservationIntent.validation.selectTime' };
}

export function resolveCreateReservationCtaKey(input: {
  intent: ReservationIntent;
  requiredReservationCount: number;
}): { key: string; values?: Record<string, number> } {
  if (input.intent === 'reserveNow') {
    return input.requiredReservationCount > 1
      ? { key: 'createGame.reservationIntent.cta.reserveMany', values: { count: input.requiredReservationCount } }
      : { key: 'createGame.reservationIntent.cta.reserveOne' };
  }
  if (input.intent === 'useExisting') {
    return input.requiredReservationCount > 1
      ? { key: 'createGame.reservationIntent.cta.linkMany', values: { count: input.requiredReservationCount } }
      : { key: 'createGame.reservationIntent.cta.linkOne' };
  }
  if (input.intent === 'gameOnly') return { key: 'createGame.reservationIntent.cta.gameOnly' };
  return { key: 'createGame.reservationIntent.cta.manualBooked' };
}
