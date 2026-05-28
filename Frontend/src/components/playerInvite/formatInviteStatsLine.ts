import type { TFunction } from 'i18next';

export function formatInviteStatsRows(
  t: TFunction,
  level: number | string | null | undefined,
  social: number | null | undefined,
  reliability?: number | null,
): { levelRow: string; socialRow: string } {
  const lv =
    typeof level === 'string'
      ? level
      : level != null && Number.isFinite(level)
        ? level.toFixed(1)
        : '—';
  const soc = social != null && Number.isFinite(social) ? social.toFixed(1) : '—';
  const levelRow =
    reliability != null && Number.isFinite(reliability)
      ? t('playerInvite.statsLevelRowWithRel', { level: lv, rel: Math.round(reliability) })
      : t('playerInvite.statsLevelRowNoRel', { level: lv });
  const socialRow = t('playerInvite.statsSocialRow', { social: soc });
  return { levelRow, socialRow };
}
