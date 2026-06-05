import { Clock } from 'lucide-react';
import type { CreateTemplateId } from '@/sport/createFlow';
import { getCreateTemplateAccentClass } from '@/utils/createTemplateVisuals';

type BadgeProps = {
  templateId?: CreateTemplateId;
  label: string;
  accentClassName?: string;
};

export function CreateTemplateDurationBadge({ templateId, label, accentClassName }: BadgeProps) {
  const accent =
    accentClassName ??
    (templateId ? getCreateTemplateAccentClass(templateId) : 'text-gray-600 dark:text-gray-400');
  return (
    <span
      className={`inline-flex min-w-[4.25rem] shrink-0 items-center justify-end gap-1 tabular-nums text-[10px] font-medium ${accent}`}
    >
      <Clock size={12} aria-hidden />
      {label}
    </span>
  );
}
