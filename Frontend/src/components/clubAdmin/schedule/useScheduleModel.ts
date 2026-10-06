import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClubScheduleResponseV2 } from '@shared/clubAdmin/contract';
import { useClubConsole } from '@/clubAdmin/clubConsoleContextValue';
import { useLegacyClubInfoQuery } from '@/queries/clubAdmin';
import { buildScheduleModel, type ScheduleModel } from './scheduleModel';

/**
 * Schedule model for one day. A v2 schedule carries its own hours and courts; an older one
 * falls back to the legacy club row (fetched only when the response lacks them).
 */
export function useScheduleModel(data: ClubScheduleResponseV2 | undefined, date: string): {
  model: ScheduleModel | null;
  pending: boolean;
} {
  const { t } = useTranslation('clubAdmin');
  const { clubId, context, timeZone } = useClubConsole();
  const needsLegacy = !!data && (data.courts === undefined || data.hours === undefined) && !context.legacy;
  const legacyQ = useLegacyClubInfoQuery(clubId, needsLegacy);
  const legacy = context.legacy ?? legacyQ.data ?? null;
  const waiting = needsLegacy && legacyQ.isPending;
  const unassignedLabel = t('schedule.unassigned');
  const model = useMemo(
    () =>
      data && !waiting
        ? buildScheduleModel({ date, timeZone: data.timezone || timeZone, response: data, legacy, unassignedLabel })
        : null,
    [data, waiting, date, timeZone, legacy, unassignedLabel]
  );
  return { model, pending: !model };
}
