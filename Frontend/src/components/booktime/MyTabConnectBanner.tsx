import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { booktimeApi } from '@/api/booktime';
import { useAuthStore } from '@/store/authStore';

export function MyTabConnectBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [dismissing, setDismissing] = useState(false);

  if (!user || user.booktimeConnectHintDismissed === true) return null;

  const handleDismiss = async () => {
    if (dismissing) return;
    setDismissing(true);
    try {
      const res = await booktimeApi.dismissConnectHint();
      updateUser(res.data);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(message || t('errors.generic'));
      setDismissing(false);
    }
  };

  return (
    <section className="relative mb-3 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50/80 dark:bg-primary-950/30 p-3 pr-10">
      <button
        type="button"
        onClick={() => void handleDismiss()}
        disabled={dismissing}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition hover:bg-primary-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-primary-900/50 dark:hover:text-gray-200"
        aria-label={t('common.close')}
      >
        <X className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('club.booktime.myTabConnectTitle')}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('club.booktime.myTabConnectHint')}</p>
      <button
        type="button"
        onClick={() => navigate('/profile/connected-clubs')}
        className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
      >
        {t('club.booktime.myTabConnectCta')}
      </button>
    </section>
  );
}
