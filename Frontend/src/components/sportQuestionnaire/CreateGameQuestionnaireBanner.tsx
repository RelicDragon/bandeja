import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { useAuthStore } from '@/store/authStore';
import { useQuestionnaireStatus } from '@/hooks/useQuestionnaireStatus';
import { shouldShowEstimateLevelLink } from '@/utils/sportQuestionnaire';
import { SportQuestionnaireSheet } from './SportQuestionnaireSheet';

type CreateGameQuestionnaireBannerProps = {
  sport: Sport;
};

export function CreateGameQuestionnaireBanner({ sport }: CreateGameQuestionnaireBannerProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { status, refresh } = useQuestionnaireStatus(sport);
  const [sheetOpen, setSheetOpen] = useState(false);

  if (!user || !shouldShowEstimateLevelLink(user, sport, status)) return null;

  const sportLabel = t(getSportConfig(sport).labelKey);

  return (
    <>
      <p className="border-t border-gray-100 dark:border-gray-800 px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('sportQuestionnaire.common.createGameBanner', { sport: sportLabel })}
        </button>
      </p>
      <SportQuestionnaireSheet
        sport={sport}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onCompleted={() => void refresh()}
      />
    </>
  );
}
