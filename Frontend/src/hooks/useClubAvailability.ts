import type { Club } from '@/types';
import { isBooktimeClub, isKlikterenClub, isNspadelClub, isPadelooClub, getBooktimeCompanyId } from '@shared/clubIntegration';
import { useBooktimeAvailability } from '@/hooks/useBooktimeAvailability';
import { usePadelooAvailability } from '@/hooks/usePadelooAvailability';
import { useKlikterenAvailability } from '@/hooks/useKlikterenAvailability';
import { useNspadelAvailability } from '@/hooks/useNspadelAvailability';

export function useClubAvailability(club: Club, selectedDate: Date, enabled: boolean) {
  const companyId = getBooktimeCompanyId(club) ?? '';
  const booktime = useBooktimeAvailability(
    club,
    companyId,
    selectedDate,
    enabled && isBooktimeClub(club),
  );
  const padeloo = usePadelooAvailability(club, selectedDate, enabled && isPadelooClub(club));
  const klikteren = useKlikterenAvailability(club, selectedDate, enabled && isKlikterenClub(club));
  const nspadel = useNspadelAvailability(club, selectedDate, enabled && isNspadelClub(club));

  if (isKlikterenClub(club)) return klikteren;
  if (isPadelooClub(club)) return padeloo;
  if (isNspadelClub(club)) return nspadel;
  return booktime;
}
