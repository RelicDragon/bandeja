import type { ClubMapItem } from '@/api/clubs';
import type { Club } from '@/types';

export function clubFromMapItem(item: ClubMapItem): Club {
  return {
    id: item.id,
    name: item.name,
    avatar: item.avatar,
    address: item.address ?? '',
    cityId: item.cityId,
    latitude: item.latitude,
    longitude: item.longitude,
    website: item.website ?? undefined,
    phone: item.phone ?? undefined,
    city: {
      id: item.cityId,
      name: item.cityName,
      country: item.country,
      timezone: '',
      isActive: true,
    },
  };
}

export function clubMatchesQuery(club: Pick<Club, 'name' | 'normalizedName' | 'address' | 'city'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    club.name.toLowerCase().includes(q) ||
    (club.normalizedName?.toLowerCase().includes(q) ?? false) ||
    club.address.toLowerCase().includes(q) ||
    (club.city?.name.toLowerCase().includes(q) ?? false)
  );
}
