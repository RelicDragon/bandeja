import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/Button';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/Dialog';
import { bookingListClubRowToClub, type BookingListClubRow } from '@/hooks/connectedBookingClubs';
import { createHydratedClubBookingProvider } from '@/integrations/booking/createClubBookingProvider';
import { removeMissingBooking } from '@/services/gameBooking/removeMissingBooking';
import { BooktimeBookingActionButton } from './BooktimeBookingActionButton';

type Props = {
  bookingId: string;
  club: BookingListClubRow;
  disabled?: boolean;
  onRemoved?: () => void;
};

export function VerifyBookingButton({ bookingId, club, disabled, onRemoved }: Props) {
  const { t } = useTranslation();
  const [busyPhase, setBusyPhase] = useState<'checking' | 'removing' | null>(null);
  const busy = busyPhase !== null;
  const busyRef = useRef(false);
  const [result, setResult] = useState<'booked' | 'missing' | null>(null);

  const verify = async (removeIfMissing = false) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyPhase('checking');
    let removing = false;
    try {
      const provider = await createHydratedClubBookingProvider(bookingListClubRowToClub(club));
      if (!provider?.verifyBooking) throw new Error('Booking verification unavailable');
      const booked = await provider.verifyBooking(bookingId);
      if (booked) {
        setResult('booked');
      } else if (removeIfMissing) {
        removing = true;
        setBusyPhase('removing');
        await removeMissingBooking(bookingId);
        setResult(null);
        toast.success(t('club.booktime.removeMissingSuccess'));
        onRemoved?.();
      } else {
        setResult('missing');
      }
    } catch {
      toast.error(t(removing ? 'club.booktime.removeMissingFailed' : 'club.booktime.verifyFailed'));
    } finally {
      busyRef.current = false;
      setBusyPhase(null);
    }
  };

  return (
    <>
      <BooktimeBookingActionButton disabled={disabled || busy} onClick={() => void verify()}>
        {busy ? <Loader2 size={12} className="animate-spin" aria-hidden /> : <ShieldCheck size={12} aria-hidden />}
        {t(busyPhase === 'removing' ? 'common.deleting' : busy ? 'club.booktime.verifyingBooking' : 'club.booktime.verifyBooking')}
      </BooktimeBookingActionButton>
      <Dialog open={result === 'booked'} onClose={() => setResult(null)} modalId={`booking-verified-${bookingId}`}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('club.booktime.stillBookedTitle')}</DialogTitle>
          </DialogHeader>
          <DialogDescription className="py-4">{t('club.booktime.stillBookedBody')}</DialogDescription>
          <DialogFooter>
            <Button onClick={() => setResult(null)}>{t('common.ok')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmationModal
        isOpen={result === 'missing'}
        onClose={() => !busyRef.current && setResult(null)}
        title={t('club.booktime.removeMissingTitle')}
        message={t('club.booktime.removeMissingBody')}
        confirmText={t('club.booktime.removeMissingConfirm')}
        confirmVariant="danger"
        isLoading={busy}
        loadingText={t(busyPhase === 'checking' ? 'club.booktime.verifyingBooking' : 'common.deleting')}
        closeOnConfirm={false}
        onConfirm={() => void verify(true)}
      />
    </>
  );
}
