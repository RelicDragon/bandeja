import { getExchangeRates, ExchangeRatesResponse } from '@/api/currency';
import { PriceCurrency } from '@/types';

/**
 * Currency cache service
 * Caches exchange rates with 2-hour expiration
 */

interface CachedRates {
  data: ExchangeRatesResponse;
  timestamp: number;
}

const CACHE_KEY_PREFIX = 'currency_rates_';
const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

class CurrencyCacheService {
  private memoryCache: Map<string, CachedRates> = new Map();

  /**
   * Get exchange rates for a base currency (with caching)
   * @param baseCurrency Base currency code
   * @returns Exchange rates object
   */
  async getRates(baseCurrency: PriceCurrency): Promise<ExchangeRatesResponse> {
    const cacheKey = `${CACHE_KEY_PREFIX}${baseCurrency}`;
    const now = Date.now();

    // Check memory cache first
    const memCached = this.memoryCache.get(cacheKey);
    if (memCached && now - memCached.timestamp < CACHE_DURATION_MS) {
      return memCached.data;
    }

    // Check localStorage cache
    try {
      const stored = localStorage.getItem(cacheKey);
      if (stored) {
        const cached: CachedRates = JSON.parse(stored);
        if (now - cached.timestamp < CACHE_DURATION_MS) {
          // Update memory cache
          this.memoryCache.set(cacheKey, cached);
          return cached.data;
        }
      }
    } catch (err) {
      console.warn('[CurrencyCache] Failed to read from localStorage:', err);
    }

    // Fetch fresh data
    const data = await getExchangeRates(baseCurrency);
    const cached: CachedRates = { data, timestamp: now };

    // Save to both caches
    this.memoryCache.set(cacheKey, cached);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cached));
    } catch (err) {
      console.warn('[CurrencyCache] Failed to save to localStorage:', err);
    }

    return data;
  }

  /**
   * Convert price between currencies using cached rates
   * @param amountCents Amount in cents
   * @param fromCurrency Source currency
   * @param toCurrency Target currency
   * @returns Converted amount in cents
   */
  async convertPrice(
    amountCents: number,
    fromCurrency: PriceCurrency,
    toCurrency: PriceCurrency
  ): Promise<number> {
    if (fromCurrency === toCurrency) return amountCents;

    const rates = await this.getRates(fromCurrency);
    const rate = rates.rates[toCurrency];

    if (!rate) {
      console.warn(`[CurrencyCache] No rate found for ${fromCurrency} -> ${toCurrency}`);
      return amountCents;
    }

    return Math.round(amountCents * rate);
  }

  /**
   * Prefetch rates for a specific currency
   * Call this when entering marketplace
   */
  async prefetch(baseCurrency: PriceCurrency): Promise<void> {
    try {
      await this.getRates(baseCurrency);
    } catch (err) {
      console.error('[CurrencyCache] Failed to prefetch rates:', err);
    }
  }

  /**
   * Clear all cached rates
   */
  clearCache(): void {
    this.memoryCache.clear();

    try {
      // Clear localStorage entries
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
    } catch (err) {
      console.warn('[CurrencyCache] Failed to clear localStorage cache:', err);
    }
  }
}

export const currencyCacheService = new CurrencyCacheService();
