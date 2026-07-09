import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import pushNotificationService from '@/services/pushNotificationService';
import { normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { AppLoadingScreen } from '@/components';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';
import { verifyTelegramLinkKeySingleflight } from '@/services/telegramLinkVerifySingleflight';
import { getOAuthLinkMergeRequired } from '@/utils/oauthAccountLink';
import { isLegacyAccessJwt } from '@/utils/jwtPayload';
import { withTelegramVerifyRetries } from '@/utils/telegramVerifyRetry';
import { AuthLayout } from '@/layouts/AuthLayout';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { isCapacitor } from '@/utils/capacitor';
import {
  buildTelegramAppFallbackUrl,
  buildTelegramAndroidIntentUrl,
  isAndroidUserAgent,
  shouldAutoOpenTelegramApp,
  shouldUseTelegramAppHandoff,
} from '@/utils/telegramAppHandoff';

function isAndroidBrowser(): boolean {
  return typeof navigator !== 'undefined' && isAndroidUserAgent(navigator.userAgent);
}

export const TelegramAutoLogin = () => {
  const { telegramKey } = useParams<{ telegramKey: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [done, setDone] = useState(false);
  const [mergeKey, setMergeKey] = useState<string | null>(null);
  const [isConfirmingMerge, setIsConfirmingMerge] = useState(false);
  const startedKeyRef = useRef<string | null>(null);
  const tRef = useRef(t);
  const useAppHandoff = shouldUseTelegramAppHandoff(
    searchParams,
    isCapacitor(),
    isAndroidBrowser()
  );
  const autoOpenApp = useAppHandoff && shouldAutoOpenTelegramApp(searchParams);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!telegramKey || !autoOpenApp) return;
    if (!isAndroidBrowser()) return;

    const fallbackUrl = buildTelegramAppFallbackUrl(window.location.origin, telegramKey);
    window.location.href = buildTelegramAndroidIntentUrl(
      window.location.origin,
      telegramKey,
      fallbackUrl
    );
  }, [telegramKey, autoOpenApp]);

  useEffect(() => {
    if (!telegramKey || telegramKey.length < 20) {
      toast.error(tRef.current('auth.invalidCode'));
      navigate('/login', { replace: true });
      return;
    }

    if (useAppHandoff) return;

    if (startedKeyRef.current === telegramKey) return;
    startedKeyRef.current = telegramKey;
    setDone(false);

    let cancelled = false;

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

        setDone(true);
        navigate('/', { replace: true });
        void pushNotificationService.ensureTokenSentToBackend().catch(() => {});
      } catch (err: unknown) {
        if (cancelled) return;
        startedKeyRef.current = null;
        if (getOAuthLinkMergeRequired(err) === 'telegram') {
          setMergeKey(telegramKey);
          return;
        }
        toast.error(extractApiErrorMessage(err, tRef.current));
        navigate('/login', { replace: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [telegramKey, navigate, setAuth, useAppHandoff]);

  const handleConfirmTelegramMerge = async () => {
    if (!mergeKey) return;
    try {
      setIsConfirmingMerge(true);
      const language = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const { isAuthenticated, token, logout } = useAuthStore.getState();
      const withAuth = !!(isAuthenticated && token && !isLegacyAccessJwt(token));

      if (!withAuth && isAuthenticated) {
        await logout();
      }
      if (!withAuth) {
        toast.error(tRef.current('auth.telegramLinkRequiresLogin'));
        setMergeKey(null);
        navigate('/login', { replace: true });
        return;
      }

      const response = await verifyTelegramLinkKeySingleflight(mergeKey, language, {
        withAuth,
        confirmMerge: true,
      });

      await setAuth(response.data.user, response.data.token, {
        refreshToken: response.data.refreshToken,
        currentSessionId: response.data.currentSessionId,
      });

      setDone(true);
      setMergeKey(null);
      navigate('/', { replace: true });
      void pushNotificationService.ensureTokenSentToBackend().catch(() => {});
    } catch (err: unknown) {
      toast.error(extractApiErrorMessage(err, tRef.current));
    } finally {
      setIsConfirmingMerge(false);
    }
  };

  if (telegramKey && useAppHandoff) {
    const continueInBrowser = () => {
      navigate(`/login/${telegramKey}?tg_web=1`, { replace: true });
    };
    const openApp = () => {
      const fallbackUrl = buildTelegramAppFallbackUrl(window.location.origin, telegramKey);
      window.location.href = isAndroidBrowser()
        ? buildTelegramAndroidIntentUrl(window.location.origin, telegramKey, fallbackUrl)
        : `/login/${telegramKey}`;
    };

    return (
      <AuthLayout>
        <div className="space-y-5 text-center">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {t('auth.openingBandejaApp', { defaultValue: 'Opening Bandeja app...' })}
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {t('auth.telegramAppHandoffHint', {
                defaultValue:
                  'If the app did not open automatically, tap Open app again. Continue in browser only if you want to sign in on the web.',
              })}
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={openApp}
              className="mx-auto flex h-12 w-[280px] max-w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white transition active:scale-[0.98] dark:bg-primary-500"
            >
              {t('auth.openBandejaApp', { defaultValue: 'Open Bandeja app' })}
            </button>
            <button
              type="button"
              onClick={continueInBrowser}
              className="mx-auto flex h-11 w-[280px] max-w-full items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {t('auth.continueInBrowser', { defaultValue: 'Continue in browser' })}
            </button>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <>
      <AppLoadingScreen isInitializing={!done && !mergeKey} />
      <ConfirmationModal
        isOpen={Boolean(mergeKey)}
        onClose={() => {
          if (isConfirmingMerge) return;
          setMergeKey(null);
          navigate('/profile', { replace: true });
        }}
        onConfirm={handleConfirmTelegramMerge}
        title={t('profile.oauthMergeTitle')}
        message={t('profile.oauthMergeMessageTelegram')}
        confirmText={isConfirmingMerge ? t('profile.oauthMergeMerging') : t('profile.oauthMergeConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
        isLoading={isConfirmingMerge}
        closeOnConfirm={false}
      />
    </>
  );
};
