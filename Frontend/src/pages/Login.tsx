import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input, OTPInput } from '@/components';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { config } from '@/config/media';
import { Send, Phone, AlertCircle } from 'lucide-react';
import { signInWithApple } from '@/services/appleAuth.service';
import { isIOS } from '@/utils/capacitor';
import { AppleIcon } from '@/components/AppleIcon';
import { normalizeLanguageForProfile } from '@/utils/displayPreferences';

export const Login = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [loginType, setLoginType] = useState<'phone' | 'telegram'>('telegram');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handlePhoneLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      const response = await authApi.loginPhone({ phone, password, language: normalizedLanguage });
      await setAuth(response.data.user, response.data.token);
      
      if (!response.data.user.currentCity) {
        navigate('/select-city');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      let errorMsg = '';
      
      if (err?.response?.data?.message) {
        const key = err.response.data.message;
        errorMsg = t(key) !== key ? t(key) : key;
      } else if (err?.response?.data) {
        errorMsg = JSON.stringify(err.response.data);
      } else if (err?.response) {
        errorMsg = `Error ${err.response.status}: ${err.response.statusText}`;
      } else if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') {
        errorMsg = 'Network unavailable';
      } else if (err?.message && err.message !== 'Network Error') {
        errorMsg = err.message;
      } else {
        errorMsg = t('errors.generic');
      }
      
      if (import.meta.env.DEV) {
        const requestUrl = err?.config?.url ? `${err.config.baseURL || ''}${err.config.url}` : 'unknown';
        const method = err?.config?.method?.toUpperCase() || 'unknown';
        const errorCode = err?.code || 'no code';
        const errorMessage = err?.message || 'no message';
        setError(`${errorMsg} | ${method} ${requestUrl} | Code: ${errorCode} | ${errorMessage}`);
      } else {
        setError(errorMsg);
      }
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
      localStorage.removeItem('telegramId');
      
      if (!response.data.user.currentCity) {
        navigate('/select-city');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      let errorMsg = '';
      
      if (err?.response?.data?.message) {
        const key = err.response.data.message;
        errorMsg = t(key) !== key ? t(key) : key;
      } else if (err?.response?.data) {
        errorMsg = JSON.stringify(err.response.data);
      } else if (err?.response) {
        errorMsg = `Error ${err.response.status}: ${err.response.statusText}`;
      } else if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') {
        errorMsg = 'Network unavailable';
      } else if (err?.message && err.message !== 'Network Error') {
        errorMsg = err.message;
      } else {
        errorMsg = t('errors.generic');
      }
      
      if (import.meta.env.DEV) {
        const requestUrl = err?.config?.url ? `${err.config.baseURL || ''}${err.config.url}` : 'unknown';
        const method = err?.config?.method?.toUpperCase() || 'unknown';
        const errorCode = err?.code || 'no code';
        const errorMessage = err?.message || 'no message';
        setError(`${errorMsg} | ${method} ${requestUrl} | Code: ${errorCode} | ${errorMessage}`);
      } else {
        setError(errorMsg);
      }
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

      let response;
      try {
        const firstName = appleResult.user?.name?.firstName;
        const lastName = appleResult.user?.name?.lastName;
        
        response = await authApi.loginApple({
          identityToken: appleResult.identityToken,
          nonce,
          language: normalizedLanguage,
          firstName,
          lastName,
        });
      } catch (loginErr: any) {
        if (loginErr?.response?.status === 401) {
          const firstName = appleResult.user?.name?.firstName;
          const lastName = appleResult.user?.name?.lastName;

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
                const firstName = appleResult.user?.name?.firstName;
                const lastName = appleResult.user?.name?.lastName;
                
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

      if (!response.data.user.currentCity) {
        navigate('/select-city');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      // Check if it's a cancellation error that slipped through
      const errorMessage = String(err?.message || '');
      const errorCode = String(err?.code || err?.errorCode || '');
      const errorString = (errorMessage + errorCode).toLowerCase();
      
      if (errorString.includes('1001') || 
          errorString.includes('cancel') || 
          errorString.includes('operation couldn\'t be completed')) {
        // User cancelled - don't show error
        setLoading(false);
        return;
      }
      
      let errorMsg = '';
      
      if (err?.response?.data?.message) {
        const key = err.response.data.message;
        errorMsg = t(key) !== key ? t(key) : key;
      } else if (err?.response?.data) {
        errorMsg = JSON.stringify(err.response.data);
      } else if (err?.response) {
        errorMsg = `Error ${err.response.status}: ${err.response.statusText}`;
      } else if (err?.code === 'ERR_NETWORK' || err?.code === 'ECONNABORTED') {
        errorMsg = 'Network unavailable';
      } else if (err?.message && err.message !== 'Network Error') {
        errorMsg = err.message;
      } else {
        errorMsg = t('errors.generic');
      }
      
      if (import.meta.env.DEV) {
        const requestUrl = err?.config?.url ? `${err.config.baseURL || ''}${err.config.url}` : 'unknown';
        const method = err?.config?.method?.toUpperCase() || 'unknown';
        const errorCode = err?.code || 'no code';
        const errorMessage = err?.message || 'no message';
        setError(`${errorMsg} | ${method} ${requestUrl} | Code: ${errorCode} | ${errorMessage}`);
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-semibold text-center text-slate-800 dark:text-white mb-2">
        {t('auth.login')}
      </h2>

      {/* Tab Switcher */}
      <div className="relative flex p-1 mb-8 bg-slate-100 dark:bg-slate-700/50 rounded-xl">
        <div 
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-slate-600 rounded-lg shadow-sm transition-transform duration-300 ease-out"
          style={{ transform: loginType === 'telegram' ? 'translateX(0)' : 'translateX(calc(100% + 8px))' }}
        />
        <button
          type="button"
          onClick={() => setLoginType('telegram')}
          className={`flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            loginType === 'telegram' 
              ? 'text-slate-800 dark:text-white' 
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Send size={16} />
          Telegram
        </button>
        <button
          type="button"
          onClick={() => setLoginType('phone')}
          className={`flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            loginType === 'phone' 
              ? 'text-slate-800 dark:text-white' 
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Phone size={16} />
          {t('auth.phoneLogin')}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 text-red-700 dark:text-red-400 rounded-xl">
          <AlertCircle size={18} className="shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Phone Login Form */}
      {loginType === 'phone' && (
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
          <Button 
            type="submit" 
            className="w-full h-12 text-base font-medium" 
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('app.loading')}
              </span>
            ) : t('auth.login')}
          </Button>
        </form>
      )}

      {/* Telegram Login */}
      {loginType === 'telegram' && (
        <form onSubmit={(e) => { e.preventDefault(); if (otp.length === 6) handleTelegramAuth(); }} className="space-y-6">
          {/* Step 1: Open Bot */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm font-semibold shrink-0">
                1
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('auth.telegramInstructions')}
              </p>
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleTelegramClick}
                className="flex items-center justify-center gap-2 py-3 px-4 bg-[#0088cc] hover:bg-[#0077b5] text-white rounded-xl font-medium transition-colors"
                style={{ width: 'calc(6 * 2.75rem + 5 * 0.5rem)' }}
              >
                <Send size={18} />
                {t('auth.openTelegramBot')}
              </button>
            </div>
          </div>

          {/* Step 2: Enter Code */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 text-sm font-semibold shrink-0">
                2
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t('auth.enterCode')}
              </p>
            </div>
            <OTPInput value={otp} onChange={setOtp} disabled={loading} />
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full h-12 text-base font-medium"
            disabled={loading || otp.length !== 6}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('app.loading')}
              </span>
            ) : t('auth.login')}
          </Button>
        </form>
      )}

      {/* Apple Sign In Button (iOS only) */}
      {isIOS() && (
        <div className="mt-6">
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
            <span className="px-4 text-sm text-slate-500 dark:text-slate-400">{t('auth.or')}</span>
            <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
          </div>
          <Button
            type="button"
            onClick={handleAppleSignIn}
            className="w-full h-12 mt-6 text-base font-medium bg-black hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-100 dark:text-black"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('app.loading')}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <AppleIcon size={18} />
                {t('auth.appleSignIn')}
              </span>
            )}
          </Button>
        </div>
      )}

      {/* Register Link */}
      {loginType === 'phone' && (
        <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {t('auth.noAccount')}{' '}
          <Link 
            to="/register" 
            className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors"
          >
            {t('auth.register')}
          </Link>
        </p>
      )}

      {/* EULA Link */}
      <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
        {t('auth.byContinuing') || 'By continuing, you agree to our'}{' '}
        <a
          href="/eula/world/eula.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors underline"
          onClick={(e) => {
            e.preventDefault();
            window.open('/eula/world/eula.html', '_blank');
          }}
        >
          {t('auth.eula') || 'Terms of Service'}
        </a>
      </p>
    </AuthLayout>
  );
};
