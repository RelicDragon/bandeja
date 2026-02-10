#!/usr/bin/env ts-node

/**
 * Test script for Currency Service
 *
 * Run with: npm run test:currency
 * Or directly: ts-node scripts/test-currency-service.ts
 */

import CurrencyService from '../src/services/currency.service';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: string = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function success(message: string) {
  log(`✅ ${message}`, COLORS.green);
}

function error(message: string) {
  log(`❌ ${message}`, COLORS.red);
}

function info(message: string) {
  log(`ℹ️  ${message}`, COLORS.cyan);
}

function header(message: string) {
  log(`\n${'='.repeat(60)}`, COLORS.blue);
  log(message, COLORS.blue);
  log('='.repeat(60), COLORS.blue);
}

async function testGetAllRates() {
  header('Test 1: Get All Exchange Rates');

  try {
    const rates = await CurrencyService.getAllRates('EUR');

    info(`Base: ${rates.base}`);
    info(`Date: ${rates.date}`);
    info('Rates:');

    for (const [currency, rate] of Object.entries(rates.rates)) {
      console.log(`  ${currency}: ${rate.toFixed(4)}`);
    }

    if (rates.base === 'EUR' && rates.rates.RSD && rates.rates.RUB) {
      success('Get all rates test passed');
      return true;
    } else {
      error('Get all rates test failed - missing expected currencies');
      return false;
    }
  } catch (err) {
    error(`Get all rates test failed: ${err}`);
    return false;
  }
}

async function testGetExchangeRate() {
  header('Test 2: Get Single Exchange Rate');

  try {
    const eurToRsd = await CurrencyService.getExchangeRate('EUR', 'RSD');
    const rsdToEur = await CurrencyService.getExchangeRate('RSD', 'EUR');
    const eurToEur = await CurrencyService.getExchangeRate('EUR', 'EUR');

    info(`1 EUR = ${eurToRsd.toFixed(4)} RSD`);
    info(`1 RSD = ${rsdToEur.toFixed(6)} EUR`);
    info(`1 EUR = ${eurToEur.toFixed(4)} EUR`);

    if (eurToRsd > 100 && rsdToEur < 0.01 && eurToEur === 1) {
      success('Get exchange rate test passed');
      return true;
    } else {
      error('Get exchange rate test failed - unexpected rates');
      return false;
    }
  } catch (err) {
    error(`Get exchange rate test failed: ${err}`);
    return false;
  }
}

async function testConvertAmount() {
  header('Test 3: Convert Amount');

  try {
    const eurCents = 10000; // 100 EUR
    const rsdCents = await CurrencyService.convertAmount(eurCents, 'EUR', 'RSD');
    const rubCents = await CurrencyService.convertAmount(eurCents, 'EUR', 'RUB');
    const sameCents = await CurrencyService.convertAmount(eurCents, 'EUR', 'EUR');

    info(`${eurCents / 100} EUR = ${rsdCents / 100} RSD`);
    info(`${eurCents / 100} EUR = ${rubCents / 100} RUB`);
    info(`${eurCents / 100} EUR = ${sameCents / 100} EUR`);

    if (rsdCents > 1000000 && rubCents > 900000 && sameCents === eurCents) {
      success('Convert amount test passed');
      return true;
    } else {
      error('Convert amount test failed - unexpected conversion results');
      return false;
    }
  } catch (err) {
    error(`Convert amount test failed: ${err}`);
    return false;
  }
}

async function testFormatPrice() {
  header('Test 4: Format Price');

  try {
    const eurFormatted = CurrencyService.formatPrice(5000, 'EUR');
    const rsdFormatted = CurrencyService.formatPrice(1171500, 'RSD');
    const rubFormatted = CurrencyService.formatPrice(1065000, 'RUB');
    const nullFormatted = CurrencyService.formatPrice(null, 'EUR');

    info(`5000 cents EUR: ${eurFormatted}`);
    info(`1171500 cents RSD: ${rsdFormatted}`);
    info(`1065000 cents RUB: ${rubFormatted}`);
    info(`null: ${nullFormatted}`);

    if (
      eurFormatted === '€50.00' &&
      rsdFormatted.includes('11,715.00') &&
      rubFormatted.includes('10,650.00') &&
      nullFormatted === 'N/A'
    ) {
      success('Format price test passed');
      return true;
    } else {
      error('Format price test failed - unexpected formatting');
      info(`Expected EUR: €50.00, got: ${eurFormatted}`);
      return false;
    }
  } catch (err) {
    error(`Format price test failed: ${err}`);
    return false;
  }
}

async function testGetPriceForUser() {
  header('Test 5: Get Price For User (with conversion)');

  try {
    const result = await CurrencyService.getPriceForUser(10000, 'EUR', 'RSD');

    info(`Original: ${result.original.formatted}`);
    if (result.converted) {
      info(`Converted: ${result.converted.formatted}`);
      info(`Exchange Rate: ${result.exchangeRate?.toFixed(4)}`);
    }

    if (
      result.original.priceCents === 10000 &&
      result.original.currency === 'EUR' &&
      result.converted &&
      result.converted.priceCents > 1000000 &&
      result.converted.currency === 'RSD'
    ) {
      success('Get price for user test passed');
      return true;
    } else {
      error('Get price for user test failed');
      return false;
    }
  } catch (err) {
    error(`Get price for user test failed: ${err}`);
    return false;
  }
}

async function testGetPriceForUserSameCurrency() {
  header('Test 6: Get Price For User (same currency)');

  try {
    const result = await CurrencyService.getPriceForUser(10000, 'EUR', 'EUR');

    info(`Original: ${result.original.formatted}`);
    info(`Converted: ${result.converted ? result.converted.formatted : 'None (same currency)'}`);

    if (
      result.original.priceCents === 10000 &&
      result.original.currency === 'EUR' &&
      !result.converted
    ) {
      success('Get price for user (same currency) test passed');
      return true;
    } else {
      error('Get price for user (same currency) test failed');
      return false;
    }
  } catch (err) {
    error(`Get price for user (same currency) test failed: ${err}`);
    return false;
  }
}

async function testLastUpdateTime() {
  header('Test 7: Last Update Time');

  try {
    const lastUpdate = await CurrencyService.getLastUpdateTime();

    if (lastUpdate) {
      info(`Last update: ${lastUpdate.toISOString()}`);
      success('Last update time test passed');
      return true;
    } else {
      error('Last update time is null');
      return false;
    }
  } catch (err) {
    error(`Last update time test failed: ${err}`);
    return false;
  }
}

async function runAllTests() {
  log('\n🧪 Currency Service Test Suite\n', COLORS.cyan);

  const results: boolean[] = [];

  results.push(await testGetAllRates());
  results.push(await testGetExchangeRate());
  results.push(await testConvertAmount());
  results.push(await testFormatPrice());
  results.push(await testGetPriceForUser());
  results.push(await testGetPriceForUserSameCurrency());
  results.push(await testLastUpdateTime());

  // Summary
  header('Test Summary');

  const passed = results.filter(r => r).length;
  const total = results.length;

  log(`\nTests Passed: ${passed}/${total}`, passed === total ? COLORS.green : COLORS.red);

  if (passed === total) {
    success('All tests passed! 🎉\n');
    return 0;
  } else {
    error(`${total - passed} test(s) failed\n`);
    return 1;
  }
}

// Run tests
runAllTests()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(err => {
    error(`Unexpected error: ${err}`);
    process.exit(1);
  });
