import type { TFunction } from 'i18next';

export function formatInviteStatsRows(
  t: TFunction,
  level: number | null | undefined,
  social: number | null | undefined,
  reliability?: number | null,
): { levelRow: string; socialRow: string } {
  const lv = level != null && Number.isFinite(level) ? level.toFixed(1) : '—';
  const soc = social != null && Number.isFinite(social) ? social.toFixed(1) : '—';
  const levelRow =
    reliability != null && Number.isFinite(reliability)
      ? t('playerInvite.statsLevelRowWithRel', { level: lv, rel: Math.round(reliability) })
      : t('playerInvite.statsLevelRowNoRel', { level: lv });
  const socialRow = t('playerInvite.statsSocialRow', { social: soc });
  return { levelRow, socialRow };
}
