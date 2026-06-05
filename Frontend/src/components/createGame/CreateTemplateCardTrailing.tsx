import type { CreateTemplate } from '@/sport/createFlow';
import { suggestCourtCountForParticipants } from '@/utils/eventDuration/suggestCourtCount';
import { CreateTemplateCourtsBadge } from './CreateTemplateCourtsBadge';
import { CreateTemplateDurationBadge } from './CreateTemplateDurationBadge';
import type { CreateTemplateDurationContext } from './createTemplateDurationLabels';
import {
  estimateDurationLabelForTemplate,
  showTemplateDurationBadge,
} from './createTemplateDurationLabels';

type Props = {
  tpl: CreateTemplate;
  durationContext: CreateTemplateDurationContext;
};

type CustomTrailingProps = {
  durationContext: CreateTemplateDurationContext;
  durationLabel: string;
};

export function CreateTemplateCustomTrailing({ durationContext, durationLabel }: CustomTrailingProps) {
  const courts = suggestCourtCountForParticipants(
    durationContext.maxParticipants,
    durationContext.playersPerMatch,
  );
  return (
    <div className="flex flex-col items-end gap-0.5">
      <CreateTemplateDurationBadge label={durationLabel} />
      {courts != null ? <CreateTemplateCourtsBadge count={courts} /> : null}
    </div>
  );
}

export function CreateTemplateCardTrailing({ tpl, durationContext }: Props) {
  const courts = suggestCourtCountForParticipants(
    durationContext.maxParticipants,
    durationContext.playersPerMatch,
  );
  const showDuration = showTemplateDurationBadge(tpl);
  if (courts == null && !showDuration) return undefined;

  return (
    <div className="flex flex-col items-end gap-0.5">
      {showDuration ? (
        <CreateTemplateDurationBadge
          templateId={tpl.id}
          label={estimateDurationLabelForTemplate(tpl, durationContext)}
        />
      ) : null}
      {courts != null ? (
        <CreateTemplateCourtsBadge templateId={tpl.id} count={courts} />
      ) : null}
    </div>
  );
}
