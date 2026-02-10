# Marketplace Currency Conversion Implementation

## Overview
Implemented automatic currency conversion in the Marketplace to show prices in the user's preferred currency with caching support.

## Features Implemented

### 1. Currency Cache Service (`Frontend/src/services/currencyCache.service.ts`)
- **2-hour caching**: Exchange rates are cached for 2 hours to minimize API calls
- **Dual-layer caching**:
  - In-memory cache (fast, cleared on page refresh)
  - localStorage cache (persistent across sessions)
- **Automatic prefetching**: Rates are prefetched when entering the Marketplace
- **Rate conversion**: Converts prices between currencies using cached rates
- **Graceful degradation**: Falls back to original price if conversion fails

### 2. Currency Utilities Enhancement (`Frontend/src/utils/currency.ts`)
- Added `formatConvertedPrice()` function that formats both converted and original prices
- Returns an object with:
  - `main`: Converted price in user's currency (formatted)
  - `original`: Original price in listing's currency (formatted)
  - `showBoth`: Boolean flag indicating if both should be displayed

### 3. MarketplaceList Updates (`Frontend/src/pages/MarketplaceList.tsx`)
- **Automatic prefetching**: Calls `currencyCacheService.prefetch()` on mount
- Prefetches rates for the user's `defaultCurrency` (falls back to EUR)
- Passes `userCurrency` prop to each `MarketItemCard`

### 4. MarketItemCard Price Display (`Frontend/src/components/marketplace/MarketItemCard.tsx`)
- **Automatic conversion**: Converts item price to user's currency on mount and when currency changes
- **Dual price display**:
  - **Main price** (larger, bold): Shown in user's preferred currency
  - **Original price** (smaller, gray): Shown underneath if different from user's currency
- **Loading state**: Shows fallback price while conversion is in progress
- **Error handling**: Falls back to original price if conversion fails

## User Experience

### Example 1: Different Currencies
- User's currency: USD
- Item price: €50.00 EUR
- Display:
  ```
  $55.00        (main price in bold, primary color)
  €50.00        (original price in small gray text)
  ```

### Example 2: Same Currency
- User's currency: EUR
- Item price: €50.00 EUR
- Display:
  ```
  €50.00        (only one price shown)
  ```

## Technical Details

### Caching Strategy
1. **First request**: Fetch from API, store in both memory and localStorage
2. **Subsequent requests within 2 hours**: Use cached data
3. **After 2 hours**: Fetch fresh data and update cache
4. **Cache keys**: `currency_rates_{baseCurrency}` (e.g., `currency_rates_USD`)

### API Endpoints Used
- `GET /api/currency/rates?base={currency}` - Fetches exchange rates for a base currency
- Backend cron job updates rates every 2 hours using Frankfurter API

### Performance Optimization
- Rates are prefetched on Marketplace entry (not on demand)
- In-memory cache ensures instant lookups after first fetch
- localStorage cache survives page refreshes
- Minimal re-renders using React hooks

## Backend Integration
The implementation uses the existing backend currency infrastructure:
- `CurrencyService` (Backend) - Manages exchange rates in database
- `currencyScheduler.service` - Updates rates every 2 hours via cron
- Exchange rates stored in `ExchangeRate` model with Prisma

## Future Enhancements (Optional)
- Show currency conversion timestamp/age
- Allow users to manually refresh rates
- Add currency symbol badges to items
- Support for cryptocurrency (if needed)
- Bulk conversion for better performance with many items

## Testing Checklist
- [ ] User with USD sees EUR items converted to USD
- [ ] User with EUR sees RSD items converted to EUR
- [ ] Same currency items don't show duplicate price
- [ ] Cache persists for 2 hours
- [ ] Cache is refreshed after 2 hours
- [ ] localStorage fallback works if API fails
- [ ] Original price fallback works if conversion fails
- [ ] Prefetch doesn't block UI rendering
