import assert from 'node:assert/strict';
import {
  canApplyInitialGeoCurrency,
  canApplyOngoingGeoCurrency,
  currencyFromCityCountry,
  currencyFromCountryIso2,
  iso2FromCityCountry,
  normalizeCurrencyCode,
} from './currencyFromCountry';

function testSerbiaMapsToRsd(): void {
  assert.equal(currencyFromCountryIso2('RS'), 'RSD');
  assert.equal(currencyFromCityCountry('Serbia'), 'RSD');
  assert.equal(currencyFromCityCountry('serbia'), 'RSD');
  assert.equal(currencyFromCityCountry('RS'), 'RSD');
  assert.equal(currencyFromCityCountry('rs'), 'RSD');
  assert.equal(currencyFromCityCountry('Srbija'), 'RSD');
  assert.equal(currencyFromCityCountry('србија'), 'RSD');
  assert.equal(currencyFromCityCountry('СРБИЈА'), 'RSD');
  assert.equal(currencyFromCityCountry('Republic of Serbia'), 'RSD');
  assert.equal(iso2FromCityCountry('Serbia'), 'RS');
}

function testEurozoneAndLocals(): void {
  assert.equal(currencyFromCityCountry('France'), 'EUR');
  assert.equal(currencyFromCityCountry('Germany'), 'EUR');
  assert.equal(currencyFromCountryIso2('FR'), 'EUR');
  assert.equal(currencyFromCityCountry('United Kingdom'), 'GBP');
  assert.equal(currencyFromCityCountry('UK'), 'GBP');
  assert.equal(currencyFromCityCountry('United States'), 'USD');
  assert.equal(currencyFromCityCountry('Czech Republic'), 'CZK');
  assert.equal(currencyFromCityCountry('Czechia'), 'CZK');
  assert.equal(currencyFromCityCountry('Poland'), 'PLN');
  assert.equal(currencyFromCityCountry('Switzerland'), 'CHF');
  assert.equal(currencyFromCityCountry('Ecuador'), 'USD');
  assert.equal(currencyFromCityCountry('Montenegro'), 'EUR');
}

function testAsiaMarketsMapToLocalCurrency(): void {
  assert.equal(currencyFromCityCountry('China'), 'CNY');
  assert.equal(currencyFromCountryIso2('CN'), 'CNY');
  assert.equal(currencyFromCityCountry('Indonesia'), 'IDR');
  assert.equal(currencyFromCountryIso2('ID'), 'IDR');
  assert.equal(currencyFromCityCountry('India'), 'INR');
  assert.equal(currencyFromCountryIso2('IN'), 'INR');
  assert.equal(currencyFromCityCountry('Thailand'), 'THB');
  assert.equal(currencyFromCountryIso2('TH'), 'THB');
  assert.equal(currencyFromCityCountry('Japan'), 'JPY');
  assert.equal(currencyFromCountryIso2('JP'), 'JPY');
}

function testUnknownCountryLeavesMappingOpen(): void {
  assert.equal(currencyFromCityCountry('Atlantis'), undefined);
  assert.equal(currencyFromCityCountry(''), undefined);
  assert.equal(currencyFromCityCountry(null), undefined);
  assert.equal(currencyFromCountryIso2('ZZ'), 'EUR');
}

function testNormalizeCurrencyCode(): void {
  assert.equal(normalizeCurrencyCode('rsd'), 'RSD');
  assert.equal(normalizeCurrencyCode('not-a-currency'), 'EUR');
  assert.equal(normalizeCurrencyCode(undefined), 'EUR');
}

function testEurDoesNotBlockInitialAssignment(): void {
  assert.equal(canApplyInitialGeoCurrency('EUR'), true);
  assert.equal(canApplyInitialGeoCurrency('eur'), true);
  assert.equal(canApplyInitialGeoCurrency('auto'), true);
  assert.equal(canApplyInitialGeoCurrency(''), true);
  assert.equal(canApplyInitialGeoCurrency(null), true);
  assert.equal(canApplyInitialGeoCurrency('RSD'), false);
  assert.equal(canApplyInitialGeoCurrency('USD'), false);
}

function testOngoingGeoDoesNotOverwriteChosenOrAssignedCurrency(): void {
  assert.equal(canApplyOngoingGeoCurrency('EUR'), false);
  assert.equal(canApplyOngoingGeoCurrency('RSD'), false);
  assert.equal(canApplyOngoingGeoCurrency('auto'), true);
  assert.equal(canApplyOngoingGeoCurrency(null), true);
}

testSerbiaMapsToRsd();
testEurozoneAndLocals();
testAsiaMarketsMapToLocalCurrency();
testUnknownCountryLeavesMappingOpen();
testNormalizeCurrencyCode();
testEurDoesNotBlockInitialAssignment();
testOngoingGeoDoesNotOverwriteChosenOrAssignedCurrency();
console.log('currencyFromCountry.test: ok');
