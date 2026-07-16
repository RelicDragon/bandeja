import { describe, expect, it } from 'vitest';
import { matchesSearch } from './transliteration';

describe('matchesSearch', () => {
  it('matches Cyrillic query against Latin name (invite flash bug)', () => {
    expect(matchesSearch('ив', 'Ivan Asonov')).toBe(true);
    expect(matchesSearch('иван', 'Ivan Asonov')).toBe(true);
  });

  it('matches Latin query against Cyrillic name', () => {
    expect(matchesSearch('iv', 'Иван Асонов')).toBe(true);
  });
});
