import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Club } from '@/types';
import { weltnerApi } from '@/api/weltner';
import { useAuthStore } from '@/store/authStore';

export function WeltnerConnectForm({
  club,
  onConnected,
}: {
  club: Club;
  onConnected?: () => void;
}) {
  const { t } = useTranslation();
  const profilePhone = useAuthStore((s) => s.user?.phone);
  const userId = useAuthStore((state) => state.user?.id);
  const requestKey = `${userId}:${club.id}:${profilePhone}`;
  const [draft, setDraft] = useState({ key: requestKey, phone: profilePhone ?? '' });
  const phone = draft.key === requestKey ? draft.phone : profilePhone ?? '';
  const generation = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const guard = generation;
    ++guard.current;
    setBusy(false);
    setError(false);
    setLoading(true);
    setDraft({ key: requestKey, phone: profilePhone ?? '' });
    if (!userId) { setLoading(false); return; }
    void weltnerApi
      .getAuth(club.id)
      .then((res) => {
        if (active && res.data?.phoneNumber) setDraft({ key: requestKey, phone: res.data.phoneNumber });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      guard.current++;
    };
  }, [club.id, profilePhone, userId, requestKey]);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!userId || busy || loading || draft.key !== requestKey) return;
        const epoch = generation.current;
        setBusy(true);
        setError(false);
        try {
          await weltnerApi.putAuth(club.id, phone);
          if (epoch === generation.current) onConnected?.();
        } catch {
          if (epoch === generation.current) setError(true);
        } finally {
          if (epoch === generation.current) setBusy(false);
        }
      }}
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('weltner.contactHint', { club: club.name })}
      </p>
      <label className="block text-sm">
        {t('weltner.phone')}
        <input
          disabled={!userId || loading || busy || draft.key !== requestKey}
          type="tel"
          autoComplete="tel"
          required
          maxLength={40}
          value={phone}
          onChange={(e) => setDraft({ key: requestKey, phone: e.target.value })}
          placeholder="+381…"
          className="mt-1 w-full rounded-lg border bg-transparent p-3"
        />
      </label>
      {error && draft.key === requestKey && (
        <p role="alert" className="text-sm text-red-600">
          {t('weltner.saveFailed')}
        </p>
      )}
      <button
        disabled={!userId || busy || loading || draft.key !== requestKey}
        className="w-full rounded-lg bg-primary-600 px-4 py-3 text-white disabled:opacity-50"
      >
        {t(busy ? 'weltner.saving' : 'weltner.savePhone')}
      </button>
    </form>
  );
}
