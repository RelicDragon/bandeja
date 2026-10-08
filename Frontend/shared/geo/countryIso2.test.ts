import { describe, expect, it } from 'vitest';
import { resolveCountryIso2 } from './countryIso2';

/**
 * Every distinct `City.country` value in the production database.
 *
 * This list is the whole point of the module. `City.country` holds display
 * names, not codes — a resolver written against a length check answers
 * `undefined` for all 71 of these, and every country-aware guess (the game
 * currency) silently falls back to its default.
 *
 * Adding a market means adding its name here and to the map.
 */
const CITY_COUNTRY_VALUES = [
  'Albania', 'Andorra', 'Argentina', 'Armenia', 'Austria', 'Belarus', 'Belgium',
  'Bolivia', 'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Chile', 'China',
  'Colombia', 'Croatia', 'Cyprus', 'Czechia', 'Denmark', 'Ecuador', 'Estonia',
  'Finland', 'France', 'Georgia', 'Germany', 'Greece', 'Guernsey', 'Guyana',
  'Hungary', 'Iceland', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy',
  'Japan', 'Kazakhstan', 'Latvia', 'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Malta', 'Moldova', 'Monaco', 'Montenegro', 'Netherlands', 'North Macedonia',
  'Norway', 'Oman', 'Paraguay', 'Peru', 'Poland', 'Portugal', 'Romania',
  'Russia', 'San Marino', 'Saudi Arabia', 'Serbia', 'Slovakia', 'Slovenia',
  'South Africa', 'Spain', 'Suriname', 'Sweden', 'Switzerland', 'Thailand',
  'Turkey', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'Uruguay',
  'Venezuela',
];

describe('resolveCountryIso2', () => {
  it('resolves every country the database actually stores', () => {
    const unresolved = CITY_COUNTRY_VALUES.filter((name) => !resolveCountryIso2(name));
    expect(unresolved).toEqual([]);
  });

  it('resolves the names that are easy to get wrong', () => {
    expect(resolveCountryIso2('Bosnia and Herzegovina')).toBe('BA');
    expect(resolveCountryIso2('North Macedonia')).toBe('MK');
    expect(resolveCountryIso2('United Arab Emirates')).toBe('AE');
    expect(resolveCountryIso2('Czechia')).toBe('CZ');
    expect(resolveCountryIso2('South Africa')).toBe('ZA');
    expect(resolveCountryIso2('United Kingdom')).toBe('GB');
  });

  it('is case and whitespace insensitive, and accepts native spellings', () => {
    expect(resolveCountryIso2('  spain  ')).toBe('ES');
    expect(resolveCountryIso2('SRBIJA')).toBe('RS');
    expect(resolveCountryIso2('Србија')).toBe('RS');
    expect(resolveCountryIso2('Türkiye')).toBe('TR');
  });

  it('passes an ISO-2 code straight through, so a future column migration is a no-op', () => {
    expect(resolveCountryIso2('rs')).toBe('RS');
    expect(resolveCountryIso2('ES')).toBe('ES');
  });

  it('prefers a known alias over the passthrough', () => {
    // "UK" is two letters and is not the United Kingdom's ISO code.
    expect(resolveCountryIso2('UK')).toBe('GB');
    expect(resolveCountryIso2('uk')).toBe('GB');
  });

  it('answers undefined rather than guessing', () => {
    expect(resolveCountryIso2('Atlantis')).toBeUndefined();
    expect(resolveCountryIso2('Test')).toBeUndefined();
    expect(resolveCountryIso2('')).toBeUndefined();
    expect(resolveCountryIso2(null)).toBeUndefined();
    expect(resolveCountryIso2(undefined)).toBeUndefined();
  });
});
