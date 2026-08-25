import type { Club } from '@/types';

export type ClubVenueGroup = {
  cityId: string;
  name: string;
  country: string;
  clubs: Club[];
};

export function groupClubsByVenue(clubs: Club[], venueCityId: string): {
  here: Club[];
  elsewhere: ClubVenueGroup[];
} {
  const here: Club[] = [];
  const byCity = new Map<string, ClubVenueGroup>();

  for (const club of clubs) {
    if (!club.cityId || club.cityId === venueCityId) {
      here.push(club);
      continue;
    }
    const existing = byCity.get(club.cityId);
    if (existing) {
      existing.clubs.push(club);
      continue;
    }
    byCity.set(club.cityId, {
      cityId: club.cityId,
      name: club.city?.name ?? '',
      country: club.city?.country ?? '',
      clubs: [club],
    });
  }

  const elsewhere = [...byCity.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { here, elsewhere };
}
