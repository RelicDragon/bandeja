import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, CityModal, ConfirmationModal } from '@/components';
import { usersApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import { MapPin, X } from 'lucide-react';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';

const CITY_PROMPT_DISMISSED_KEY = 'cityPromptDismissed';

export function CityPromptBanner() {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const [openCityModal, setOpenCityModal] = useState(false);
  const [openDismissConfirm, setOpenDismissConfirm] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(CITY_PROMPT_DISMISSED_KEY) === 'true');

  if (!user || user.cityIsSet === true || dismissed) return null;

  const cityLabel =
    user.currentCity != null
      ? translateCity(user.currentCity.id, user.currentCity.name, user.currentCity.country)
      : null;

  const handleDismiss = () => {
    localStorage.setItem(CITY_PROMPT_DISMISSED_KEY, 'true');
    setDismissed(true);
    setOpenDismissConfirm(false);
  };

  const handleCityChanged = () => {
    localStorage.removeItem(CITY_PROMPT_DISMISSED_KEY);
    setDismissed(false);
  };

  const handleConfirmCorrect = async () => {
    setConfirming(true);
    try {
      const response = await usersApi.updateProfile({ cityIsSet: true });
      updateUser(response.data);
      localStorage.removeItem(CITY_PROMPT_DISMISSED_KEY);
      setDismissed(false);
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || t('errors.generic'));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <>
      <div className="mb-4 w-full min-w-0">
        <div className="relative overflow-hidden rounded-2xl border border-primary-200/90 bg-white/95 shadow-sm transition dark:border-slate-700 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={() => setOpenDismissConfirm(true)}
            className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-500 shadow-sm backdrop-blur-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            aria-label={t('games.cityPromptDismissLink')}
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <div className="relative px-4 pb-4 pt-10 sm:px-6 sm:pb-5">
            <p className="text-sm text-center text-slate-600 dark:text-slate-400">
              {cityLabel != null
                ? t('games.cityPromptSubtitle', { cityName: cityLabel })
                : t('games.cityPromptSubtitleNoCity')}
            </p>
            <div className="mt-3 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => setOpenCityModal(true)}
                className="inline-flex items-center justify-center gap-2 animate-pulse"
              >
                <MapPin className="h-4 w-4 shrink-0" aria-hidden />
                {cityLabel != null
                  ? t('games.cityPromptAction', { cityName: cityLabel })
                  : t('games.cityPromptActionNoCity')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={handleConfirmCorrect}
                disabled={confirming}
                className="inline-flex items-center justify-center"
              >
                {confirming ? t('app.loading') : t('games.cityPromptConfirm')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CityModal
        isOpen={openCityModal}
        onClose={() => setOpenCityModal(false)}
        onCityChanged={handleCityChanged}
      />

      <ConfirmationModal
        isOpen={openDismissConfirm}
        onClose={() => setOpenDismissConfirm(false)}
        onConfirm={handleDismiss}
        title={t('games.cityPromptDismissTitle')}
        message={t('games.cityPromptDismissMessage')}
        confirmText={t('games.cityPromptDismissConfirm')}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
      />
    </>
  );
}
