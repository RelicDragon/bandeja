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
  assert.equal(
    resolveInitialDefaultCurrency({ currentCurrency: 'EUR', cityCountry: 'Czechia' }),
    'CZK',
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
  assert.equal(
    resolveCurrencyForFirstCityConfirm({
      currentCurrency: 'HUF',
      previousCityCountry: 'Hungary',
      cityCountry: 'Serbia',
    }),
    'RSD',
  );
  assert.equal(
    resolveCurrencyForFirstCityConfirm({
      currentCurrency: 'EUR',
      previousCityCountry: 'France',
      cityCountry: 'Hungary',
    }),
    'HUF',
  );
  assert.equal(
    resolveCurrencyForFirstCityConfirm({
      currentCurrency: 'EUR',
      cityCountry: 'United Kingdom',
    }),
    'GBP',
  );
  assert.equal(
    resolveCurrencyForFirstCityConfirm({ cityCountry: 'Atlantis' }),
    undefined,
  );
}

function testFirstCityConfirmKeepsProfilePick(): void {
  assert.equal(
    resolveCurrencyForFirstCityConfirm({
      currentCurrency: 'USD',
      previousCityCountry: 'Hungary',
      cityCountry: 'Serbia',
    }),
    undefined,
  );
  assert.equal(
    resolveCurrencyForFirstCityConfirm({
      currentCurrency: 'EUR',
      previousCityCountry: 'Serbia',
      cityCountry: 'France',
    }),
    undefined,
  );
  assert.equal(
    resolveCurrencyForFirstCityConfirm({
      currentCurrency: 'RSD',
      previousCityCountry: 'Serbia',
      cityCountry: 'France',
    }),
    'EUR',
  );
}

testEurDefaultDoesNotBlockCityCurrency();
testEurDefaultDoesNotBlockFirstGeo();
testCityWinsOverGeo();
testOtherCountriesGetLocalCurrency();
testUserChosenCurrencyIsKept();
testFirstCityConfirmOverwritesBootstrapCurrency();
testFirstCityConfirmKeepsProfilePick();
console.log('initialCurrencyAssignment.test: ok');
