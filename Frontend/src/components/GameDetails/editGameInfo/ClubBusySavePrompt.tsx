/**
 * Save-time prompt when a picked court is busy at the club over the new time.
 *
 * The club never says whose booking it is. Most of the time it is someone
 * else's, so the main action is to pick another time or court; "I booked it
 * myself" (marks the court reserved, `REPORTED`) is the secondary choice and
 * says plainly what it does. Dismissing the dialog never claims anything.
 */
import { useTranslation } from 'react-i18next';
import { CalendarX2 } from 'lucide-react';
import { Button } from '@/components';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import type { ClubBookingConflict } from './clubBookingClaims';

type ClubBusySavePromptProps = {
  conflicts: readonly ClubBookingConflict[] | null;
  courtName: (courtId: string) => string;
  formatTime: (iso: string) => string;
  /** The safe main action: close (change the time or court / keep things as they are). */
  onPickAnother: () => void;
  /** The organizer says the club's booking is their own: mark reserved and save. */
  onClaimAndSave: (courtIds: string[]) => void;
  /** Offer "Switch to Game only" (omit when the game is already Game only). */
  onGameOnly?: () => void;
  /** Overrides for the Game-only → club booking switch. */
  message?: string;
  primaryLabel?: string;
  claimLabel?: string;
};

export function ClubBusySavePrompt({
  conflicts,
  courtName,
  formatTime,
  onPickAnother,
  onClaimAndSave,
  onGameOnly,
  message: messageOverride,
  primaryLabel,
  claimLabel,
}: ClubBusySavePromptProps) {
  const { t } = useTranslation();
  const list = conflicts ?? [];
  const message =
    messageOverride ??
    (list.length === 1
      ? t('gameDetails.courts.clubBusySaveMessage', {
          court: courtName(list[0].courtId),
          from: formatTime(list[0].start),
          to: formatTime(list[0].end),
        })
      : t('gameDetails.courts.clubBusySaveMessageMany', { courts: list.map((c) => courtName(c.courtId)).join(', ') }));

  return (
    <Dialog open={conflicts != null} onClose={onPickAnother} modalId="club-busy-save-prompt">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('gameDetails.courts.clubBusySaveTitle')}</DialogTitle>
        </DialogHeader>
        <div className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/20">
          <CalendarX2 size={24} className="text-orange-600 dark:text-orange-400" aria-hidden />
        </div>
        <DialogDescription className="p-4">{message}</DialogDescription>
        <div className="flex flex-col gap-2 px-4 pb-4" data-testid="club-busy-save-prompt">
          <Button onClick={onPickAnother} variant="primary" className="w-full">
            {primaryLabel ?? t('gameDetails.courts.clubBusySaveCancel')}
          </Button>
          <Button onClick={() => onClaimAndSave(list.map((c) => c.courtId))} variant="outline" className="w-full">
            {claimLabel ?? t('gameDetails.courts.clubBusySaveConfirm')}
          </Button>
          <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t('gameDetails.courts.clubBusySaveMineHint')}</p>
          {onGameOnly ? (
            <button
              type="button"
              onClick={onGameOnly}
              className="min-h-[44px] w-full rounded-xl text-sm font-semibold text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-900/30"
            >
              {t('gameDetails.courts.clubBusySwitchGameOnly')}
            </button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
