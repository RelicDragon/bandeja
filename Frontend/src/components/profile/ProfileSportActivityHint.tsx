import { useTranslation } from 'react-i18next';

type ActivityRow = { gamesLast7Days: number; gamesLast30Days: number };

export function ProfileSportActivityHint({ row }: { row: ActivityRow | null | undefined }) {
  const { t } = useTranslation();

  if (!row || (row.gamesLast7Days === 0 && row.gamesLast30Days === 0)) {
    return null;
  }

  return (
    <p className="text-[9px] leading-tight text-gray-500 dark:text-slate-400">
      {t('profile.sports.activityWeekMonth', {
        week: row.gamesLast7Days,
        month: row.gamesLast30Days,
        defaultValue: '{{week}} this week · {{month}} this month',
      })}
    </p>
  );
}
