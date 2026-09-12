import { describe, expect, it } from 'vitest';
import { expandNameSearchTerms, matchesPersonSearch, matchesSearch } from '@shared/nameSearch';

describe('matchesSearch', () => {
  it('matches Cyrillic query against Latin name (invite flash bug)', () => {
    expect(matchesSearch('ив', 'Ivan Asonov')).toBe(true);
    expect(matchesSearch('иван', 'Ivan Asonov')).toBe(true);
  });

  it('matches Latin query against Cyrillic name', () => {
    expect(matchesSearch('iv', 'Иван Асонов')).toBe(true);
  });

  it('matches Russian Cyrillic against Serbian Latin first names', () => {
    expect(matchesSearch('Анджела', 'Andjela Djermanovic')).toBe(true);
    expect(matchesSearch('анджела', 'Andjela Djermanovic')).toBe(true);
  });

  it('matches Russian Cyrillic against Serbian Latin last names', () => {
    expect(matchesSearch('Дьерманович', 'Andjela Djermanovic')).toBe(true);
    expect(matchesSearch('Спринцхунас', 'Polina Sprinzhunas')).toBe(true);
  });
});

describe('matchesPersonSearch', () => {
  it('matches the prod invite-search misses by first and last name', () => {
    expect(
      matchesPersonSearch('Анджела Дьерманович', {
        firstName: 'Andjela',
        lastName: 'Djermanovic',
      }),
    ).toBe(true);
    expect(
      matchesPersonSearch('Полина Спринцхунас', {
        firstName: 'Polina',
        lastName: 'Sprinzhunas',
      }),
    ).toBe(true);
  });
});

describe('expandNameSearchTerms', () => {
  it('includes a Latin spelling that SQL contains can hit for Andjela', () => {
    expect(expandNameSearchTerms('Анджела').map((v) => v.toLowerCase())).toContain('andjela');
  });

  it('includes a Latin spelling that SQL contains can hit for Djermanovic', () => {
    expect(expandNameSearchTerms('Дьерманович').map((v) => v.toLowerCase())).toContain('djermanovic');
  });

  it('includes a Latin spelling that SQL contains can hit for Sprinzhunas', () => {
    expect(expandNameSearchTerms('Спринцхунас').map((v) => v.toLowerCase())).toContain('sprinzhunas');
  });

  it('does not treat an unrelated Latin name as Andjela', () => {
    expect(matchesSearch('Анджела', 'Aleksandra Konikka')).toBe(false);
    expect(matchesSearch('Анджела', 'Ivan Asonov')).toBe(false);
  });

  it('still matches a two-letter Cyrillic prefix', () => {
    expect(matchesSearch('ан', 'Andjela Djermanovic')).toBe(true);
    expect(matchesSearch('ив', 'Ivan Asonov')).toBe(true);
  });

  it('keeps Andjela while typing incomplete Cyrillic prefixes', () => {
    const name = 'Andjela Djermanovic';
    expect(matchesSearch('Анд', name)).toBe(true);
    expect(matchesSearch('Андж', name)).toBe(true);
    expect(matchesSearch('Андже', name)).toBe(true);
    expect(matchesSearch('Анджел', name)).toBe(true);
    expect(matchesSearch('Анджела', name)).toBe(true);
  });

  it('keeps Sprinzhunas while typing incomplete last-name prefixes', () => {
    const name = 'Polina Sprinzhunas';
    expect(matchesSearch('Спри', name)).toBe(true);
    expect(matchesSearch('Спринц', name)).toBe(true);
    expect(matchesSearch('Спринцх', name)).toBe(true);
    expect(matchesSearch('Спринцхунас', name)).toBe(true);
  });
});
