import type { TFunction } from 'i18next';
import type { OrganizerHint } from './organizerNextActionsTypes';

/**
 * PRD 364 — the sentence and the button label of each hint, as plain functions
 * so the rows can be asserted without rendering. Attendance reuses the PRD 346
 * strings verbatim: the row *is* the strip, moved, and its copy must not drift.
 */
export function organizerHintSentence(hint: OrganizerHint, t: TFunction): string {
  switch (hint.key) {
    case 'seats': {
      const needed = t('organizerNextActions.seats.needed', { count: hint.needed });
      if (hint.waiting <= 0) return needed;
      return `${needed} · ${t('organizerNextActions.seats.waiting', { count: hint.waiting })}`;
    }
    case 'booking':
      return hint.state === 'none'
        ? t('organizerNextActions.booking.notBooked')
        : t('organizerNextActions.booking.partlyBooked');
    case 'attendance':
      return t('attendance.organizer.progress', {
        confirmed: hint.confirmed,
        total: hint.total,
      });
    case 'cost':
      return t('organizerNextActions.cost.unpaid', { count: hint.unpaid });
  }
}

export function organizerHintActionLabel(hint: OrganizerHint, t: TFunction): string {
  switch (hint.key) {
    case 'seats':
      return hint.action === 'reviewQueue'
        ? t('organizerNextActions.seats.reviewQueue')
        : t('organizerNextActions.seats.invite');
    case 'booking':
      return hint.action === 'seeBookings'
        ? t('organizerNextActions.booking.seeBookings')
        : t('organizerNextActions.booking.editCourt');
    case 'attendance':
      return t('attendance.organizer.nudge');
    case 'cost':
      return hint.action === 'settle'
        ? t('organizerNextActions.cost.settle')
        : t('organizerNextActions.cost.review');
  }
}

/** The small line under the sentence; only the attendance cooldown has one. */
export function organizerHintCaption(hint: OrganizerHint, t: TFunction): string | null {
  if (hint.key === 'attendance' && !hint.nudgeAllowed) {
    return t('attendance.organizer.nudgeCooldown', {
      hours: Math.max(1, hint.nudgeRemainingHours),
    });
  }
  return null;
}
