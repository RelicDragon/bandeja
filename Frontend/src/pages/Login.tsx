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
import { signInWithGoogle } from '@/services/googleAuth.service';
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
    console.log('[APPLE_LOGIN] handleAppleSignIn called');
    
    if (!isIOS()) {
      console.log('[APPLE_LOGIN] Not iOS device, showing error');
      setError(t('auth.appleSignInOnlyIOS'));
      return;
    }

    setLoading(true);
    setError('');
    console.log('[APPLE_LOGIN] Starting Apple sign-in flow');

    try {
      console.log('[APPLE_LOGIN] Calling signInWithApple');
      const result = await signInWithApple();
      
      if (!result) {
        console.log('[APPLE_LOGIN] signInWithApple returned null (user cancelled)');
        setLoading(false);
        return;
      }

      console.log('[APPLE_LOGIN] Apple sign-in successful, processing result');
      const { result: appleResult, nonce } = result;
      const normalizedLanguage = normalizeLanguageForProfile(localStorage.getItem('language') || 'en');
      console.log('[APPLE_LOGIN] Language:', normalizedLanguage);

      // Apple provides name only on first sign-in, email is in identity token
      // Names are already normalized by appleAuth.service.ts
      const firstName = appleResult.user?.name?.firstName;
      const lastName = appleResult.user?.name?.lastName;
      
      console.log('[APPLE_LOGIN] Extracted user data:', {
        firstName: firstName || null,
        lastName: lastName || null,
        firstNameLength: firstName?.length || 0,
        lastNameLength: lastName?.length || 0,
        hasFirstName: !!firstName,
        hasLastName: !!lastName,
      });

      let response;
      try {
        console.log('[APPLE_LOGIN] Attempting login with Apple');
        response = await authApi.loginApple({
          identityToken: appleResult.identityToken,
          nonce,
          language: normalizedLanguage,
          firstName,
          lastName,
        });
        console.log('[APPLE_LOGIN] Login successful');
      } catch (loginErr: any) {
        console.log('[APPLE_LOGIN] Login failed, status:', loginErr?.response?.status);
        if (loginErr?.response?.status === 401) {
          console.log('[APPLE_LOGIN] User not found, attempting registration');
          try {
            response = await authApi.registerApple({
              identityToken: appleResult.identityToken,
              nonce,
              firstName,
              lastName,
              language: normalizedLanguage,
            });
            console.log('[APPLE_LOGIN] Registration successful');
          } catch (registerErr: any) {
            console.error('[APPLE_LOGIN] Registration failed, status:', registerErr?.response?.status);
            if (registerErr?.response?.status === 400) {
              const errorMessage = registerErr?.response?.data?.message || '';
              console.log('[APPLE_LOGIN] Registration error:', errorMessage);
              if (errorMessage.includes('appleAccountAlreadyExists') || errorMessage.includes('Apple account already exists')) {
                console.log('[APPLE_LOGIN] Account already exists, retrying login');
                response = await authApi.loginApple({
                  identityToken: appleResult.identityToken,
                  nonce,
                  language: normalizedLanguage,
                  firstName,
                  lastName,
                });
                console.log('[APPLE_LOGIN] Retry login successful');
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

      console.log('[APPLE_LOGIN] Setting auth state');
      await setAuth(response.data.user, response.data.token);

      if (!response.data.user.currentCity) {
        console.log('[APPLE_LOGIN] No city set, navigating to select-city');
        navigate('/select-city');
      } else {
        console.log('[APPLE_LOGIN] City set, navigating to home');
        navigate('/');
      }
    } catch (err: any) {
      console.error('[APPLE_LOGIN] Error in handleAppleSignIn:', err);
      
      // Check if it's a cancellation error that slipped through
      const errorMessage = String(err?.message || '');
      const errorCode = String(err?.code || err?.errorCode || '');
      const errorString = (errorMessage + errorCode).toLowerCase();
      
      if (errorString.includes('1001') || 
          errorString.includes('cancel') || 
          errorString.includes('operation couldn\'t be completed')) {
        console.log('[APPLE_LOGIN] User cancelled, not showing error');
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
      
      console.error('[APPLE_LOGIN] Final error message:', errorMsg);
      
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
      console.log('[APPLE_LOGIN] handleAppleSignIn completed');
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
              if (errorMessage.includes('already exists')) {
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

      if (!response.data.user.currentCity) {
        navigate('/select-city');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      const errorMessage = String(err?.message || '');
      const errorCode = String(err?.code || err?.errorCode || '');
      const errorString = (errorMessage + errorCode).toLowerCase();
      
      if (errorString.includes('cancel') || 
          errorString.includes('cancelled') || 
          errorString.includes('dismissed')) {
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

      {/* Social Sign In Buttons */}
      <div className="mt-6">
        <div className="relative flex items-center">
          <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
          <span className="px-4 text-sm text-slate-500 dark:text-slate-400">{t('auth.or')}</span>
          <div className="flex-grow border-t border-slate-300 dark:border-slate-600"></div>
        </div>
        
        {/* Google Sign In Button */}
        <Button
          type="button"
          variant="secondary"
          onClick={handleGoogleSignIn}
          className="w-full h-12 mt-6 text-base font-medium !bg-gray-50 hover:!bg-gray-100 !text-slate-900 !border-2 !border-slate-300 dark:!bg-slate-600 dark:hover:!bg-slate-500 dark:!text-slate-100 dark:!border-slate-500 !shadow-md"
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
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <g fill="none" fillRule="evenodd">
                  <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.348 6.173 0 7.55 0 9c0 1.45.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </g>
              </svg>
              {t('auth.googleSignIn')}
            </span>
          )}
        </Button>

        {/* Apple Sign In Button (iOS only) */}
        {isIOS() && (
          <Button
            type="button"
            onClick={handleAppleSignIn}
            className="w-full h-12 mt-4 text-base font-medium bg-black hover:bg-gray-800 text-white dark:bg-white dark:hover:bg-gray-100 dark:text-black"
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
        )}
      </div>

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
