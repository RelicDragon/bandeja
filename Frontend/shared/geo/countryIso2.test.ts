import { describe, expect, it } from 'vitest';
import { knownCountryIso2s, resolveCountryIso2 } from './countryIso2';
import { coveredCountries, paymentMethodsForCountry } from '../payments/paymentMethods';

/**
 * Every distinct `City.country` value in the production database, as of the
 * PRD 348 country-scoping work.
 *
 * This list is the whole point of the module. `City.country` holds display
 * names, not codes — a resolver written against a length check answers
 * `undefined` for all 71 of these, which silently reduces PRD 348's payment
 * picker to its three universal methods in every city on earth. Bizum would
 * never appear in Spain and the feature would look shipped while doing
 * nothing.
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

describe('the resolver and the payment catalogue agree', () => {
  it('can reach every country the catalogue scopes a method to', () => {
    // A method scoped to a country no `City.country` value can resolve to is a
    // method nobody will ever be offered.
    const reachable = new Set(knownCountryIso2s());
    const orphaned = coveredCountries().filter((iso2) => !reachable.has(iso2));
    expect(orphaned).toEqual([]);
  });

  it('gives a real, local list for the biggest markets by city count', () => {
    const idsFor = (name: string) =>
      paymentMethodsForCountry(resolveCountryIso2(name)).map((m) => m.id);

    expect(idsFor('Spain')).toContain('BIZUM');
    expect(idsFor('Serbia')).toContain('IPS_PRENESI');
    expect(idsFor('Argentina')).toContain('MERCADO_PAGO');
    expect(idsFor('South Africa')).toContain('PAYSHAP');
    expect(idsFor('Chile')).toContain('MACH');
    expect(idsFor('Colombia')).toContain('NEQUI');
    expect(idsFor('Brazil')).toContain('PIX');
    expect(idsFor('United Kingdom')).toContain('UK_BANK');
    expect(idsFor('Thailand')).toContain('PROMPTPAY');
    expect(idsFor('India')).toContain('UPI');
  });

  /**
   * Markets where "bank transfer or cash" is the honest answer.
   *
   * Not a gap to be filled with something plausible-looking: none of the three
   * has a P2P rail a local would recognise, and inventing one would send a
   * player to an app that cannot pay anybody. Pinned as a list so that a
   * *new* bare market — a real market entered without catalogue work — fails
   * this test instead of quietly shipping a three-item picker.
   */
  const KNOWN_BARE_MARKETS = ['Albania', 'Guyana', 'Suriname'];

  it('leaves only the documented markets with the universal three', () => {
    const bare = CITY_COUNTRY_VALUES.filter(
      (name) => paymentMethodsForCountry(resolveCountryIso2(name)).length <= 3,
    );
    expect(bare).toEqual(KNOWN_BARE_MARKETS);
  });

  it('still gives those markets a way to be paid', () => {
    for (const name of KNOWN_BARE_MARKETS) {
      expect(paymentMethodsForCountry(resolveCountryIso2(name)).map((m) => m.id)).toEqual([
        'CUSTOM',
        'BANK_TRANSFER',
        'CASH',
      ]);
    }
  });
});
