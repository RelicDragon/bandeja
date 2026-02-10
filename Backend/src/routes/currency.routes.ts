import { Router } from 'express';
import {
  getExchangeRates,
  convertCurrency,
  getCurrencyList,
  updateRates,
} from '../controllers/currency.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { requireAdmin } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/currency/list
 * @desc    Get list of all supported currencies
 * @access  Public
 */
router.get('/list', asyncHandler(getCurrencyList));

/**
 * @route   GET /api/currency/rates
 * @desc    Get current exchange rates for all supported currencies
 * @access  Public
 */
router.get('/rates', asyncHandler(getExchangeRates));

/**
 * @route   POST /api/currency/convert
 * @desc    Convert amount between currencies
 * @access  Public
 */
router.post('/convert', asyncHandler(convertCurrency));

/**
 * @route   POST /api/currency/update-rates
 * @desc    Manually trigger exchange rate update
 * @access  Private (admin only)
 */
router.post('/update-rates', requireAdmin, asyncHandler(updateRates));

export default router;
