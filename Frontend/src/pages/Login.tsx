import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Input, OTPInput, Button } from '@/components';
import { AuthBackHeader } from '@/components/auth';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { config } from '@/config/media';
import { Send, Phone, AlertCircle } from 'lucide-react';
import { TelegramIcon } from '@/components';
import { signInWithApple } from '@/services/appleAuth.service';
import { signInWithGoogle } from '@/services/googleAuth.service';
import pushNotificationService from '@/services/pushNotificationService';
import { isIOS, isCapacitor, getAppInfo } from '@/utils/capacitor';
import { openEula } from '@/utils/openEula';
import { AppleIcon } from '@/components/AppleIcon';
import { normalizeLanguageForProfile } from '@/utils/displayPreferences';

type LoginTab = 'main' | 'telegram' | 'phone';

const btnBase =
  'w-full h-12 rounded-xl font-semibold transition-all duration-200 active:scale-[0.98] disabled:active:scale-100 flex items-center justify-center gap-3';

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [tab, setTab] = useState<LoginTab>('main');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appVersion, setAppVersion] = useState<{ version: string; buildNumber: string } | null>(null);

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

  const goToTab = (next: LoginTab) => setTab(next);

  const handleBack = () => {
    if (tab === 'telegram') setOtp('');
    setTab('main');
  };

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const response = await authApi.loginPhone({ phone, password, language: normalizedLanguage });
      await setAuth(response.data.user, response.data.token);
      await pushNotificationService.ensureTokenSentToBackend();
      if (!response.data.user.currentCity) navigate('/select-city');
      else navigate('/');
    } catch (err: any) {
      setError(extractError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramAuth = async () => {
    setLoading(true);
    setError('');
    if (otp.length !== 6) {
      setError(t('auth.enterCodeRequired'));
      setLoading(false);
      return;
    }
    try {
      const telegramId = localStorage.getItem('telegramId') || '';
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const response = await authApi.verifyTelegramOtp({ code: otp, telegramId, language: normalizedLanguage });
      await setAuth(response.data.user, response.data.token);
      await pushNotificationService.ensureTokenSentToBackend();
      localStorage.removeItem('telegramId');
      if (!response.data.user.currentCity) navigate('/select-city');
      else navigate('/');
    } catch (err: any) {
      setError(extractError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramClick = () => {
    const telegramId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('telegramId', telegramId);
    window.open(config.telegramBotUrl, '_blank');
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
      let response;
      try {
        response = await authApi.loginApple({
          identityToken: appleResult.identityToken,
          nonce,
          language: normalizedLanguage,
          firstName,
          lastName,
        });
      } catch (loginErr: any) {
        if (loginErr?.response?.status === 401) {
          try {
            response = await authApi.registerApple({
              identityToken: appleResult.identityToken,
              nonce,
              firstName,
              lastName,
              language: normalizedLanguage,
            });
          } catch (registerErr: any) {
            if (registerErr?.response?.status === 400) {
              const errorMessage = registerErr?.response?.data?.message || '';
              if (errorMessage.includes('appleAccountAlreadyExists') || errorMessage.includes('Apple account already exists')) {
                response = await authApi.loginApple({
                  identityToken: appleResult.identityToken,
                  nonce,
                  language: normalizedLanguage,
                  firstName,
                  lastName,
                });
              } else {
                throw registerErr;
              }
            } else {
              throw registerErr;
            }
          }
        } else {
          throw loginErr;
        }
      }
      await setAuth(response.data.user, response.data.token);
      await pushNotificationService.ensureTokenSentToBackend();
      if (!response.data.user.currentCity) navigate('/select-city');
      else navigate('/');
    } catch (err: any) {
      if (!isCancelError(err)) setError(extractError(err, t));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await signInWithGoogle();
      if (!result) {
        setLoading(false);
        return;
      }
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const profile = result.profile;
      let response;
      try {
        response = await authApi.loginGoogle({
          idToken: result.idToken,
          language: normalizedLanguage,
          firstName: profile?.givenName,
          lastName: profile?.familyName,
        });
      } catch (loginErr: any) {
        if (loginErr?.response?.status === 401) {
          try {
            response = await authApi.registerGoogle({
              idToken: result.idToken,
              firstName: profile?.givenName,
              lastName: profile?.familyName,
              language: normalizedLanguage,
            });
          } catch (registerErr: any) {
            if (registerErr?.response?.status === 400) {
              const errorMessage = registerErr?.response?.data?.message || '';
              if (errorMessage.includes('googleAccountAlreadyExists')) {
                response = await authApi.loginGoogle({
                  idToken: result.idToken,
                  language: normalizedLanguage,
                  firstName: profile?.givenName,
                  lastName: profile?.familyName,
                });
              } else {
                throw registerErr;
              }
            } else {
              throw registerErr;
            }
          }
        } else if (loginErr?.response?.status === 403) {
          throw loginErr;
        } else {
          throw loginErr;
        }
      }
      await setAuth(response.data.user, response.data.token);
      await pushNotificationService.ensureTokenSentToBackend();
      if (!response.data.user.currentCity) navigate('/select-city');
      else navigate('/');
    } catch (err: any) {
      if (!isCancelError(err)) setError(extractError(err, t));
    } finally {
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
        <div className="overflow-hidden transition-[height] duration-300 ease-out min-h-[220px]">
          <AnimatePresence initial={false} mode="wait">
            {tab === 'main' && (
              <motion.div
                key="main"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {error && <ErrorBanner error={error} />}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className={`${btnBase} bg-white dark:bg-slate-700/90 text-slate-800 dark:text-slate-100 border-2 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700`}
                >
                  {loading ? loadingSpinner : <><GoogleIcon /><span>{t('auth.googleSignIn')}</span></>}
                </button>
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
                  onClick={() => goToTab('telegram')}
                  className={`${btnBase} bg-gradient-to-r from-[#0088cc] to-[#0099dd] hover:from-[#007ab8] hover:to-[#0088cc] text-white`}
                >
                  <TelegramIcon size={20} className="text-white" />
                  <span>{t('auth.telegramLogin')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => goToTab('phone')}
                  className="w-full h-11 flex items-center justify-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-700/60 rounded-xl transition-all"
                >
                  <Phone size={16} />
                  <span>{t('auth.legacyPhoneSignIn')}</span>
                </button>
              </motion.div>
            )}

            {tab === 'telegram' && (
              <motion.div
                key="telegram"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AuthBackHeader title={t('auth.telegramLogin')} onBack={handleBack} backLabel={t('common.back')} />
                {error && <ErrorBanner error={error} />}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (otp.length === 6) handleTelegramAuth();
                  }}
                  className="space-y-6"
                >
                  <div>
                    <div className="flex items-center gap-3 mb-3.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-[#0088cc] to-[#0099dd] text-white text-sm font-bold shrink-0">1</span>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('auth.telegramInstructions')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleTelegramClick}
                      className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 bg-gradient-to-r from-[#0088cc] to-[#0099dd] hover:from-[#007ab8] hover:to-[#0088cc] text-white rounded-xl font-semibold transition-all active:scale-[0.98]"
                    >
                      <Send size={18} />
                      {t('auth.openTelegramBot')}
                    </button>
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-3.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gradient-to-br from-[#0088cc] to-[#0099dd] text-white text-sm font-bold shrink-0">2</span>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('auth.enterCode')}</p>
                    </div>
                    <OTPInput value={otp} onChange={setOtp} disabled={loading} />
                  </div>
                  <Button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full h-12"
                  >
                    {loading ? loadingSpinner : t('auth.login')}
                  </Button>
                </form>
              </motion.div>
            )}

            {tab === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <AuthBackHeader title={t('auth.legacyPhoneSignIn')} onBack={handleBack} backLabel={t('common.back')} />
                {error && <ErrorBanner error={error} />}
                <form onSubmit={handlePhoneLogin} className="space-y-5">
                  <Input
                    label={t('auth.phone')}
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1234567890"
                    required
                  />
                  <Input
                    label={t('auth.password')}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <Button type="submit" disabled={loading} className="w-full h-12">
                    {loading ? loadingSpinner : t('auth.login')}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400 shrink-0">
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
        {appVersion && (
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
      className="flex items-center gap-3 mb-6 p-4 bg-red-50 dark:bg-red-950/50 border-2 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 rounded-xl"
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

function isCancelError(err: any): boolean {
  const msg = String(err?.message || '').toLowerCase();
  const code = String(err?.code || err?.errorCode || '').toLowerCase();
  const s = msg + code;
  return s.includes('cancel') || s.includes('cancelled') || s.includes('dismissed') || s.includes('1001') || s.includes("operation couldn't be completed");
}
