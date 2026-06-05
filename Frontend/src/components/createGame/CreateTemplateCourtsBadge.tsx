import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CreateTemplateId } from '@/sport/createFlow';
import { getCreateTemplateAccentClass } from '@/utils/createTemplateVisuals';

type BadgeProps = {
  count: number;
  templateId?: CreateTemplateId;
  accentClassName?: string;
};

export function CreateTemplateCourtsBadge({ count, templateId, accentClassName }: BadgeProps) {
  const { t } = useTranslation();
  const accent =
    accentClassName ??
    (templateId ? getCreateTemplateAccentClass(templateId) : 'text-gray-600 dark:text-gray-400');
  return (
    <span
      className={`inline-flex min-w-[4.25rem] shrink-0 items-center justify-end gap-1 tabular-nums text-[10px] font-medium ${accent}`}
    >
      <LayoutGrid size={12} aria-hidden />
      {t('club.courtsCount', { count })}
    </span>
  );
}
