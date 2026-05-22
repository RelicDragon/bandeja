import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import type { Sport, User } from '@/types';
import { Button } from '@/components';
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from '@/components/ui/Drawer';
import { getSportConfig } from '@/sport/sportRegistry';
import { getSportPublicIcon } from '@/sport/sportPublicIcon';
import { sportHasQuestionnaire } from '@/sport/sportQuestionnaireRegistry';
import { usersApi } from '@/api';
import { SportQuestionnaireSheet } from './SportQuestionnaireSheet';

type AddSportQuestionnairePromptProps = {
  sport: Sport | null;
  onClose: () => void;
  onUserUpdated: (user: User) => void;
};

export function AddSportQuestionnairePrompt({
  sport,
  onClose,
  onUserUpdated,
}: AddSportQuestionnairePromptProps) {
  const { t } = useTranslation();
  const [skipLoading, setSkipLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!sport || !sportHasQuestionnaire(sport)) return null;

  const sportConfig = getSportConfig(sport);
  const sportInLevel = t(sportConfig.inLevelLabelKey);
  const open = sport != null;

  const handleSkip = async () => {
    setSkipLoading(true);
    try {
      const res = await usersApi.skipSportQuestionnaire(sport);
      onUserUpdated(res.data);
      onClose();
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        t('errors.generic');
      toast.error(message);
    } finally {
      setSkipLoading(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
        <DrawerContent className="overflow-hidden border-0 bg-white px-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] dark:bg-slate-900">
          <div
            className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-slate-300/90 dark:bg-slate-600"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-sky-50 via-sky-50/40 to-transparent dark:from-sky-950/50 dark:via-sky-950/20"
            aria-hidden
          />
          <div className="relative flex flex-col gap-6 px-6 pt-4">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div
                  className="absolute inset-0 scale-110 rounded-2xl bg-sky-400/25 blur-2xl dark:bg-sky-500/20"
                  aria-hidden
                />
                <img
                  src={getSportPublicIcon(sport)}
                  alt=""
                  className="relative h-16 w-16 object-contain drop-shadow-sm"
                  draggable={false}
                />
              </div>
              <DrawerTitle className="text-[1.2rem] font-semibold leading-snug tracking-tight text-slate-900 dark:text-white">
                {t('sportQuestionnaire.common.addSportTitle', { sport: sportInLevel })}
              </DrawerTitle>
              <DrawerDescription className="mt-2 max-w-[18rem] text-[0.9rem] leading-relaxed text-slate-600 dark:text-slate-400">
                {t('sportQuestionnaire.common.addSportSubtitle')}
              </DrawerDescription>
              <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-500">
                {t('sportQuestionnaire.common.socialUnaffected')}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <Button
                variant="primary"
                size="md"
                className="inline-flex w-full items-center justify-center gap-2 shadow-sm"
                onClick={() => setSheetOpen(true)}
              >
                <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
                {t('sportQuestionnaire.common.takeTest')}
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="w-full"
                disabled={skipLoading}
                onClick={() => void handleSkip()}
              >
                {skipLoading ? t('app.loading') : t('sportQuestionnaire.common.skip')}
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="py-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {t('sportQuestionnaire.common.later')}
              </button>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <SportQuestionnaireSheet
        sport={sport}
        open={sheetOpen}
        onOpenChange={(v) => {
          setSheetOpen(v);
          if (!v) onClose();
        }}
        onCompleted={(user) => {
          onUserUpdated(user);
          onClose();
        }}
      />
    </>
  );
}
