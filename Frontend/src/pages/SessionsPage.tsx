import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import toast from 'react-hot-toast';
import { ArrowLeft, Loader2, LogOut, Monitor } from 'lucide-react';
import { authApi } from '@/api';
import { Button, Card, ConfirmationModal } from '@/components';
import { getCurrentSessionIdSync } from '@/services/refreshTokenPersistence';
import { useAuthStore } from '@/store/authStore';
import { formatRelativeTime } from '@/utils/dateFormat';
import type { AuthSessionRow } from '@/types';

function sessionPlatformLabel(platform: string, t: TFunction): string {
  const raw = platform.trim();
  const k = raw.toLowerCase();
  if (k === 'web' || k === 'ios' || k === 'android') {
    return t(`profile.sessionsPlatforms.${k}`);
  }
  if (k === 'unknown' || !k) {
    return t('profile.sessionsPlatforms.unknown');
  }
  const cap = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return t(`profile.sessionsPlatforms.${k}`, { defaultValue: cap });
}

export function SessionsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storeLogout = useAuthStore((s) => s.logout);
  const [sessions, setSessions] = useState<AuthSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [signingOutAll, setSigningOutAll] = useState(false);
  const currentId = getCurrentSessionIdSync();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi.getSessions();
      setSessions(res.data?.sessions ?? []);
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      const res = await authApi.revokeSession(id);
      if (res.data?.revokedCurrentWebRefresh) {
        await storeLogout();
        navigate('/login', { replace: true });
        return;
      }
      toast.success(t('profile.sessionsRevoked'));
      await load();
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setBusyId(null);
    }
  };

  const signOutAll = async () => {
    setSigningOutAll(true);
    try {
      await authApi.logoutAllSessions();
      toast.success(t('profile.sessionsSignedOutAll'));
      setConfirmAll(false);
      await storeLogout();
      navigate('/login', { replace: true });
    } catch {
      toast.error(t('errors.generic'));
    } finally {
      setSigningOutAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-safe">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
          {t('profile.sessionsPageTitle')}
        </h1>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        <Card className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('profile.sessionsSubtitle')}
          </p>
          <Button
            variant="danger"
            className="w-full rounded-xl flex items-center justify-center gap-2"
            onClick={() => setConfirmAll(true)}
            disabled={signingOutAll || sessions.length === 0}
          >
            {signingOutAll ? <Loader2 className="animate-spin shrink-0" size={18} /> : <LogOut size={18} className="shrink-0" />}
            {t('profile.sessionsSignOutAll')}
          </Button>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-primary-600" size={32} />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
            {t('profile.sessionsEmpty')}
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const isCurrent = currentId && s.id === currentId;
              return (
                <li key={s.id}>
                  <Card className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300">
                        <Monitor size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                          <span>{sessionPlatformLabel(s.platform, t)}</span>
                          {isCurrent ? (
                            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                              {t('profile.sessionsCurrent')}
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 space-y-0.5">
                          <div>
                            {t('profile.sessionsLastActiveLine', {
                              time: formatRelativeTime(s.lastUsedAt),
                            })}
                          </div>
                          {s.ip ? (
                            <div className="truncate">{t('profile.sessionsIp', { ip: s.ip })}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    {!isCurrent ? (
                      <Button
                        variant="ghost"
                        className="shrink-0 self-stretch sm:self-center w-full sm:w-auto rounded-xl border border-red-200/90 text-red-700 hover:bg-red-50 dark:border-red-800/90 dark:text-red-300 dark:hover:bg-red-950/50 justify-center gap-2 px-4 py-2.5 font-medium"
                        onClick={() => revoke(s.id)}
                        disabled={busyId === s.id}
                      >
                        {busyId === s.id ? (
                          <Loader2 className="animate-spin shrink-0" size={16} />
                        ) : (
                          <LogOut size={16} className="shrink-0" />
                        )}
                        {t('profile.sessionsRevoke')}
                      </Button>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={() => {
          void signOutAll();
        }}
        title={t('profile.sessionsSignOutAll')}
        message={t('profile.sessionsSignOutAllConfirm')}
        confirmText={t('profile.sessionsSignOutAll')}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        isLoading={signingOutAll}
        loadingText={t('profile.sessionsSigningOut')}
      />
    </div>
  );
}
