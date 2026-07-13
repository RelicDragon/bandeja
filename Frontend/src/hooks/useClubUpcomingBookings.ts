import type { Club, Court } from '@/types';
import { getBooktimeCompanyId, isPadelooClub } from '@shared/clubIntegration';
import { useBooktimeUpcomingBookings } from '@/hooks/useBooktimeUpcomingBookings';
import { usePadelooUpcomingBookings } from '@/hooks/usePadelooUpcomingBookings';

const INACTIVE_CLUB_PLACEHOLDER: Club = {
  id: '',
  name: '',
  address: '',
  cityId: '',
  integrationType: null,
};

export function useClubUpcomingBookings(
  club: Club | undefined,
  connected: boolean,
  enabled: boolean,
  filterCourts?: Court[],
  refreshKey = 0,
) {
  const companyId = getBooktimeCompanyId(club) ?? '';
  const resolvedClub = club ?? INACTIVE_CLUB_PLACEHOLDER;

  const booktime = useBooktimeUpcomingBookings(
    resolvedClub,
    companyId,
    connected,
    enabled && Boolean(club) && !isPadelooClub(club),
    filterCourts,
    refreshKey,
  );

  const padeloo = usePadelooUpcomingBookings(
    resolvedClub,
    connected,
    enabled && Boolean(club) && isPadelooClub(club),
    filterCourts,
    refreshKey,
  );

  if (isPadelooClub(club)) return padeloo;
  return booktime;
}
