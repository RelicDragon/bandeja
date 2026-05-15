export const UNASSIGNED_COURT_ID = '__unassigned__';

export const CLUB_AMENITY_KEYS = [
  'parking',
  'showers',
  'wifi',
  'lockerRoom',
  'bar',
  'shop',
  'rental',
  'lessons',
] as const;

export type ClubAmenityKey = (typeof CLUB_AMENITY_KEYS)[number];
