import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Sport, User } from '@/types';
import { shouldShowEstimateLevelLink } from '@/utils/sportQuestionnaire';
import { SportQuestionnaireSheet } from './SportQuestionnaireSheet';

type SportQuestionnaireEstimateLinkProps = {
  user: User;
  sport: Sport;
  onUserUpdated?: (user: User) => void;
  className?: string;
};

export function SportQuestionnaireEstimateLink({
  user,
  sport,
  onUserUpdated,
  className = '',
}: SportQuestionnaireEstimateLinkProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!shouldShowEstimateLevelLink(user, sport)) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline ${className}`}
      >
        {t('sportQuestionnaire.common.estimateLink')}
      </button>
      <SportQuestionnaireSheet
        sport={sport}
        open={open}
        onOpenChange={setOpen}
        onCompleted={(updated) => onUserUpdated?.(updated)}
      />
    </>
  );
}
