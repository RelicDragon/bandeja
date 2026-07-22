import type { Club } from '@/types';
import { isBooktimeClub, isKlikterenClub, isPadelooClub } from '@shared/clubIntegration';
import { useBooktimeCourtAvailability } from '@/hooks/useBooktimeCourtAvailability';
import { usePadelooCourtAvailability } from '@/hooks/usePadelooCourtAvailability';
import { useKlikterenCourtAvailability } from '@/hooks/useKlikterenCourtAvailability';

export function useClubCourtAvailability(params: {
  club: Club | undefined;
  courts?: Parameters<typeof useBooktimeCourtAvailability>[0]['courts'];
  date: Date;
  courtFilter?: string | null;
  durationMinutes: number;
  enabled: boolean;
  loadCompanyMeta?: boolean;
}) {
  const booktime = useBooktimeCourtAvailability({
    club: params.club,
    courts: params.courts,
    date: params.date,
    courtFilter: params.courtFilter,
    durationMinutes: params.durationMinutes,
    enabled: params.enabled && isBooktimeClub(params.club),
    loadCompanyMeta: params.loadCompanyMeta,
  });

  const padeloo = usePadelooCourtAvailability({
    club: params.club,
    courts: params.courts,
    date: params.date,
    courtFilter: params.courtFilter,
    durationMinutes: params.durationMinutes,
    enabled: params.enabled && isPadelooClub(params.club),
    loadClubMeta: params.loadCompanyMeta,
  });

  const klikteren = useKlikterenCourtAvailability({
    club: params.club,
    courts: params.courts,
    date: params.date,
    courtFilter: params.courtFilter,
    durationMinutes: params.durationMinutes,
    enabled: params.enabled && isKlikterenClub(params.club),
    loadClubMeta: params.loadCompanyMeta,
  });

  if (isKlikterenClub(params.club)) return klikteren;
  if (isPadelooClub(params.club)) return padeloo;
  if (isBooktimeClub(params.club)) return booktime;

  return {
    active: false,
    loading: false,
    error: null as string | null,
    courtRows: [],
    dateKey: '',
    reload: async () => undefined,
    companyMeta: null,
    clubMeta: null,
    minDateKey: '',
    maxDateKey: '',
  };
}
