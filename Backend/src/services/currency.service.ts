import { PriceCurrency } from '@prisma/client';
import prisma from '../config/database';

/**
 * Currency conversion service using ExchangeRate-API
 * API Docs: https://www.exchangerate-api.com/docs/free
 *
 * Exchange rates are fetched from ExchangeRate-API and stored in the database.
 * Rates are automatically updated every 2 hours via cron job.
 *
 * Note: ExchangeRate-API supports 160+ currencies including RSD (Serbian Dinar)
 * which is not available in ECB/Frankfurter API.
 */

interface ExchangeRates {
  base: string;
  date: string;
  rates: Record<string, number>;
}

class CurrencyService {
  private static readonly EXCHANGERATE_API = 'https://open.er-api.com/v6';
  private static readonly SUPPORTED_CURRENCIES: PriceCurrency[] = [
    'EUR', 'USD', 'GBP', 'JPY', 'CNY', 'CHF', 'CAD', 'AUD', 'NZD',
    'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN',
    'RUB', 'RSD', 'TRY', 'INR', 'BRL', 'MXN',
    'SGD', 'HKD', 'KRW', 'THB', 'MYR', 'IDR', 'PHP'
  ];

  /**
   * Fetch latest exchange rates from ExchangeRate-API
   * @param baseCurrency Base currency for conversion
   */
  private static async fetchFromAPI(baseCurrency: PriceCurrency): Promise<ExchangeRates | null> {
    try {
      const url = `${this.EXCHANGERATE_API}/latest/${baseCurrency}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[CurrencyService] API error: ${response.status} ${response.statusText}`);
        return null;
      }

      const apiData = await response.json();

      // ExchangeRate-API response format:
      // { base_code: "EUR", rates: { USD: 1.08, RSD: 117.15, ... }, time_last_update_utc: "..." }

      if (!apiData.rates) {
        console.error('[CurrencyService] Invalid API response format');
        return null;
      }

      // Filter to only supported currencies
      const filteredRates: Record<string, number> = {};
      for (const currency of this.SUPPORTED_CURRENCIES) {
        if (currency !== baseCurrency && apiData.rates[currency]) {
          filteredRates[currency] = apiData.rates[currency];
        }
      }

      // Convert to our standard format
      const data: ExchangeRates = {
        base: baseCurrency,
        date: apiData.time_last_update_utc?.split('T')[0] || new Date().toISOString().split('T')[0],
        rates: filteredRates,
      };

      return data;
    } catch (error) {
      console.error('[CurrencyService] Failed to fetch from API:', error);
      return null;
    }
  }

  /**
   * Update exchange rates in database from API
   * This method should be called by cron job every 2 hours
   */
  static async updateRatesFromAPI(): Promise<void> {
    console.log('[CurrencyService] Updating exchange rates from API...');

    try {
      // Fetch rates for each base currency
      for (const baseCurrency of this.SUPPORTED_CURRENCIES) {
        const data = await this.fetchFromAPI(baseCurrency);

        if (!data) {
          console.warn(`[CurrencyService] Failed to fetch rates for ${baseCurrency}, skipping`);
          continue;
        }

        // Save each rate to database
        for (const [targetCurrency, rate] of Object.entries(data.rates)) {
          await prisma.exchangeRate.upsert({
            where: {
              baseCurrency_targetCurrency: {
                baseCurrency,
                targetCurrency: targetCurrency as PriceCurrency,
              },
            },
            create: {
              baseCurrency,
              targetCurrency: targetCurrency as PriceCurrency,
              rate,
              fetchedFromAPI: new Date(),
              lastUpdated: new Date(),
            },
            update: {
              rate,
              fetchedFromAPI: new Date(),
              lastUpdated: new Date(),
            },
          });
        }

        console.log(`[CurrencyService] Updated ${Object.keys(data.rates).length} rates for ${baseCurrency}`);
      }

      console.log('[CurrencyService] ✅ Exchange rates updated successfully');
    } catch (error) {
      console.error('[CurrencyService] ❌ Error updating rates:', error);
      throw error;
    }
  }

  /**
   * Get exchange rate between two currencies from database
   * @param from Source currency
   * @param to Target currency
   * @returns Exchange rate (1 unit of 'from' = X units of 'to')
   */
  static async getExchangeRate(from: PriceCurrency, to: PriceCurrency): Promise<number> {
    if (from === to) return 1;

    try {
      const rate = await prisma.exchangeRate.findUnique({
        where: {
          baseCurrency_targetCurrency: {
            baseCurrency: from,
            targetCurrency: to,
          },
        },
      });

      if (!rate) {
        // If rate not found, try to update from API immediately
        console.warn(`[CurrencyService] Rate ${from}->${to} not found in DB, fetching from API...`);
        await this.updateRatesFromAPI();

        // Try again
        const rateRetry = await prisma.exchangeRate.findUnique({
          where: {
            baseCurrency_targetCurrency: {
              baseCurrency: from,
              targetCurrency: to,
            },
          },
        });

        return rateRetry?.rate || 1; // Fallback to 1:1 if still not found
      }

      return rate.rate;
    } catch (error) {
      console.error('[CurrencyService] Error getting exchange rate:', error);
      return 1; // Fallback to 1:1
    }
  }

  /**
   * Get all current exchange rates from database
   * @param baseCurrency Base currency (default: EUR)
   * @returns Object with all exchange rates
   */
  static async getAllRates(baseCurrency: PriceCurrency = 'EUR'): Promise<ExchangeRates> {
    try {
      const rates = await prisma.exchangeRate.findMany({
        where: { baseCurrency },
        select: {
          targetCurrency: true,
          rate: true,
          lastUpdated: true,
        },
      });

      if (rates.length === 0) {
        // No rates in database, fetch from API
        console.warn('[CurrencyService] No rates in DB, fetching from API...');
        await this.updateRatesFromAPI();

        // Try again
        const ratesRetry = await prisma.exchangeRate.findMany({
          where: { baseCurrency },
          select: {
            targetCurrency: true,
            rate: true,
            lastUpdated: true,
          },
        });

        const ratesObject = ratesRetry.reduce((acc, r) => {
          acc[r.targetCurrency] = r.rate;
          return acc;
        }, {} as Record<string, number>);

        const latestDate = ratesRetry.length > 0
          ? ratesRetry[0].lastUpdated.toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0];

        return {
          base: baseCurrency,
          date: latestDate,
          rates: ratesObject,
        };
      }

      const ratesObject = rates.reduce((acc, r) => {
        acc[r.targetCurrency] = r.rate;
        return acc;
      }, {} as Record<string, number>);

      const latestDate = rates[0].lastUpdated.toISOString().split('T')[0];

      return {
        base: baseCurrency,
        date: latestDate,
        rates: ratesObject,
      };
    } catch (error) {
      console.error('[CurrencyService] Error getting all rates:', error);
      // Return fallback 1:1 rates
      const fallbackRates = this.SUPPORTED_CURRENCIES
        .filter(c => c !== baseCurrency)
        .reduce((acc, curr) => {
          acc[curr] = 1;
          return acc;
        }, {} as Record<string, number>);

      return {
        base: baseCurrency,
        date: new Date().toISOString().split('T')[0],
        rates: fallbackRates,
      };
    }
  }

  /**
   * Convert an amount from one currency to another
   * @param amountCents Amount in cents (integer)
   * @param fromCurrency Source currency
   * @param toCurrency Target currency
   * @returns Converted amount in cents (rounded to nearest integer)
   */
  static async convertAmount(
    amountCents: number,
    fromCurrency: PriceCurrency,
    toCurrency: PriceCurrency
  ): Promise<number> {
    if (fromCurrency === toCurrency) return amountCents;

    const rate = await this.getExchangeRate(fromCurrency, toCurrency);
    return Math.round(amountCents * rate);
  }

  /**
   * Convert a price object to target currency
   * @param priceCents Price in cents
   * @param originalCurrency Original currency
   * @param targetCurrency Target currency
   * @returns Object with converted price and currency
   */
  static async convertPrice(
    priceCents: number | null,
    originalCurrency: PriceCurrency,
    targetCurrency: PriceCurrency
  ): Promise<{ priceCents: number | null; currency: PriceCurrency }> {
    if (priceCents === null) {
      return { priceCents: null, currency: targetCurrency };
    }

    if (originalCurrency === targetCurrency) {
      return { priceCents, currency: originalCurrency };
    }

    const convertedAmount = await this.convertAmount(priceCents, originalCurrency, targetCurrency);
    return { priceCents: convertedAmount, currency: targetCurrency };
  }

  /**
   * Get currency symbol for a given currency code
   */
  private static getCurrencySymbol(currency: PriceCurrency): { symbol: string; position: 'before' | 'after' } {
    const symbols: Record<PriceCurrency, { symbol: string; position: 'before' | 'after' }> = {
      EUR: { symbol: '€', position: 'before' },
      USD: { symbol: '$', position: 'before' },
      GBP: { symbol: '£', position: 'before' },
      JPY: { symbol: '¥', position: 'before' },
      CNY: { symbol: '¥', position: 'before' },
      CHF: { symbol: 'CHF', position: 'after' },
      CAD: { symbol: 'C$', position: 'before' },
      AUD: { symbol: 'A$', position: 'before' },
      NZD: { symbol: 'NZ$', position: 'before' },
      SEK: { symbol: 'kr', position: 'after' },
      NOK: { symbol: 'kr', position: 'after' },
      DKK: { symbol: 'kr', position: 'after' },
      PLN: { symbol: 'zł', position: 'after' },
      CZK: { symbol: 'Kč', position: 'after' },
      HUF: { symbol: 'Ft', position: 'after' },
      RON: { symbol: 'lei', position: 'after' },
      BGN: { symbol: 'лв', position: 'after' },
      RUB: { symbol: '₽', position: 'before' },
      RSD: { symbol: 'RSD', position: 'after' },
      TRY: { symbol: '₺', position: 'before' },
      INR: { symbol: '₹', position: 'before' },
      BRL: { symbol: 'R$', position: 'before' },
      MXN: { symbol: 'MX$', position: 'before' },
      SGD: { symbol: 'S$', position: 'before' },
      HKD: { symbol: 'HK$', position: 'before' },
      KRW: { symbol: '₩', position: 'before' },
      THB: { symbol: '฿', position: 'before' },
      MYR: { symbol: 'RM', position: 'before' },
      IDR: { symbol: 'Rp', position: 'before' },
      PHP: { symbol: '₱', position: 'before' },
    };

    return symbols[currency] || { symbol: currency, position: 'after' };
  }

  /**
   * Get formatted price string with currency symbol
   * @param priceCents Price in cents
   * @param currency Currency
   * @returns Formatted price string (e.g., "€25.00", "1,250.00 RSD")
   */
  static formatPrice(priceCents: number | null, currency: PriceCurrency): string {
    if (priceCents === null) return 'N/A';

    const amount = priceCents / 100;

    // Special formatting for currencies that don't use decimal places
    const noDecimalCurrencies: PriceCurrency[] = ['JPY', 'KRW', 'IDR'];
    const decimals = noDecimalCurrencies.includes(currency) ? 0 : 2;

    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

    const { symbol, position } = this.getCurrencySymbol(currency);

    return position === 'before' ? `${symbol}${formatted}` : `${formatted} ${symbol}`;
  }

  /**
   * Convert and format price for display to user
   * @param priceCents Original price in cents
   * @param originalCurrency Original currency
   * @param userCurrency User's preferred currency
   * @returns Object with original and converted price information
   */
  static async getPriceForUser(
    priceCents: number | null,
    originalCurrency: PriceCurrency,
    userCurrency: PriceCurrency
  ): Promise<{
    original: { priceCents: number | null; currency: PriceCurrency; formatted: string };
    converted?: { priceCents: number; currency: PriceCurrency; formatted: string };
    exchangeRate?: number;
  }> {
    const result = {
      original: {
        priceCents,
        currency: originalCurrency,
        formatted: this.formatPrice(priceCents, originalCurrency),
      },
    } as {
      original: { priceCents: number | null; currency: PriceCurrency; formatted: string };
      converted?: { priceCents: number; currency: PriceCurrency; formatted: string };
      exchangeRate?: number;
    };

    if (priceCents !== null && originalCurrency !== userCurrency) {
      const rate = await this.getExchangeRate(originalCurrency, userCurrency);
      const convertedAmount = await this.convertAmount(priceCents, originalCurrency, userCurrency);

      result.converted = {
        priceCents: convertedAmount,
        currency: userCurrency,
        formatted: this.formatPrice(convertedAmount, userCurrency),
      };
      result.exchangeRate = rate;
    }

    return result;
  }

  /**
   * Get last update time for exchange rates
   */
  static async getLastUpdateTime(): Promise<Date | null> {
    try {
      const latestRate = await prisma.exchangeRate.findFirst({
        orderBy: { lastUpdated: 'desc' },
        select: { lastUpdated: true },
      });

      return latestRate?.lastUpdated || null;
    } catch (error) {
      console.error('[CurrencyService] Error getting last update time:', error);
      return null;
    }
  }
}

export default CurrencyService;
