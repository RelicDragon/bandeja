import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { Club } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { KlikterenClient } from '@/integrations/klikteren/client';
import { persistKlikterenSessionAfterConnect } from '@/integrations/klikteren/session';
import { getKlikterenVenueId } from '@shared/clubIntegration';

type KlikterenConnectFormProps = {
  club: Club;
  onConnected?: () => void;
  variant?: 'inline' | 'dialog';
};

const FORM_CONTROL_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500 dark:focus:border-primary-400 dark:focus:ring-primary-400/20 dark:disabled:bg-gray-800/60 dark:disabled:text-gray-500';

export function KlikterenConnectForm({
  club,
  onConnected,
  variant = 'dialog',
}: KlikterenConnectFormProps) {
  const { t } = useTranslation();
  const klikterenVenueId = getKlikterenVenueId(club);

  const [email, setEmail] = useState(useAuthStore.getState().user?.email ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const client = useMemo(() => {
    if (!klikterenVenueId) return null;
    return new KlikterenClient({ klikterenVenueId });
  }, [klikterenVenueId]);

  useEffect(() => {
    setPassword('');
    setError(null);
    setBusy(false);
  }, [club.id]);

  if (!klikterenVenueId || !client) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        {t('errors.generic')}
      </p>
    );
  }

  const isInline = variant === 'inline';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const loginRes = await client.login(email.trim(), password);
      let accessToken = loginRes.access_token ?? null;
      if (!accessToken) {
        const sessionRes = await client.getSession();
        accessToken = sessionRes.access_token ?? null;
      }
      if (!accessToken) {
        throw new Error(t('club.booktime.errors.incompleteSession'));
      }
      client.applyToken(accessToken);
      const me = await client.getMe();
      if (!me?.id) {
        throw new Error(t('club.booktime.errors.incompleteSession'));
      }
      await persistKlikterenSessionAfterConnect(club.id, klikterenVenueId, {
        accessToken,
        externalUserId: String(me.id),
        email: me.email ?? email.trim(),
        firstName: me.firstName ?? null,
        lastName: me.lastName ?? null,
      });
      onConnected?.();
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
          {t('club.klikteren.connectHint', { defaultValue: 'Sign in with your Klikteren email and password.' })}
        </p>
      ) : null}

      <form onSubmit={handleSubmit} className={isInline ? 'space-y-3' : 'mt-4 space-y-4'}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('club.booktime.email')}
          className={`w-full ${FORM_CONTROL_CLASS}`}
          disabled={busy}
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('club.klikteren.password', { defaultValue: 'Password' })}
          className={`w-full ${FORM_CONTROL_CLASS}`}
          disabled={busy}
          required
        />
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !email.trim() || !password}
          className="w-full rounded-lg bg-primary-600 text-white py-2.5 text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('club.booktime.continue')}
        </button>
      </form>
    </div>
  );
}
