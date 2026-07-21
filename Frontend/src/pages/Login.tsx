import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { OTPInput, TelegramIcon } from '@/components';
import { AppStoreDownloadButtons } from '@/components/AppStoreDownloadButtons';
import { PhoneSignInCard } from '@/components/auth';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { config } from '@/config/media';
import { ArrowLeft, Phone, AlertCircle } from 'lucide-react';
import { signInWithApple } from '@/services/appleAuth.service';
import {
  loginWithGoogleCredentials,
  recoverAndroidGoogleLoginFromNative,
  signInWithGoogle,
  type GoogleAuthResult,
} from '@/services/googleAuth.service';
import pushNotificationService from '@/services/pushNotificationService';
import { isIOS, isCapacitor, isAndroid, getAppInfo } from '@/utils/capacitor';
import { App } from '@capacitor/app';
import { openEula } from '@/utils/openEula';
import { AppleIcon } from '@/components/AppleIcon';
import { normalizeLanguageForProfile } from '@/utils/displayPreferences';
import { extractApiErrorMessage } from '@/utils/extractApiErrorMessage';

type LoginTab = 'main' | 'phone';

const btnBase =
  'w-[280px] max-w-full mx-auto h-12 rounded-xl font-semibold transition-all duration-200 active:scale-[0.98] disabled:active:scale-100 flex items-center justify-center gap-3';

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [tab, setTab] = useState<LoginTab>('main');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [telegramHint, setTelegramHint] = useState(false);
  const [telegramOtpCode, setTelegramOtpCode] = useState('');
  const [appVersion, setAppVersion] = useState<{ version: string; buildNumber: string } | null>(null);
  const [searchParams] = useSearchParams();
  const isWeb = !isCapacitor();
  const isTelegramOtpMode = tab === 'main' && telegramHint;

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  useEffect(() => {
    if (isCapacitor()) {
      getAppInfo().then((info) => {
        if (info) setAppVersion({ version: info.version, buildNumber: String(info.buildNumber) });
      });
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const completeGoogleSession = useCallback(async (result: GoogleAuthResult) => {
    const response = await loginWithGoogleCredentials(result);
    await setAuth(response.data.user, response.data.token, {
      refreshToken: response.data.refreshToken,
      currentSessionId: response.data.currentSessionId,
    });
    await pushNotificationService.ensureTokenSentToBackend();
    navigate('/', { replace: true });
  }, [navigate, setAuth]);

  useEffect(() => {
    if (!isAndroid() || isAuthenticated) return;

    let cancelled = false;
    let recoveryInFlight = false;

    const tryRecoverAndroidGoogleLogin = async () => {
      if (cancelled || recoveryInFlight || useAuthStore.getState().isAuthenticated) return;
      recoveryInFlight = true;
      setLoading(true);
      setError('');
      try {
        const recovered = await recoverAndroidGoogleLoginFromNative();
        if (!recovered || cancelled) return;
        await completeGoogleSession(recovered);
      } catch (err: unknown) {
        if (!cancelled && !isCancelError(err)) {
          setError(extractApiErrorMessage(err, t));
        }
      } finally {
        recoveryInFlight = false;
        if (!cancelled) setLoading(false);
      }
    };

    void tryRecoverAndroidGoogleLogin();

    let listenerHandle: { remove: () => void } | null = null;
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void tryRecoverAndroidGoogleLogin();
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      cancelled = true;
      listenerHandle?.remove();
    };
  }, [completeGoogleSession, isAuthenticated, t]);

  // Handle Google OAuth redirect return (?google_code= or ?google_error=)
  useEffect(() => {
    const googleCode = searchParams.get('google_code');
    const googleError = searchParams.get('google_error');

    // Clean query params from URL
    if (googleCode || googleError) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (googleCode) {
      setLoading(true);
      setError('');
      authApi.exchangeGoogleCode({ code: googleCode })
        .then(async (response) => {
          await setAuth(response.data.user, response.data.token, {
            refreshToken: response.data.refreshToken,
            currentSessionId: response.data.currentSessionId,
          });
          await pushNotificationService.ensureTokenSentToBackend();
          navigate('/');
        })
        .catch((err: any) => {
          if (!isCancelError(err)) setError(extractApiErrorMessage(err, t));
        })
        .finally(() => setLoading(false));
    } else if (googleError && googleError !== 'access_denied') {
      setError(t('auth.googleSignInFailed') || 'Google sign-in failed');
    }
  }, [searchParams, setAuth, navigate, t]);

  const goToTab = (next: LoginTab) => setTab(next);

  const handleBack = () => setTab('main');

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const response = await authApi.loginPhone({ phone, password, language: normalizedLanguage });
      await setAuth(response.data.user, response.data.token, {
        refreshToken: response.data.refreshToken,
        currentSessionId: response.data.currentSessionId,
      });
      await pushNotificationService.ensureTokenSentToBackend();
      navigate('/');
    } catch (err: any) {
      setError(extractApiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const openTelegramLogin = () => {
    const url = config.telegramBotUrl.includes('?')
      ? `${config.telegramBotUrl}&start=login`
      : `${config.telegramBotUrl}?start=login`;
    window.open(url, '_blank');
  };

  const handleTelegramClick = () => {
    openTelegramLogin();
    setTelegramHint(true);
    setTelegramOtpCode('');
    setError('');
  };

  const handleTelegramOpenAgain = () => {
    openTelegramLogin();
    setError('');
  };

  const handleTelegramCancel = () => {
    if (loading) return;
    setTelegramHint(false);
    setTelegramOtpCode('');
    setError('');
  };

  const handleTelegramOtpChange = (value: string) => {
    setTelegramOtpCode(value.replace(/\D/g, '').slice(0, 6));
  };

  const handleTelegramOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = telegramOtpCode.trim();
    if (code.length !== 6) {
      setError(t('auth.enterCodeRequired'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const response = await authApi.verifyTelegramOtp({ code, language: normalizedLanguage });
      await setAuth(response.data.user, response.data.token, {
        refreshToken: response.data.refreshToken,
        currentSessionId: response.data.currentSessionId,
      });
      await pushNotificationService.ensureTokenSentToBackend();
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(extractApiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (!isIOS()) {
      setError(t('auth.appleSignInOnlyIOS'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await signInWithApple();
      if (!result) {
        setLoading(false);
        return;
      }
      const { result: appleResult, nonce } = result;
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const firstName = appleResult.user?.name?.firstName;
      const lastName = appleResult.user?.name?.lastName;
      const response = await authApi.loginApple({
        identityToken: appleResult.identityToken,
        nonce,
        language: normalizedLanguage,
        firstName,
        lastName,
      });
      await setAuth(response.data.user, response.data.token, {
        refreshToken: response.data.refreshToken,
        currentSessionId: response.data.currentSessionId,
      });
      await pushNotificationService.ensureTokenSentToBackend();
      navigate('/');
    } catch (err: any) {
      if (!isCancelError(err)) setError(extractApiErrorMessage(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    const clearLoadingTimer = setTimeout(() => setLoading(false), 5000);
    try {
      const result = await signInWithGoogle({
        onUiOpened: () => {
          clearTimeout(clearLoadingTimer);
          setLoading(false);
        },
      });
      if (!result) {
        return;
      }
      clearTimeout(clearLoadingTimer);
      setLoading(true);
      await completeGoogleSession(result);
    } catch (err: any) {
      clearTimeout(clearLoadingTimer);
      if (!isCancelError(err)) setError(extractApiErrorMessage(err, t));
    } finally {
      clearTimeout(clearLoadingTimer);
      setLoading(false);
    }
  };

  const loadingSpinner = (
    <span className="flex items-center justify-center gap-2">
      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {t('app.loading')}
    </span>
  );

  return (
    <AuthLayout>
      <div className="flex flex-col">
        <div className="overflow-hidden transition-[height] duration-300 ease-out">
          <AnimatePresence initial={false} mode="wait">
            {tab === 'main' && !telegramHint && (
              <motion.div
                key="main"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {error && <ErrorBanner error={error} />}
                {isWeb ? (
                  <button
                    type="button"
                    onClick={() => {
                      const lang = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
                      window.location.href = `/api/auth/google/redirect?lang=${encodeURIComponent(lang)}`;
                    }}
                    disabled={loading}
                    className={`${btnBase} bg-white dark:bg-slate-700/90 text-slate-800 dark:text-slate-100 border-2 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700`}
                  >
                    {loading ? loadingSpinner : <><GoogleIcon /><span>{t('auth.googleSignIn')}</span></>}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className={`${btnBase} bg-white dark:bg-slate-700/90 text-slate-800 dark:text-slate-100 border-2 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700`}
                  >
                    {loading ? loadingSpinner : <><GoogleIcon /><span>{t('auth.googleSignIn')}</span></>}
                  </button>
                )}
                {isIOS() && (
                  <button
                    type="button"
                    onClick={handleAppleSignIn}
                    disabled={loading}
                    className={`${btnBase} bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-50`}
                  >
                    {loading ? loadingSpinner : <><AppleIcon size={20} /><span>{t('auth.appleSignIn')}</span></>}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleTelegramClick}
                  className={`${btnBase} bg-gradient-to-r from-[#0088cc] to-[#0099dd] hover:from-[#007ab8] hover:to-[#0088cc] text-white`}
                >
                  <TelegramIcon size={20} className="text-white" />
                  <span>{t('auth.telegramLogin')}</span>
                </button>
                <div className="flex w-[280px] max-w-full mx-auto items-center gap-3 py-0.5">
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t('auth.or')}
                  </span>
                  <div className="h-px flex-1 bg-slate-200 dark:bg-slate-600" />
                </div>
                <button
                  type="button"
                  onClick={() => goToTab('phone')}
                  className={`${btnBase} bg-white/70 dark:bg-slate-800/60 text-slate-700 dark:text-slate-100 border border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-white dark:hover:bg-slate-800`}
                >
                  <Phone size={18} strokeWidth={2.25} className="text-slate-500 dark:text-slate-300" />
                  <span>{t('auth.legacyPhoneSignIn')}</span>
                </button>
              </motion.div>
            )}

            {tab === 'main' && telegramHint && (
              <motion.div
                key="telegram-otp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {error && <ErrorBanner error={error} />}
                <form
                  onSubmit={handleTelegramOtpSubmit}
                  className="mx-auto w-full max-w-sm space-y-5 rounded-2xl border border-sky-100 bg-white/95 p-5 text-slate-800 shadow-[0_18px_45px_rgba(14,116,144,0.14)] dark:border-sky-500/20 dark:bg-slate-900/90 dark:text-slate-100 dark:shadow-none"
                >
                  <div className="flex min-h-12 items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={handleTelegramCancel}
                      disabled={loading}
                      className="inline-flex items-center gap-1 rounded-full py-1.5 pr-3 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"
                    >
                      <ArrowLeft size={16} />
                      {t('common.back')}
                    </button>
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0088cc] text-white shadow-lg shadow-sky-600/20">
                      <TelegramIcon size={24} className="text-white" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-xl font-bold leading-tight text-slate-900 dark:text-white">
                      {t('auth.followInstructionsInTelegram')}
                    </h2>
                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {t('auth.telegramOtpFallbackHint')}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <OTPInput
                      value={telegramOtpCode}
                      onChange={handleTelegramOtpChange}
                      disabled={loading}
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={loading || telegramOtpCode.length !== 6}
                      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0088cc] px-4 text-sm font-bold text-white shadow-lg shadow-sky-600/20 transition-all hover:bg-[#007ab8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0088cc] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none dark:focus-visible:ring-offset-slate-900"
                    >
                      {loading ? loadingSpinner : t('auth.telegramOtpSubmit')}
                    </button>
                    <button
                      type="button"
                      onClick={handleTelegramOpenAgain}
                      disabled={loading}
                      className="w-full rounded-xl py-2 text-sm font-semibold text-[#0088cc] transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-sky-950/40"
                    >
                      {t('auth.openTelegramBot')}
                    </button>
                  </div>
                </form>
              </motion.div>
            )}

            {tab === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <PhoneSignInCard
                  phone={phone}
                  password={password}
                  loading={loading}
                  loadingLabel={loadingSpinner}
                  errorSlot={error ? <ErrorBanner error={error} /> : undefined}
                  onPhoneChange={setPhone}
                  onPasswordChange={setPassword}
                  onBack={handleBack}
                  onSubmit={handlePhoneLogin}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!isTelegramOtpMode && tab === 'main' && (
          <>
            {isWeb && <AppStoreDownloadButtons className="mt-3" />}
            <p className="mt-3 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400 shrink-0">
              {t('auth.byContinuing') || 'By continuing, you agree to our'}{' '}
              <br />
              <a
                href="/eula/world/eula.html"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium transition-colors underline decoration-2 underline-offset-2"
                onClick={(e) => {
                  e.preventDefault();
                  openEula();
                }}
              >
                {t('auth.eula') || 'Terms of Service'}
              </a>
            </p>
          </>
        )}
        {appVersion && !isTelegramOtpMode && tab === 'main' && (
          <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
            App Version: {appVersion.version} (Build {appVersion.buildNumber})
          </p>
        )}
      </div>
    </AuthLayout>
  );
};

function ErrorBanner({ error }: { error: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="flex items-center gap-3 p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-xl"
    >
      <AlertCircle size={18} className="shrink-0" />
      <span className="text-sm font-medium">{error}</span>
    </motion.div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <g fill="none" fillRule="evenodd">
        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
        <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.55 0 9c0 1.45.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </g>
    </svg>
  );
}

function isCancelError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || err?.errorCode || '').toLowerCase();
  const s = msg + code;
  return s.includes('cancel') || s.includes('cancelled') || s.includes('dismissed') || s.includes('1001') || s.includes("operation couldn't be completed");
}
