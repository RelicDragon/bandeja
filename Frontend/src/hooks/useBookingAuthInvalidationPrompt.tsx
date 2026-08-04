import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BookingAuthReauthToast } from '@/components/booktime/BookingAuthReauthToast';
import { onBookingAuthInvalidated } from '@/integrations/booking/bookingAuthInvalidation';
import {
  getBookingAuthReauthEntry,
  markBookingAuthNeedsReauth,
} from '@/integrations/booking/bookingAuthReauthRegistry';

const TOAST_ID = 'booking-auth-session-expired';
const TOAST_DEDUPE_MS = 8_000;

/** App-wide: unobtrusive reauth notice. Dismissible; optional path to integrations. */
export function useBookingAuthInvalidationPrompt(enabled: boolean): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const lastToastAtRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    return onBookingAuthInvalidated((event) => {
      markBookingAuthNeedsReauth(event.clubId, event.provider);
      const entry = getBookingAuthReauthEntry(event.clubId);
      const clubName = entry?.clubName?.trim();

      const now = Date.now();
      if (now - lastToastAtRef.current < TOAST_DEDUPE_MS) return;
      lastToastAtRef.current = now;

      toast.custom(
        (toastApi) => (
          <BookingAuthReauthToast
            toastId={toastApi.id}
            title={
              clubName
                ? t('club.booktime.sessionExpiredReconnectTitleNamed', { club: clubName })
                : t('club.booktime.sessionExpiredReconnectTitle')
            }
            body={t('club.booktime.sessionExpiredReconnectBody')}
            reauthorizeLabel={t('club.booktime.reauthorizeCta')}
            dismissLabel={t('club.booktime.sessionExpiredReconnectDismiss')}
            onReauthorize={() => {
              navigate('/profile/connected-clubs?tab=integrations');
            }}
          />
        ),
        {
          id: TOAST_ID,
          duration: 10_000,
          position: 'top-center',
        },
      );
    });
  }, [enabled, navigate, t]);
}
