import type { Club, Court } from '@/types';
import { isBooktimeClub, isPadelooClub } from '@shared/clubIntegration';
import { useBooktimeTimeOptions } from '@/hooks/useBooktimeTimeOptions';
import { usePadelooTimeOptions } from '@/hooks/usePadelooTimeOptions';

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

  if (isPadelooClub(params.club)) return padeloo;
  return booktime;
}
