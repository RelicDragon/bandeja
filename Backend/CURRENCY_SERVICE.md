# Currency Conversion Service

This document describes the currency conversion service implementation using the Frankfurter API with database persistence.

## Overview

The currency service provides real-time exchange rates for the three supported currencies in PadelPulse:
- **EUR** (Euro)
- **RSD** (Serbian Dinar)
- **RUB** (Russian Ruble)

Exchange rates are fetched from the Frankfurter API and stored in the database. Rates are automatically updated every 2 hours via a cron job.

## Architecture

### Database Model

Exchange rates are stored in the `ExchangeRate` table:

```prisma
model ExchangeRate {
  id               String        @id @default(cuid())
  baseCurrency     PriceCurrency
  targetCurrency   PriceCurrency
  rate             Float
  lastUpdated      DateTime      @default(now())
  fetchedFromAPI   DateTime      @default(now())
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@unique([baseCurrency, targetCurrency])
  @@index([baseCurrency])
  @@index([lastUpdated])
}
```

### Automatic Updates

The `CurrencyScheduler` service runs a cron job that:
- Executes every 2 hours (at 00:00, 02:00, 04:00, etc.)
- Fetches latest rates from Frankfurter API
- Updates all currency pairs in the database
- Runs on server startup to ensure initial rates are available

### ExchangeRate-API

We use the [ExchangeRate-API](https://www.exchangerate-api.com/), a free and reliable API for current exchange rates.

**API Endpoint:** `https://open.er-api.com/v6`

**Features:**
- ✅ Free to use (no API key required for open endpoint)
- ✅ Updated daily from multiple reliable sources
- ✅ No rate limits for reasonable use
- ✅ Simple REST API
- ✅ Supports 160+ currencies including RSD (Serbian Dinar)

**Note:** We switched from Frankfurter API because it only supports ECB currencies (30 currencies) and does not include RSD, which is critical for the Serbian market.

## Service Implementation

### File Locations

- **Service:** `Backend/src/services/currency.service.ts`
- **Scheduler:** `Backend/src/services/currencyScheduler.service.ts`
- **Controller:** `Backend/src/controllers/currency.controller.ts`
- **Routes:** `Backend/src/routes/currency.routes.ts`

### Key Methods

#### 1. Get Exchange Rate

```typescript
const rate = await CurrencyService.getExchangeRate('EUR', 'RSD');
// Returns: 117.15 (1 EUR = 117.15 RSD)
// Reads from database (not API)
```

#### 2. Get All Rates

```typescript
const rates = await CurrencyService.getAllRates('EUR');
// Returns: { base: 'EUR', date: '2026-02-10', rates: { RSD: 117.15, RUB: 106.50 } }
// Includes lastUpdate timestamp
```

#### 3. Convert Amount

```typescript
// Convert 5000 cents (50 EUR) to RSD
const convertedCents = await CurrencyService.convertAmount(5000, 'EUR', 'RSD');
// Returns: 585750 cents (5857.50 RSD)
```

#### 4. Format Price

```typescript
const formatted = CurrencyService.formatPrice(5000, 'EUR');
// Returns: "€50.00"

const formatted2 = CurrencyService.formatPrice(585750, 'RSD');
// Returns: "5,857.50 RSD"
```

#### 5. Get Price for User (with conversion)

```typescript
const priceInfo = await CurrencyService.getPriceForUser(5000, 'EUR', 'RSD');
// Returns:
// {
//   original: {
//     priceCents: 5000,
//     currency: 'EUR',
//     formatted: '€50.00'
//   },
//   converted: {
//     priceCents: 585750,
//     currency: 'RSD',
//     formatted: '5,857.50 RSD'
//   },
//   exchangeRate: 117.15
// }
```

#### 6. Update Rates from API (Admin only)

```typescript
await CurrencyService.updateRatesFromAPI();
// Fetches latest rates and updates database
// Called automatically every 2 hours by cron job
// Can also be triggered manually via API
```

## API Endpoints

### 1. Get Exchange Rates (Public)

```http
GET /api/currency/rates?base=EUR
```

**Response:**
```json
{
  "success": true,
  "data": {
    "base": "EUR",
    "date": "2026-02-10",
    "rates": {
      "RSD": 117.15,
      "RUB": 106.50
    },
    "lastUpdate": "2026-02-10T12:00:00.000Z"
  }
}
```

### 2. Convert Currency (Public)

```http
POST /api/currency/convert
Content-Type: application/json

{
  "amountCents": 5000,
  "from": "EUR",
  "to": "RSD"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "original": {
      "amountCents": 5000,
      "currency": "EUR",
      "formatted": "€50.00"
    },
    "converted": {
      "amountCents": 585750,
      "currency": "RSD",
      "formatted": "5,857.50 RSD"
    },
    "exchangeRate": 117.15
  }
}
```

### 3. Update Rates (Admin Only)

```http
POST /api/currency/update-rates
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Exchange rates updated successfully"
}
```

## Frontend Integration

### Getting Current Rates

```typescript
// In your React/Vue component or service
const response = await fetch('/api/currency/rates?base=EUR');
const data = await response.json();

console.log(data.data.rates);
// { RSD: 117.15, RUB: 106.50 }
console.log(data.data.lastUpdate);
// "2026-02-10T12:00:00.000Z"
```

### Converting Amounts

```typescript
// Convert price for display
const response = await fetch('/api/currency/convert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amountCents: marketItem.priceCents,
    from: marketItem.currency,
    to: userPreferredCurrency
  })
});

const { data } = await response.json();
// Display: data.converted.formatted
```

### Example: Marketplace Item Display

```typescript
interface MarketItem {
  priceCents: number;
  currency: 'EUR' | 'RSD' | 'RUB';
}

async function displayItemPrice(
  item: MarketItem,
  userCurrency: 'EUR' | 'RSD' | 'RUB'
) {
  if (item.currency === userCurrency) {
    // No conversion needed
    return formatPrice(item.priceCents, item.currency);
  }

  // Fetch conversion
  const response = await fetch('/api/currency/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountCents: item.priceCents,
      from: item.currency,
      to: userCurrency
    })
  });

  const { data } = await response.json();

  return {
    original: data.original.formatted,
    converted: data.converted.formatted,
    showBoth: true
  };
}
```

## Backend Integration Examples

### Marketplace Service Integration

```typescript
import CurrencyService from '../services/currency.service';

// When returning market items to frontend
export async function getMarketItemsForUser(userId: string, filters: any) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true }
  });

  const items = await prisma.marketItem.findMany({ /* ... */ });

  // Optionally convert prices for user's currency
  const itemsWithConvertedPrices = await Promise.all(
    items.map(async (item) => {
      const priceInfo = await CurrencyService.getPriceForUser(
        item.priceCents,
        item.currency,
        user?.defaultCurrency || 'EUR'
      );

      return {
        ...item,
        price: priceInfo
      };
    })
  );

  return itemsWithConvertedPrices;
}
```

### Game Entry Fee Display

```typescript
// In game controller
const game = await prisma.game.findUnique({ where: { id: gameId } });
const user = await prisma.user.findUnique({ where: { id: userId } });

const entryFee = await CurrencyService.getPriceForUser(
  game.priceCents,
  game.currency,
  user.defaultCurrency
);

return {
  ...game,
  entryFee
};
```

## Testing

### Manual Testing

```bash
# Start the backend server
npm run dev

# Test getting rates
curl http://localhost:3000/api/currency/rates?base=EUR

# Test conversion
curl -X POST http://localhost:3000/api/currency/convert \
  -H "Content-Type: application/json" \
  -d '{"amountCents": 10000, "from": "EUR", "to": "RSD"}'

# Manually trigger update (requires admin token)
curl -X POST http://localhost:3000/api/currency/update-rates \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Test Script

Run the test script to verify currency service functionality:

```bash
npm run test:currency
```

This will test:
- Fetching all exchange rates
- Getting single exchange rate
- Converting amounts
- Formatting prices
- Price conversion for users
- Database persistence

## Monitoring

### Check Last Update Time

```sql
-- In Prisma Studio or psql
SELECT * FROM "ExchangeRate" ORDER BY "lastUpdated" DESC LIMIT 1;
```

### View All Current Rates

```sql
SELECT "baseCurrency", "targetCurrency", "rate", "lastUpdated"
FROM "ExchangeRate"
ORDER BY "baseCurrency", "targetCurrency";
```

### Check Scheduler Logs

Look for these log messages in your server console:

```
💱 Currency scheduler started (runs every 2 hours)
💱 Updating exchange rates...
[CurrencyService] Updated 2 rates for EUR
[CurrencyService] Updated 2 rates for RSD
[CurrencyService] Updated 2 rates for RUB
[CurrencyService] ✅ Exchange rates updated successfully
```

## Error Handling

The service includes robust error handling:

1. **API Failures:** If Frankfurter API fails, existing database rates are used
2. **Missing Rates:** If a rate is not found in DB, service attempts to fetch from API immediately
3. **Fallback:** If all else fails, 1:1 rates are returned to prevent app breakage
4. **Logging:** All errors are logged with `[CurrencyService]` prefix

## Performance Considerations

- **Database Reads:** Fast queries with indexed fields
- **API Calls:** Only every 2 hours (instead of per-request)
- **Caching:** Database acts as persistent cache
- **Latency:** Typical conversion <10ms (database lookup only)
- **Reliability:** Service works even if Frankfurter API is down (uses cached rates)

## Maintenance

### Manually Update Rates

If you need to force an update outside the 2-hour schedule:

1. **Via API (recommended):**
   ```bash
   curl -X POST http://localhost:3000/api/currency/update-rates \
     -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
   ```

2. **Via Database:**
   ```bash
   npm run test:currency
   # Or directly in code:
   # await CurrencyService.updateRatesFromAPI();
   ```

### Adding New Currencies

To add support for more currencies:

1. Update `PriceCurrency` enum in `prisma/schema.prisma`
2. Run `prisma migrate dev`
3. Add currency to `SUPPORTED_CURRENCIES` in `currency.service.ts`
4. Update `formatPrice()` method to handle new currency symbol
5. Restart server (scheduler will fetch new rates)

## Future Enhancements

Potential improvements:
- [ ] Historical rate queries for reporting
- [ ] Rate change notifications/alerts
- [ ] Support for more currencies (USD, GBP, CHF, etc.)
- [ ] Currency conversion analytics (most converted pairs)
- [ ] Webhook integration for rate updates
- [ ] Admin dashboard showing rate trends

## References

- [ExchangeRate-API Documentation](https://www.exchangerate-api.com/docs/free)
- [ExchangeRate-API Open Endpoint](https://www.exchangerate-api.com/docs/open-api)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [National Bank of Serbia Exchange Rates](https://www.nbs.rs/en/finansijska-trzista/medjubankarsko-devizno-trziste/zvanicni-srednji-kurs/)
