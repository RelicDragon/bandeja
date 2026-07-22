import type { Club, Court } from '@/types';
import { isBooktimeClub, isKlikterenClub, isPadelooClub } from '@shared/clubIntegration';
import { useBooktimeTimeOptions } from '@/hooks/useBooktimeTimeOptions';
import { usePadelooTimeOptions } from '@/hooks/usePadelooTimeOptions';
import { useKlikterenTimeOptions } from '@/hooks/useKlikterenTimeOptions';

type Params = {
  club: Club | undefined;
  courts?: Court[];
  selectedDate: Date;
  durationHours: number;
  selectedCourtId: string | null;
  selectedCourtIds?: string[];
  enabled: boolean;
};

export function useClubTimeOptions(params: Params) {
  const booktime = useBooktimeTimeOptions({
    ...params,
    enabled: params.enabled && isBooktimeClub(params.club),
  });
  const padeloo = usePadelooTimeOptions({
    ...params,
    enabled: params.enabled && isPadelooClub(params.club),
  });
  const klikteren = useKlikterenTimeOptions({
    ...params,
    enabled: params.enabled && isKlikterenClub(params.club),
  });

  if (isKlikterenClub(params.club)) return klikteren;
  if (isPadelooClub(params.club)) return padeloo;
  return booktime;
}
