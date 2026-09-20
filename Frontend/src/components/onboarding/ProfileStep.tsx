import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { AvatarUpload } from '@/components/AvatarUpload';
import { mediaApi, usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { OnboardingFrame, type OnboardingStepChrome } from './OnboardingFrame';
import {
  ONBOARDING_NAME_MAX_LENGTH,
  validateOnboardingFirstName,
  validateOnboardingLastName,
} from './nameValidation';

/**
 * PRD 350 step 2b — Name and photo (conditional).
 *
 * Only reached when the account has no display name or no avatar, so a
 * Telegram/SSO user who arrives complete never sees it. The photo uses the
 * existing `AvatarUpload` (which wraps `AvatarCropModal`) and is skippable; the
 * name is not.
 */
export function ProfileStep(chrome: OnboardingStepChrome) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const firstNameId = useId();
  const lastNameId = useId();
  const errorId = useId();

  const [firstName, setFirstName] = useState(() => user?.firstName ?? '');
  const [lastName, setLastName] = useState(() => user?.lastName ?? '');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const firstNameError = validateOnboardingFirstName(firstName);
  const lastNameError = validateOnboardingLastName(lastName);
  const error = firstNameError ?? lastNameError;
  const showError = touched && error !== null;

  const handleAvatarUpload = async (avatarFile: File, originalFile: File) => {
    try {
      const response = await mediaApi.uploadAvatar(avatarFile, originalFile);
      if (user) {
        updateUser({
          ...user,
          avatar: response.avatarUrl,
          originalAvatar: response.originalAvatarUrl,
        });
      }
    } catch (uploadError) {
      const message =
        (uploadError as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('onboarding.errors.saveFailed');
      toast.error(message);
    }
  };

  const handleContinue = async () => {
    setTouched(true);
    if (error || saving) return;
    setSaving(true);
    try {
      const response = await usersApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        nameIsSet: true,
      });
      updateUser(response.data);
      chrome.onAdvance();
    } catch (saveError) {
      const message =
        (saveError as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('onboarding.errors.saveFailed');
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingFrame
      {...chrome}
      step="profile"
      title={t('onboarding.profile.title')}
      subtitle={t('onboarding.profile.subtitle')}
      primaryLabel={t('onboarding.profile.continue')}
      primaryDisabled={touched && error !== null}
      primaryBusy={saving}
      onPrimary={() => void handleContinue()}
    >
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <AvatarUpload
            currentAvatar={user?.avatar ?? undefined}
            onUpload={handleAvatarUpload}
            sizeClassName="h-28 w-28"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('onboarding.profile.photoOptional')}
          </p>
        </div>

        <div className="w-full space-y-3">
          <div>
            <label
              htmlFor={firstNameId}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('onboarding.profile.firstNameLabel')}
            </label>
            <input
              id={firstNameId}
              type="text"
              autoComplete="given-name"
              enterKeyHint="next"
              maxLength={ONBOARDING_NAME_MAX_LENGTH}
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={showError && firstNameError !== null}
              aria-describedby={showError ? errorId : undefined}
              data-testid="onboarding-first-name"
              className="min-h-[3rem] w-full rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div>
            <label
              htmlFor={lastNameId}
              className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {t('onboarding.profile.lastNameLabel')}
            </label>
            <input
              id={lastNameId}
              type="text"
              autoComplete="family-name"
              enterKeyHint="done"
              maxLength={ONBOARDING_NAME_MAX_LENGTH}
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              onBlur={() => setTouched(true)}
              data-testid="onboarding-last-name"
              className="min-h-[3rem] w-full rounded-xl border border-gray-300 bg-white px-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {showError ? (
            <p
              id={errorId}
              role="alert"
              data-testid="onboarding-name-error"
              className="text-sm font-medium text-red-600 dark:text-red-400"
            >
              {t(error as string)}
            </p>
          ) : null}
        </div>
      </div>
    </OnboardingFrame>
  );
}
