import { PlayIntentTimeOfDay } from '@prisma/client';
import { t } from '../../utils/translations';
import {
  buildPlayIntentWhenLabel,
  interpolatePlayIntentCopy,
} from './playIntentFollowerNotification';

const NAME_MAX = 100;

export function buildPlayIntentDiscussionName(input: {
  timezone: string;
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime: string | null;
  endTime: string | null;
  clubNames: string[];
  lang: string;
  now?: Date;
}): string {
  const when = buildPlayIntentWhenLabel(input, input.lang, input.now);
  const clubs = input.clubNames.filter(Boolean).join(' / ');
  const details = [when, clubs].filter(Boolean).join(' · ');
  const name = interpolatePlayIntentCopy(
    t('playIntent.discussionGroupName', input.lang),
    { details },
  ).trim();
  if (name.length <= NAME_MAX) return name;
  return name.slice(0, NAME_MAX).trimEnd();
}
