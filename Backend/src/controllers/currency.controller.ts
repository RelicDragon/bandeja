import { Request, Response } from 'express';
import CurrencyService from '../services/currency.service';
import { PriceCurrency } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { SUPPORTED_CURRENCIES, CURRENCY_NAMES } from '../utils/constants';

/**
 * Get current exchange rates for all supported currencies
 * GET /api/currency/rates?base=EUR
 */
export const getExchangeRates = async (req: Request, res: Response) => {
  const { base = 'EUR' } = req.query;

  // Validate base currency
  if (!SUPPORTED_CURRENCIES.includes(base as PriceCurrency)) {
    throw new ApiError(400, `Invalid base currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }

  const rates = await CurrencyService.getAllRates(base as PriceCurrency);
  const lastUpdate = await CurrencyService.getLastUpdateTime();

  res.json({
    success: true,
    data: {
      ...rates,
      lastUpdate: lastUpdate?.toISOString(),
    },
  });
};

/**
 * Convert an amount between two currencies
 * POST /api/currency/convert
 * Body: { amountCents: number, from: string, to: string }
 */
export const convertCurrency = async (req: Request, res: Response) => {
  const { amountCents, from, to } = req.body;

  if (typeof amountCents !== 'number' || amountCents < 0) {
    throw new ApiError(400, 'Invalid amount');
  }

  if (!SUPPORTED_CURRENCIES.includes(from as PriceCurrency)) {
    throw new ApiError(400, `Invalid source currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }
  if (!SUPPORTED_CURRENCIES.includes(to as PriceCurrency)) {
    throw new ApiError(400, `Invalid target currency. Supported: ${SUPPORTED_CURRENCIES.join(', ')}`);
  }

  const convertedAmount = await CurrencyService.convertAmount(
    amountCents,
    from as PriceCurrency,
    to as PriceCurrency
  );

  const rate = await CurrencyService.getExchangeRate(
    from as PriceCurrency,
    to as PriceCurrency
  );

  res.json({
    success: true,
    data: {
      original: {
        amountCents,
        currency: from,
        formatted: CurrencyService.formatPrice(amountCents, from as PriceCurrency),
      },
      converted: {
        amountCents: convertedAmount,
        currency: to,
        formatted: CurrencyService.formatPrice(convertedAmount, to as PriceCurrency),
      },
      exchangeRate: rate,
    },
  });
};

/**
 * Get list of all supported currencies
 * GET /api/currency/list
 */
export const getCurrencyList = async (req: Request, res: Response) => {
  const currencies = SUPPORTED_CURRENCIES.map(code => ({
    code,
    name: CURRENCY_NAMES[code] || code,
  }));

  res.json({
    success: true,
    data: currencies,
  });
};

/**
 * Manually trigger update of exchange rates (admin only)
 * POST /api/currency/update-rates
 */
export const updateRates = async (req: Request, res: Response) => {
  await CurrencyService.updateRatesFromAPI();

  res.json({
    success: true,
    message: 'Exchange rates updated successfully',
  });
};
