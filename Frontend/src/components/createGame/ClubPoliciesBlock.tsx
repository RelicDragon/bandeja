import { useTranslation } from 'react-i18next';
import type { Club, EntityType } from '@/types';

type ClubPoliciesBlockProps = {
  club?: Club;
  entityType: EntityType;
};

export function ClubPoliciesBlock({ club, entityType }: ClubPoliciesBlockProps) {
  const { t } = useTranslation();

  if (entityType === 'BAR') return null;
  if (!club?.policyText?.trim() && !club?.cancellationNoticeHours) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800/50 dark:text-gray-400">
      {club.cancellationNoticeHours != null && club.cancellationNoticeHours > 0 ? (
        <p className="mb-1">
          {t('createGame.clubCancellationNotice', { hours: club.cancellationNoticeHours })}
        </p>
      ) : null}
      {club.policyText?.trim() ? (
        <>
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {t('createGame.clubPolicyTitle')}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{club.policyText.trim()}</p>
        </>
      ) : null}
    </div>
  );
}
