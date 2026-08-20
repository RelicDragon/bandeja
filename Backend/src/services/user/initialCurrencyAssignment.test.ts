import assert from 'node:assert/strict';
import {
  resolveCurrencyForFirstCityConfirm,
  resolveInitialDefaultCurrency,
} from './initialCurrencyAssignment';

function testEurDefaultDoesNotBlockCityCurrency(): void {
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'EUR', cityCountry: 'Serbia' }),
    'RSD',
  );
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'EUR', cityCountry: 'RS' }),
    'RSD',
  );
}

function testEurDefaultDoesNotBlockFirstGeo(): void {
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'EUR', geoCurrency: 'RSD' }),
    'RSD',
  );
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'auto', geoCurrency: 'USD' }),
    'USD',
  );
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: '', geoCurrency: 'CZK' }),
    'CZK',
  );
}

function testCityWinsOverGeo(): void {
  assert.equal(
    resolveInitialDefaultCurrency({
      currentCurrency: 'EUR',
      cityCountry: 'Serbia',
      geoCurrency: 'USD',
    }),
    'RSD',
  );
}

function testOtherCountriesGetLocalCurrency(): void {
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'EUR', cityCountry: 'United Kingdom' }),
    'GBP',
  );
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'EUR', cityCountry: 'France' }),
    'EUR',
  );
}

function testUserChosenCurrencyIsKept(): void {
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'USD', cityCountry: 'Serbia' }),
    undefined,
  );
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'RSD', geoCurrency: 'EUR' }),
    undefined,
  );
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'EUR', cityCountry: null, geoCurrency: null }),
    undefined,
  );
}

function testFirstCityConfirmOverwritesBootstrapCurrency(): void {
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'HUF', cityCountry: 'Serbia' }),
    undefined,
  );
  assert.equal(resolveCurrencyForFirstCityConfirm('Serbia'), 'RSD');
  assert.equal(resolveCurrencyForFirstCityConfirm('Hungary'), 'HUF');
  assert.equal(resolveCurrencyForFirstCityConfirm('United Kingdom'), 'GBP');
  assert.equal(resolveCurrencyForFirstCityConfirm('Atlantis'), undefined);
}

testEurDefaultDoesNotBlockCityCurrency();
testEurDefaultDoesNotBlockFirstGeo();
testCityWinsOverGeo();
testOtherCountriesGetLocalCurrency();
testUserChosenCurrencyIsKept();
testFirstCityConfirmOverwritesBootstrapCurrency();
console.log('initialCurrencyAssignment.test: ok');
