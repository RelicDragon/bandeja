import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PAYMENT_METHOD_ID,
  PAYMENT_HANDLE_RULES,
  PAYMENT_METHODS,
  coveredCountries,
  getPaymentMethod,
  isPaymentMethodAvailableInCountry,
  paymentMethodLink,
  paymentMethodsForCountry,
} from './paymentMethods';

const idsFor = (country: string | null | undefined) =>
  paymentMethodsForCountry(country).map((method) => method.id);

describe('payment method catalogue', () => {
  it('has unique ids and exactly one of brand / labelKey', () => {
    const ids = PAYMENT_METHODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const method of PAYMENT_METHODS) {
      expect(Boolean(method.brand) !== Boolean(method.labelKey)).toBe(true);
      expect(PAYMENT_HANDLE_RULES[method.handle]).toBeDefined();
    }
  });

  it('names only real ISO-3166 alpha-2 codes', () => {
    for (const country of coveredCountries()) {
      expect(country).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('never lists a country twice inside one method', () => {
    for (const method of PAYMENT_METHODS) {
      if (method.availability.scope !== 'COUNTRIES') continue;
      const { countries } = method.availability;
      expect(new Set(countries).size, method.id).toBe(countries.length);
      expect(countries.length, method.id).toBeGreaterThan(0);
    }
  });

  it('only overrides the rank of a country the method is available in', () => {
    for (const method of PAYMENT_METHODS) {
      for (const country of Object.keys(method.rankByCountry ?? {})) {
        expect(isPaymentMethodAvailableInCountry(method, country), `${method.id}/${country}`).toBe(
          true,
        );
      }
    }
  });

  it('puts the custom option first in every covered country', () => {
    for (const country of [...coveredCountries(), 'ZZ', '', null]) {
      expect(idsFor(country)[0], String(country)).toBe(CUSTOM_PAYMENT_METHOD_ID);
    }
  });

  it('ends every list with the two universal fallbacks', () => {
    for (const country of coveredCountries()) {
      expect(idsFor(country).slice(-2), country).toEqual(['BANK_TRANSFER', 'CASH']);
    }
  });

  it('offers only the universal three when the country is unknown', () => {
    expect(idsFor(undefined)).toEqual([CUSTOM_PAYMENT_METHOD_ID, 'BANK_TRANSFER', 'CASH']);
    expect(idsFor('Atlantis')).toEqual([CUSTOM_PAYMENT_METHOD_ID, 'BANK_TRANSFER', 'CASH']);
  });

  it('accepts the display name `City.country` actually stores', () => {
    // The column holds "Serbia", never "RS". Treating a name as unknown is
    // what silently reduces the picker to its three universal methods
    // everywhere — see `shared/geo/countryIso2.test.ts`.
    expect(idsFor('Serbia')).toEqual(idsFor('RS'));
    expect(idsFor('Spain')).toContain('BIZUM');
  });

  it('is case insensitive about the country code', () => {
    expect(idsFor('es')).toEqual(idsFor('ES'));
  });

  describe('the markets this change is about', () => {
    it('offers Bizum in Spain and nowhere else', () => {
      expect(idsFor('ES')).toContain('BIZUM');
      const bizum = getPaymentMethod('BIZUM');
      expect(bizum?.availability).toEqual({ scope: 'COUNTRIES', countries: ['ES'] });
    });

    it('offers IPS Prenesi in Serbia', () => {
      const serbia = idsFor('RS');
      expect(serbia).toContain('IPS_PRENESI');
      expect(serbia).toContain('RS_ACCOUNT');
      // Ranked above the fallbacks — it is what a Belgrade player will use.
      expect(serbia.indexOf('IPS_PRENESI')).toBeLessThan(serbia.indexOf('BANK_TRANSFER'));
    });

    it('hides IBAN and Revolut in the western Balkans', () => {
      for (const country of ['RS', 'BA', 'MK', 'AL']) {
        expect(idsFor(country), country).not.toContain('IBAN');
        expect(idsFor(country), country).not.toContain('REVOLUT');
      }
    });

    it('hides IBAN and Revolut across Asia and Latin America', () => {
      for (const country of ['TH', 'ID', 'PH', 'IN', 'JP', 'BR', 'AR', 'CO', 'PE']) {
        expect(idsFor(country), country).not.toContain('IBAN');
      }
      for (const country of ['TH', 'ID', 'PH', 'IN', 'AR', 'CO', 'PE']) {
        expect(idsFor(country), country).not.toContain('REVOLUT');
      }
    });

    it('keeps PayPal out of the markets it left', () => {
      expect(idsFor('TR')).not.toContain('PAYPAL');
      expect(idsFor('IN')).not.toContain('PAYPAL');
    });

    it('leads with the rail locals actually use', () => {
      const leader = (country: string) => idsFor(country)[1];
      expect(leader('ES')).toBe('BIZUM');
      expect(leader('RS')).toBe('IPS_PRENESI');
      expect(leader('SE')).toBe('SWISH');
      expect(leader('NO')).toBe('VIPPS');
      expect(leader('PL')).toBe('BLIK');
      expect(leader('BR')).toBe('PIX');
      expect(leader('IN')).toBe('UPI');
      expect(leader('TH')).toBe('PROMPTPAY');
      expect(leader('IE')).toBe('REVOLUT');
      expect(leader('DE')).toBe('PAYPAL');
      expect(leader('CH')).toBe('TWINT');
      expect(leader('KZ')).toBe('KASPI');
    });

    it('gives every covered country something beyond the universal three', () => {
      const universalOnly = coveredCountries().filter((country) => idsFor(country).length <= 3);
      expect(universalOnly).toEqual([]);
    });
  });

  describe('links', () => {
    it('builds a provider link only when the method has one', () => {
      expect(paymentMethodLink('REVOLUT', '@marko')).toBe('https://revolut.me/marko');
      expect(paymentMethodLink('PAYPAL', 'marko')).toBe('https://paypal.me/marko');
      expect(paymentMethodLink('CASH_APP', '$marko')).toBe('https://cash.app/$marko');
      expect(paymentMethodLink('CASH_APP', 'marko')).toBe('https://cash.app/$marko');
      expect(paymentMethodLink('UPI', 'marko@okaxis')).toBe('upi://pay?pa=marko%40okaxis');
      expect(paymentMethodLink('BIZUM', '+34600112233')).toBeNull();
      expect(paymentMethodLink('REVOLUT', '   ')).toBeNull();
      expect(paymentMethodLink('NOPE', 'x')).toBeNull();
    });

    it('escapes a handle before putting it in a URL', () => {
      expect(paymentMethodLink('REVOLUT', 'a/b?c')).toBe('https://revolut.me/a%2Fb%3Fc');
    });

    it('keeps every template substitutable', () => {
      for (const method of PAYMENT_METHODS) {
        if (!method.linkTemplate) continue;
        expect(method.linkTemplate, method.id).toContain('{handle}');
      }
    });
  });
});
