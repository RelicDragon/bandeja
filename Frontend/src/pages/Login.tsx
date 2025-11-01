import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input, OTPInput } from '@/components';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { config } from '@/config/media';

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
      const language = localStorage.getItem('language') || 'en';
      const response = await authApi.loginPhone({ phone, password, language });
      setAuth(response.data.user, response.data.token);
      
      if (!response.data.user.currentCity) {
        navigate('/select-city');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramAuth = async () => {
    setLoading(true);
    setError('');

    if (otp.length !== 6) {
      setError('Please enter the 6-digit code');
      setLoading(false);
      return;
    }

    try {
      const telegramId = localStorage.getItem('telegramId') || '';
      const language = localStorage.getItem('language') || 'en';
      const response = await authApi.verifyTelegramOtp({ code: otp, telegramId, language });
      setAuth(response.data.user, response.data.token);
      localStorage.removeItem('telegramId');
      
      if (!response.data.user.currentCity) {
        navigate('/select-city');
      } else {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleTelegramClick = () => {
    const telegramId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    localStorage.setItem('telegramId', telegramId);
    window.open(config.telegramBotUrl, '_blank');
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
        {t('auth.login')}
      </h2>

      <div className="flex gap-2 mb-6">
        <Button
          variant={loginType === 'telegram' ? 'primary' : 'secondary'}
          onClick={() => setLoginType('telegram')}
          className="flex-1"
        >
          Telegram
        </Button>
        <Button
          variant={loginType === 'phone' ? 'primary' : 'secondary'}
          onClick={() => setLoginType('phone')}
          className="flex-1"
        >
          {t('auth.phoneLogin')}
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {loginType === 'phone' ? (
        <form onSubmit={handlePhoneLogin} className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t('app.loading') : t('auth.login')}
          </Button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="text-center space-y-3">
            <p className="text-gray-700 dark:text-gray-300">
              {t('auth.telegramInstructions')}
            </p>
            <Button
              type="button"
              onClick={handleTelegramClick}
              className="w-full"
              variant="secondary"
            >
              🔗 {t('auth.openTelegramBot')}
            </Button>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 text-center">
              {t('auth.enterCode')}
            </label>
            <OTPInput value={otp} onChange={setOtp} disabled={loading} />
            <Button
              type="button"
              onClick={handleTelegramAuth}
              className="w-full"
              disabled={loading || otp.length !== 6}
            >
              {loading ? t('app.loading') : t('auth.login')}
            </Button>
          </div>
        </div>
      )}

      {loginType === 'phone' && (
        <p className="mt-6 text-center text-gray-600 dark:text-gray-400">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-primary-600 dark:text-primary-400 hover:underline">
            {t('auth.register')}
          </Link>
        </p>
      )}
    </AuthLayout>
  );
};
