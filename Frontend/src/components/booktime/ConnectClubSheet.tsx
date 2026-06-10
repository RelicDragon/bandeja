import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { Club } from '@/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { OTPInput } from '@/components/OTPInput';
import { useAuthStore } from '@/store/authStore';
import { BooktimeClient } from '@/integrations/booktime/client';
import { persistBooktimeSessionAfterConnect } from '@/integrations/booktime/session';
import { openExternalUrl } from '@/utils/openExternalUrl';

type ConnectStep = 'phone' | 'signup' | 'otp';

export type BooktimeIntegrationConfig = {
  companyId: string;
  termsUrl?: string;
  privacyUrl?: string;
};

type ConnectClubSheetProps = {
  club: Club;
  integrationConfig: BooktimeIntegrationConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: () => void;
};

function parseProfilePhone(phone: string | null | undefined): { countryCode: string; local: string } {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('381')) {
    return { countryCode: '+381', local: digits.slice(3) };
  }
  if (digits.startsWith('387')) {
    return { countryCode: '+387', local: digits.slice(3) };
  }
  if (digits.length >= 9) {
    return { countryCode: '+381', local: digits.slice(-9) };
  }
  return { countryCode: '+381', local: digits };
}

export function ConnectClubSheet({
  club,
  integrationConfig,
  open,
  onOpenChange,
  onConnected,
}: ConnectClubSheetProps) {
  const { t, i18n } = useTranslation();
  const profilePhone = useAuthStore((s) => s.user?.phone);
  const prefilled = useMemo(() => parseProfilePhone(profilePhone), [profilePhone]);

  const [step, setStep] = useState<ConnectStep>('phone');
  const [countryCode, setCountryCode] = useState(prefilled.countryCode);
  const [localPhone, setLocalPhone] = useState(prefilled.local);
  const [formattedPhone, setFormattedPhone] = useState('');
  const [firstName, setFirstName] = useState(useAuthStore.getState().user?.firstName ?? '');
  const [lastName, setLastName] = useState(useAuthStore.getState().user?.lastName ?? '');
  const [email, setEmail] = useState(useAuthStore.getState().user?.email ?? '');
  const [otp, setOtp] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const client = useMemo(
    () => new BooktimeClient({ companyId: integrationConfig.companyId }),
    [integrationConfig.companyId]
  );

  useEffect(() => {
    if (!open) return;
    setStep('phone');
    setCountryCode(prefilled.countryCode);
    setLocalPhone(prefilled.local);
    setOtp('');
    setIsNewUser(false);
    setError(null);
    setBusy(false);
  }, [open, prefilled.countryCode, prefilled.local]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = window.setTimeout(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldown]);

  const language = i18n.language?.slice(0, 2) || 'sr';

  const finishConnect = async (session: {
    accessToken: string;
    refreshToken: string;
    user?: { uuid?: string };
  }) => {
    const externalUserId = session.user?.uuid;
    if (!externalUserId) throw new Error(t('club.booktime.errors.incompleteSession'));

    await persistBooktimeSessionAfterConnect(club.id, integrationConfig.companyId, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      externalUserId,
      phoneNumber: formattedPhone,
    });

    const connectedClient = new BooktimeClient({
      companyId: integrationConfig.companyId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });
    await connectedClient.acceptCustomTerms();

    onConnected?.();
    onOpenChange(false);
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await client.startPhoneLogin(countryCode, localPhone);
      setFormattedPhone(result.phoneNumber);
      if (result.isUserExists) {
        await client.sendCode(result.phoneNumber);
        setIsNewUser(false);
        setResendCooldown(60);
        setStep('otp');
      } else {
        setIsNewUser(true);
        setStep('signup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('club.booktime.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const phone = client.formatPhone(countryCode, localPhone);
      setFormattedPhone(phone);
      await client.signUp({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        countryCode,
        phoneNumber: localPhone,
      });
      await client.sendCode(phone);
      setIsNewUser(true);
      setResendCooldown(60);
      setStep('otp');
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
      const phone = formattedPhone || client.formatPhone(countryCode, localPhone);
      const session = isNewUser
        ? await client.confirmSignUp(phone, otp, language)
        : await client.confirmLogin(phone, otp, language);
      await finishConnect(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('club.booktime.errors.invalidCode'));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || busy) return;
    const phone = formattedPhone || client.formatPhone(countryCode, localPhone);
    setError(null);
    setBusy(true);
    try {
      await client.sendCode(phone);
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('club.booktime.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const termsUrl = integrationConfig.termsUrl?.trim();
  const privacyUrl = integrationConfig.privacyUrl?.trim();

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} modalId={`booktime-connect-${club.id}`}>
      <DialogContent className="max-w-md max-h-[min(90vh,640px)] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('club.booktime.connectTitle', { club: club.name })}</DialogTitle>
        </DialogHeader>

        <div className="px-6 pb-6 overflow-y-auto flex-1 min-h-0">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('club.booktime.connectHint')}</p>

          {step === 'phone' ? (
            <form onSubmit={handlePhoneSubmit} className="mt-4 space-y-4">
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-2 text-sm"
                  disabled={busy}
                >
                  <option value="+381">+381</option>
                  <option value="+387">+387</option>
                  <option value="+385">+385</option>
                </select>
                <input
                  type="tel"
                  inputMode="tel"
                  value={localPhone}
                  onChange={(e) => setLocalPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder={t('club.booktime.phonePlaceholder')}
                  className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                  disabled={busy}
                  required
                />
              </div>
              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              <button
                type="submit"
                disabled={busy || !localPhone.trim()}
                className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('club.booktime.continue')}
              </button>
            </form>
          ) : null}

          {step === 'signup' ? (
            <form onSubmit={handleSignupSubmit} className="mt-4 space-y-3">
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('club.booktime.firstName')}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                required
                disabled={busy}
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('club.booktime.lastName')}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                required
                disabled={busy}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('club.booktime.email')}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
                required
                disabled={busy}
              />
              {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('club.booktime.createAccount')}
              </button>
            </form>
          ) : null}

          {step === 'otp' ? (
            <form onSubmit={handleOtpSubmit} className="mt-4 space-y-4">
              <p className="text-sm text-center text-gray-600 dark:text-gray-400">
                {t('club.booktime.otpSent', { phone: formattedPhone })}
              </p>
              <OTPInput value={otp} onChange={setOtp} disabled={busy} />
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                {t('club.booktime.termsPrefix')}{' '}
                {termsUrl ? (
                  <button type="button" className="text-primary-600 underline" onClick={() => openExternalUrl(termsUrl)}>
                    {t('club.booktime.termsLink')}
                  </button>
                ) : (
                  t('club.booktime.termsLink')
                )}
                {privacyUrl ? (
                  <>
                    {' '}
                    {t('club.booktime.and')}{' '}
                    <button type="button" className="text-primary-600 underline" onClick={() => openExternalUrl(privacyUrl)}>
                      {t('club.booktime.privacyLink')}
                    </button>
                  </>
                ) : null}
              </p>
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
      </DialogContent>
    </Dialog>
  );
}
