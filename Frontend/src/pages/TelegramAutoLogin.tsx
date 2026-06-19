import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import pushNotificationService from '@/services/pushNotificationService';
import { normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { AppLoadingScreen } from '@/components';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import { verifyTelegramLinkKeySingleflight } from '@/services/telegramLinkVerifySingleflight';
import { isLegacyAccessJwt } from '@/utils/jwtPayload';
import { withTelegramVerifyRetries } from '@/utils/telegramVerifyRetry';

export const TelegramAutoLogin = () => {
  const { telegramKey } = useParams<{ telegramKey: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!telegramKey || telegramKey.length < 20) {
      toast.error(t('auth.invalidCode'));
      navigate('/login', { replace: true });
      return;
    }

    let showErrorIfCancelled = true;

    (async () => {
      try {
        const language = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
        const { isAuthenticated, token, logout } = useAuthStore.getState();
        const withAuth = !!(isAuthenticated && token && !isLegacyAccessJwt(token));

        if (!withAuth && isAuthenticated) {
          await logout();
        }

        const response = await withTelegramVerifyRetries(() =>
          verifyTelegramLinkKeySingleflight(telegramKey, language, {
            withAuth,
          })
        );

        await setAuth(response.data.user, response.data.token, {
          refreshToken: response.data.refreshToken,
          currentSessionId: response.data.currentSessionId,
        });

        try {
          await pushNotificationService.ensureTokenSentToBackend();
        } catch {
          /* non-blocking */
        }

        setDone(true);
        navigate('/', { replace: true });
      } catch (err: unknown) {
        if (!showErrorIfCancelled) return;
        toast.error(extractApiErrorMessage(err, t));
        navigate('/login', { replace: true });
      }
    })();

    return () => {
      showErrorIfCancelled = false;
    };
  }, [telegramKey, navigate, t, setAuth]);

  return <AppLoadingScreen isInitializing={!done} />;
};
