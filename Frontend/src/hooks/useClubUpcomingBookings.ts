import type { Club, Court } from '@/types';
import { getBooktimeCompanyId, isPadelooClub } from '@shared/clubIntegration';
import { useBooktimeUpcomingBookings } from '@/hooks/useBooktimeUpcomingBookings';
import { usePadelooUpcomingBookings } from '@/hooks/usePadelooUpcomingBookings';

export function useClubUpcomingBookings(
  club: Club | undefined,
  connected: boolean,
  enabled: boolean,
  filterCourts?: Court[],
  refreshKey = 0,
) {
  const companyId = getBooktimeCompanyId(club) ?? '';
  const inactiveClub: Club = {
    id: '',
    name: '',
    address: '',
    cityId: '',
    integrationType: null,
  };

  const booktime = useBooktimeUpcomingBookings(
    club ?? inactiveClub,
    companyId,
    connected,
    enabled && Boolean(club) && !isPadelooClub(club),
    filterCourts,
    refreshKey,
  );

  const padeloo = usePadelooUpcomingBookings(
    club ?? inactiveClub,
    connected,
    enabled && Boolean(club) && isPadelooClub(club),
    filterCourts,
    refreshKey,
  );

  if (isPadelooClub(club)) return padeloo;
  return booktime;
}
