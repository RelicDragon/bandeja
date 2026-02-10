import api from './axios';
import { PriceCurrency } from '../types';

export interface CurrencyRate {
  code: PriceCurrency;
  name: string;
}

export interface ExchangeRatesResponse {
  base: PriceCurrency;
  date: string;
  rates: Record<string, number>;
  lastUpdate?: string;
}

export interface ConvertCurrencyRequest {
  amountCents: number;
  from: PriceCurrency;
  to: PriceCurrency;
}

export interface ConvertCurrencyResponse {
  original: {
    amountCents: number;
    currency: PriceCurrency;
    formatted: string;
  };
  converted: {
    amountCents: number;
    currency: PriceCurrency;
    formatted: string;
  };
  exchangeRate: number;
}

/**
 * Get list of all supported currencies
 */
export async function getCurrencyList(): Promise<CurrencyRate[]> {
  const response = await api.get<{ success: boolean; data: CurrencyRate[] }>('/currency/list');
  return response.data.data;
}

/**
 * Get current exchange rates for a base currency
 * @param base Base currency (default: EUR)
 */
export async function getExchangeRates(base: PriceCurrency = 'EUR'): Promise<ExchangeRatesResponse> {
  const response = await api.get<{ success: boolean; data: ExchangeRatesResponse }>(
    `/currency/rates?base=${base}`
  );
  return response.data.data;
}

/**
 * Convert amount between currencies
 * @param request Conversion request
 */
export async function convertCurrency(request: ConvertCurrencyRequest): Promise<ConvertCurrencyResponse> {
  const response = await api.post<{ success: boolean; data: ConvertCurrencyResponse }>(
    '/currency/convert',
    request
  );
  return response.data.data;
}

/**
 * Manually trigger exchange rate update (admin only)
 */
export async function updateExchangeRates(): Promise<void> {
  await api.post('/currency/update-rates');
}
