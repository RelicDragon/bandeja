import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Sport } from '@/types';
import { getSportConfig } from '@/sport/sportRegistry';
import { useAuthStore } from '@/store/authStore';
import { useQuestionnaireStatus } from '@/hooks/useQuestionnaireStatus';
import { getInviteNudgeCopyMode } from '@/utils/sportQuestionnaire';
import { getDisplayLevelForSport, getUserPrimarySport } from '@/utils/profileSports';
import { SportQuestionnaireSheet } from './SportQuestionnaireSheet';

type SportQuestionnaireInviteNudgeProps = {
  gameSport: Sport;
};

export function SportQuestionnaireInviteNudge({ gameSport }: SportQuestionnaireInviteNudgeProps) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { status, loading, refresh } = useQuestionnaireStatus(gameSport);
  const [sheetOpen, setSheetOpen] = useState(false);

  const copyMode = getInviteNudgeCopyMode(user, gameSport, status);
  if (!user || loading || copyMode === 'none') return null;

  const sportLabel = t(getSportConfig(gameSport).labelKey);
  const level = getDisplayLevelForSport(user, gameSport).toFixed(1);
  const nudgeText =
    copyMode === 'cross-sport'
      ? t('sportQuestionnaire.common.inviteNudgeCrossSport', {
          primarySport: t(getSportConfig(getUserPrimarySport(user)).labelKey),
          primaryLevel: getDisplayLevelForSport(user, getUserPrimarySport(user)).toFixed(1),
          gameSport: sportLabel,
          level,
        })
      : t('sportQuestionnaire.common.inviteNudge', { sport: sportLabel, level });

  return (
    <>
      <p className="text-xs text-gray-600 dark:text-gray-400">
        {nudgeText}{' '}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          {t('sportQuestionnaire.common.estimateLink')}
        </button>
      </p>
      <SportQuestionnaireSheet
        sport={gameSport}
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
