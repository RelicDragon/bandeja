/**
 * Plain helpers for the "When and where" editor's booking parts (kept out of
 * the .tsx files so those export components only).
 */
import type { EffectiveReschedulePlan } from './rescheduleChoices';
import { isAutomaticStep } from './rescheduleChoices';
import { runHeadline } from './rescheduleCopy';
import { clashDetailsOf, type RunJournal } from './reservationRunner';
import type { CourtReservationText } from './useCourtReservationText';

/** The run view replaces the editor while a run is on screen (a clash rollback sends the organizer back to edit). */
export function runIsShown(run: RunJournal | null): run is RunJournal {
  return run != null && !(run.phase === 'rolled_back' && clashDetailsOf(run).length > 0);
}

export function scheduleRunTitle(run: RunJournal, text: CourtReservationText): string {
  return runHeadline(run, text);
}

export function rescheduleFooterLabel(plan: EffectiveReschedulePlan, text: CourtReservationText): string {
  const { t } = text;
  switch (plan.footer.kind) {
    case 'no_changes':
      return t('move.footer.noChanges');
    case 'blocked':
      return t('move.footer.blocked');
    case 'ready':
      return t('move.footer.move', { count: plan.steps.filter(isAutomaticStep).length });
  }
}
