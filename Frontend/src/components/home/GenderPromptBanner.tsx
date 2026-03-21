import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmationModal } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { Sparkles } from 'lucide-react';
import { GenderSetModal } from './GenderSetModal';

const GENDER_PROMPT_DISMISSED_KEY = 'genderPromptDismissed';

export function GenderPromptBanner() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [openGenderModal, setOpenGenderModal] = useState(false);
  const [openDismissConfirm, setOpenDismissConfirm] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(GENDER_PROMPT_DISMISSED_KEY) === 'true');

  if (!user || user.genderIsSet === true || dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(GENDER_PROMPT_DISMISSED_KEY, 'true');
    setDismissed(true);
    setOpenDismissConfirm(false);
  };

  const handleSaved = () => {
    localStorage.removeItem(GENDER_PROMPT_DISMISSED_KEY);
    setDismissed(false);
  };

  return (
    <>
      <div className="mb-4 w-full min-w-0">
        <div className="relative overflow-hidden rounded-2xl border border-primary-200/90 bg-white/95 shadow-sm transition dark:border-slate-700 dark:bg-slate-900/95">
          <div className="relative p-4 sm:p-5 pb-2">
            <p className="text-sm text-center text-slate-600 dark:text-slate-400">
              {t('games.genderPromptSubtitle', { defaultValue: 'To better fit games and participate in mixed-gender games, please set your gender.' })}
            </p>
            <div className="mt-3 flex justify-center">
              <Button
                variant="primary"
                size="sm"
                type="button"
                onClick={() => setOpenGenderModal(true)}
                className="inline-flex items-center gap-2 animate-pulse"
              >
                <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                {t('games.genderPromptAction', { defaultValue: 'Set gender' })}
              </Button>
            </div>
          </div>
          <div className="px-4 pb-4 pt-0 sm:px-5 sm:pb-4 text-center">
            <button
              type="button"
              onClick={() => setOpenDismissConfirm(true)}
              className="text-xs font-medium text-slate-500 underline underline-offset-2 transition hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {t('games.genderPromptDismissLink', { defaultValue: "Don't show again" })}
            </button>
          </div>
        </div>
      </div>

      <GenderSetModal
        open={openGenderModal}
        onClose={() => setOpenGenderModal(false)}
        onSaved={handleSaved}
      />

      <ConfirmationModal
        isOpen={openDismissConfirm}
        onClose={() => setOpenDismissConfirm(false)}
        onConfirm={handleDismiss}
        title={t('games.genderPromptDismissTitle', { defaultValue: "Don't show this reminder?" })}
        message={t('games.genderPromptDismissMessage', { defaultValue: 'You can still set your gender later in Profile, but some mixed-gender or gender-specific games may not be available.' })}
        confirmText={t('games.genderPromptDismissConfirm', { defaultValue: "Don't show again" })}
        cancelText={t('common.cancel')}
        confirmVariant="primary"
      />
    </>
  );
}
