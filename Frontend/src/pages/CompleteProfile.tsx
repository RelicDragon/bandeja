import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button, Input, Select } from '@/components';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { hasValidUsername } from '@/utils/userValidation';
import { Gender } from '@/types';

export const CompleteProfile = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();

  const hasAppleSignIn = !!user?.appleSub;
  const appleProvidedName = hasAppleSignIn && (user?.firstName || user?.lastName);

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [gender, setGender] = useState<Gender>(user?.gender || 'PREFER_NOT_TO_SAY');
  const [preferNotToSayAcknowledged, setPreferNotToSayAcknowledged] = useState(
    user?.gender === 'PREFER_NOT_TO_SAY' && user?.genderIsSet === true
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isValidName = () => {
    if (appleProvidedName) {
      return true;
    }
    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    return trimmedFirst.length >= 3 || trimmedLast.length >= 3;
  };

  const isValidGender = () => {
    if (gender === 'PREFER_NOT_TO_SAY') {
      const needsAcknowledgment = !user?.genderIsSet;
      return needsAcknowledgment ? preferNotToSayAcknowledged : true;
    }
    return true;
  };

  const isValid = () => {
    return isValidName() && isValidGender();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid()) {
      setError(t('profile.invalidName'));
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const genderIsSet = gender === 'MALE' || gender === 'FEMALE' || (gender === 'PREFER_NOT_TO_SAY' && preferNotToSayAcknowledged);
      const response = await usersApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        genderIsSet,
      });

      updateUser(response.data);

      if (hasValidUsername(response.data)) {
        navigate('/');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || t('errors.generic'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <h2 className="text-2xl font-bold text-center mb-2 text-gray-900 dark:text-white">
        {t('profile.completeProfile')}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-4 mb-6">
          {appleProvidedName ? (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <p className="text-sm text-blue-800 dark:text-blue-300 mb-2">
                {t('auth.nameProvidedByApple')}
              </p>
              <div className="space-y-2">
                {firstName && (
                  <p className="text-gray-900 dark:text-white">
                    <span className="font-medium">{t('auth.firstName')}:</span> {firstName}
                  </p>
                )}
                {lastName && (
                  <p className="text-gray-900 dark:text-white">
                    <span className="font-medium">{t('auth.lastName')}:</span> {lastName}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <>
              <Input
                label={t('auth.firstName')}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t('auth.firstName')}
              />

              <Input
                label={t('auth.lastName')}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('auth.lastName')}
              />

              {!isValidName() && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('profile.nameRequirement')}
                </p>
              )}
            </>
          )}

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
              onChange={(value) => {
                setGender(value as Gender);
                if (value !== 'PREFER_NOT_TO_SAY') {
                  setPreferNotToSayAcknowledged(false);
                } else if (value === 'PREFER_NOT_TO_SAY' && user?.genderIsSet === true) {
                  setPreferNotToSayAcknowledged(true);
                }
              }}
            />
            {gender === 'PREFER_NOT_TO_SAY' && !user?.genderIsSet && (
              <div className="mt-3 flex items-start">
                <input
                  type="checkbox"
                  id="prefer-not-to-say-ack"
                  checked={preferNotToSayAcknowledged}
                  onChange={(e) => setPreferNotToSayAcknowledged(e.target.checked)}
                  className="mt-1 h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="prefer-not-to-say-ack" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  {t('profile.preferNotToSayAcknowledgment')}
                </label>
              </div>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={!isValid() || submitting}>
          {submitting ? t('app.loading') : t('common.confirm')}
        </Button>
      </form>
    </AuthLayout>
  );
};

