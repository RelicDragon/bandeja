import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input, Select } from '@/components';
import { authApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { Gender } from '@/types';

export const Register = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<Gender>('PREFER_NOT_TO_SAY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await authApi.registerPhone({
        phone,
        password,
        firstName,
        lastName,
        email: email || undefined,
        gender,
        language: i18n.language,
      });
      setAuth(response.data.user, response.data.token);
      navigate('/select-city');
    } catch (err: any) {
      setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-center mb-6 text-gray-900 dark:text-white">
        {t('auth.register')}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
        <Input
          label={t('auth.firstName')}
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
        />
        <Input
          label={t('auth.lastName')}
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
        />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('profile.gender')}
          </label>
          <Select
            options={[
              { value: 'MALE', label: t('profile.male') },
              { value: 'FEMALE', label: t('profile.female') },
              { value: 'PREFER_NOT_TO_SAY', label: t('profile.preferNotToSay') },
            ]}
            value={gender}
            onChange={(value) => setGender(value as Gender)}
          />
        </div>
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
        <Input
          label={t('auth.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('app.loading') : t('auth.register')}
        </Button>
      </form>

      <p className="mt-6 text-center text-gray-600 dark:text-gray-400">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="text-primary-600 dark:text-primary-400 hover:underline">
          {t('auth.login')}
        </Link>
      </p>
    </AuthLayout>
  );
};
