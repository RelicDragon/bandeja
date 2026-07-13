import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { Club } from '@/types';
import { OTPInput } from '@/components/OTPInput';
import { useAuthStore } from '@/store/authStore';
import { PadelooClient } from '@/integrations/padeloo/client';
import { persistPadelooSessionAfterConnect } from '@/integrations/padeloo/session';
import { getPadelooClubId } from '@shared/clubIntegration';

type PadelooConnectFormProps = {
  club: Club;
  onConnected?: () => void;
  variant?: 'inline' | 'dialog';
};

const FORM_CONTROL_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-primary-400 dark:focus:ring-primary-400/20 dark:disabled:bg-gray-800/60 dark:disabled:text-gray-500';

export function PadelooConnectForm({
  club,
  onConnected,
  variant = 'dialog',
}: PadelooConnectFormProps) {
  const { t } = useTranslation();
  const padelooClubId = getPadelooClubId(club);

  const [email, setEmail] = useState(useAuthStore.getState().user?.email ?? '');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const client = useMemo(() => {
    if (padelooClubId == null) return null;
    return new PadelooClient({ padelooClubId });
  }, [padelooClubId]);

  useEffect(() => {
    setStep('email');
    setOtp('');
    setError(null);
    setBusy(false);
  }, [club.id]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

  if (padelooClubId == null || !client) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        {t('errors.generic')}
      </p>
    );
  }

  const isInline = variant === 'inline';

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await client.sendCode(email.trim());
      setStep('otp');
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('club.booktime.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 4) return;
    setError(null);
    setBusy(true);
    try {
      const result = await client.verifyCode(email.trim(), otp);
      if (!result.token || !result.user?.id) {
        throw new Error(t('club.booktime.errors.incompleteSession'));
      }
      await persistPadelooSessionAfterConnect(club.id, padelooClubId, {
        accessToken: result.token,
        externalUserId: String(result.user.id),
        email: result.user.email ?? email.trim(),
        firstName: result.user.firstName ?? null,
        lastName: result.user.lastName ?? null,
      });
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('club.booktime.errors.invalidCode'));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || busy) return;
    setError(null);
    setBusy(true);
    try {
      await client.sendCode(email.trim());
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('club.booktime.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={isInline ? 'space-y-3' : 'mt-4'}>
      {!isInline ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {t('club.padeloo.connectHint', { defaultValue: 'Sign in with your Padeloo email to link bookings.' })}
        </p>
      ) : null}

      {step === 'email' ? (
        <form onSubmit={handleEmailSubmit} className={isInline ? 'space-y-3' : 'mt-4 space-y-4'}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('club.booktime.email')}
            className={`w-full ${FORM_CONTROL_CLASS}`}
            disabled={busy}
            required
          />
          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('club.booktime.continue')}
          </button>
        </form>
      ) : null}

      {step === 'otp' ? (
        <form onSubmit={handleOtpSubmit} className={isInline ? 'space-y-3' : 'mt-4 space-y-4'}>
          <p className="text-sm text-center text-gray-600 dark:text-gray-400">
            {t('club.padeloo.otpSent', { email, defaultValue: `Code sent to ${email}` })}
          </p>
          <OTPInput value={otp} onChange={setOtp} disabled={busy} />
          {error ? <p className="text-sm text-red-600 dark:text-red-400 text-center">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || otp.length < 4}
            className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('club.booktime.verify')}
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={busy || resendCooldown > 0}
            className="w-full text-sm text-primary-600 dark:text-primary-400 disabled:opacity-50"
          >
            {resendCooldown > 0
              ? t('club.booktime.resendIn', { seconds: resendCooldown })
              : t('club.booktime.resendCode')}
          </button>
        </form>
      ) : null}
    </div>
  );
}
