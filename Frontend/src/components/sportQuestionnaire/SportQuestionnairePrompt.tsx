import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Sparkles, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api';
import { Button, ConfirmationModal } from '@/components';
import { Sports, type Sport } from '@shared/sport';
import { getSportConfig } from '@/sport/sportRegistry';
import { useQuestionnaireStatus } from '@/hooks/useQuestionnaireStatus';
import { shouldSuggestSportQuestionnaire } from '@/utils/sportQuestionnaire';
import { findSportProfile, getDisplayLevelForSport } from '@/utils/profileSports';
import { SportQuestionnaireSheet } from './SportQuestionnaireSheet';

type SportQuestionnairePromptProps = {
  sport: Sport;
};

export function SportQuestionnairePrompt({ sport }: SportQuestionnairePromptProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { status, refresh } = useQuestionnaireStatus(sport);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dismissConfirmOpen, setDismissConfirmOpen] = useState(false);
  const [skipLoading, setSkipLoading] = useState(false);

  if (!user || user.cityIsSet !== true) return null;
  if (!shouldSuggestSportQuestionnaire(user, sport, status)) return null;

  const level = status?.level ?? findSportProfile(user, sport)?.level ?? getDisplayLevelForSport(user, sport);
  const levelLabel = Number.isFinite(level) ? level.toFixed(1) : '—';
  const sportLabel = t(getSportConfig(sport).labelKey);
  const usePadelHomeCopy = sport === Sports.PADEL;

  const handleDismissForever = async () => {
    setSkipLoading(true);
    try {
      const res =
        sport === Sports.PADEL
          ? await usersApi.skipWelcomeScreen()
          : await usersApi.skipSportQuestionnaire(sport);
      updateUser(res.data);
      setDismissConfirmOpen(false);
      void refresh();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('errors.generic');
      toast.error(msg);
    } finally {
      setSkipLoading(false);
    }
  };

  return (
    <>
      <div className="mb-5 w-full min-w-0">
        <div className="relative overflow-hidden rounded-[1.35rem] border border-sky-200/90 bg-white/95 shadow-sm dark:border-slate-600/90 dark:bg-slate-900/95">
          <button
            type="button"
            onClick={() => setDismissConfirmOpen(true)}
            className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/90 bg-white/90 text-slate-500 dark:border-slate-600 dark:bg-slate-800/95 dark:text-slate-400"
            aria-label={t(usePadelHomeCopy ? 'home.questionnaireDismissLink' : 'sportQuestionnaire.common.homeDismissLink')}
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden />
          </button>
          <div className="relative flex flex-col gap-4 p-5 pb-2 pt-10 sm:flex-row sm:items-center sm:gap-5 sm:p-6 sm:pb-2 sm:pt-10">
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-[1.05rem] font-semibold leading-snug text-slate-900 dark:text-white sm:text-lg">
                {usePadelHomeCopy
                  ? t('home.questionnaireCtaTitle')
                  : t('sportQuestionnaire.common.homeCtaTitle', { sport: sportLabel })}
              </p>
              <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-slate-600 dark:text-slate-400 sm:mx-0 sm:text-sm">
                {usePadelHomeCopy
                  ? t('home.questionnaireCtaSubtitle')
                  : t('sportQuestionnaire.common.homeCtaSubtitle')}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center sm:items-end">
              <Button
                variant="primary"
                size="md"
                type="button"
                onClick={() => setSheetOpen(true)}
                className="inline-flex items-center gap-2"
              >
                <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                {usePadelHomeCopy
                  ? t('home.questionnaireCtaAction')
                  : t('sportQuestionnaire.common.homeCtaAction')}
              </Button>
              <button
                type="button"
                onClick={() => setDismissConfirmOpen(true)}
                className="mt-2 text-center text-xs font-medium text-slate-500 underline decoration-slate-400/70 underline-offset-2 dark:text-slate-500"
              >
                {usePadelHomeCopy
                  ? t('home.questionnaireDismissLink')
                  : t('sportQuestionnaire.common.homeDismissLink')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {dismissConfirmOpen && (
        <ConfirmationModal
          isOpen
          closeOnConfirm={false}
          isLoading={skipLoading}
          loadingText={t('app.loading')}
          title={t(usePadelHomeCopy ? 'home.questionnaireDismissTitle' : 'sportQuestionnaire.common.homeDismissTitle')}
          message={t(
            usePadelHomeCopy ? 'home.questionnaireDismissMessage' : 'sportQuestionnaire.common.homeDismissMessage',
            { level: levelLabel },
          )}
          confirmText={t(
            usePadelHomeCopy ? 'home.questionnaireDismissConfirm' : 'sportQuestionnaire.common.homeDismissConfirm',
          )}
          confirmVariant="primary"
          onConfirm={handleDismissForever}
          onClose={() => !skipLoading && setDismissConfirmOpen(false)}
        />
      )}

      <SportQuestionnaireSheet
        sport={sport}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCompleted={(updated) => {
          updateUser(updated);
          void refresh();
        }}
      />
    </>
  );
}
