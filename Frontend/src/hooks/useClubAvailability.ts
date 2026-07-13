import type { Club } from '@/types';
import { isBooktimeClub, isPadelooClub, getBooktimeCompanyId } from '@shared/clubIntegration';
import { useBooktimeAvailability } from '@/hooks/useBooktimeAvailability';
import { usePadelooAvailability } from '@/hooks/usePadelooAvailability';

export function useClubAvailability(club: Club, selectedDate: Date, enabled: boolean) {
  const companyId = getBooktimeCompanyId(club) ?? '';
  const booktime = useBooktimeAvailability(
    club,
    companyId,
    selectedDate,
    enabled && isBooktimeClub(club),
  );
  const padeloo = usePadelooAvailability(club, selectedDate, enabled && isPadelooClub(club));

  if (isPadelooClub(club)) return padeloo;
  return booktime;
}
