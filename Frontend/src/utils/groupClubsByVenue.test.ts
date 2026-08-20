import { describe, expect, it } from 'vitest';
import { groupClubsByVenue } from './groupClubsByVenue';
import type { Club } from '@/types';

const club = (id: string, cityId: string, cityName: string): Club => ({
  id,
  name: id,
  address: '',
  cityId,
  city: { id: cityId, name: cityName, country: 'CZ', timezone: '', isActive: true },
});

describe('groupClubsByVenue', () => {
  it('keeps venue-city clubs separate from other cities', () => {
    const grouped = groupClubsByVenue(
      [
        club('a', 'prague', 'Prague'),
        club('b', 'brno', 'Brno'),
        club('c', 'prague', 'Prague'),
        club('d', 'kladno', 'Kladno'),
        club('e', '', ''),
      ],
      'prague',
    );
    expect(grouped.here.map((c) => c.id)).toEqual(['a', 'c', 'e']);
    expect(grouped.elsewhere.map((g) => g.cityId)).toEqual(['brno', 'kladno']);
  });
});
