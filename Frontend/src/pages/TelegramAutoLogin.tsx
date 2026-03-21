import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import pushNotificationService from '@/services/pushNotificationService';
import { normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { AppLoadingScreen } from '@/components';

function extractError(err: any, t: (k: string) => string): string {
  if (err?.response?.data?.message) {
    const key = err.response.data.message;
    return t(key) !== key ? t(key) : key;
  }
  if (err?.response?.data) return JSON.stringify(err.response.data);
  if (err?.response) return `Error ${err.response.status}: ${err.response.statusText}`;
  if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') return 'Network unavailable';
  if (err?.message && err.message !== 'Network Error') return err.message;
  return t('errors.generic');
}

export const TelegramAutoLogin = () => {
  const { telegramKey } = useParams<{ telegramKey: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [done, setDone] = useState(false);
  const requestStartedRef = useRef(false);

  useEffect(() => {
    if (!telegramKey || telegramKey.length < 20) {
      toast.error(t('auth.invalidCode'));
      navigate('/login', { replace: true });
      return;
    }
    if (requestStartedRef.current) return;
    requestStartedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        const language = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
        const response = await authApi.verifyTelegramLinkKey({ key: telegramKey, language });
        if (cancelled) return;
        await setAuth(response.data.user, response.data.token);
        await pushNotificationService.ensureTokenSentToBackend();
        setDone(true);
        navigate('/', { replace: true });
      } catch (err: any) {
        if (cancelled) return;
        toast.error(extractError(err, t));
        navigate('/login', { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [telegramKey, navigate, t, setAuth]);

  return <AppLoadingScreen isInitializing={!done} />;
};
