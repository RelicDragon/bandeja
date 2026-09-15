# Economy

Virtual coins on the user wallet. No external top-up UI. Coins enter via admin grant, bet payouts, P2P, or API `PURCHASE`.

## Transactions

`TransactionType`: `NEW_COIN` | `TRANSFER` | `PURCHASE` | `REFUND`. History `GET /transactions`. Admin grant = `NEW_COIN`.

P2P: wallet modal or player card → `SendMoneyToUserModal`. `TRANSFER`, min 1, cannot exceed balance, optional message.

`TransactionRow` may reference `Goods`.

## Bets

Create/accept/update/cancel coin stakes on games. Locked when `resultsStatus` is `IN_PROGRESS` or `FINAL`. Resolve on results. Payout reconcile every 5 min. Socket bet events.

## Goods

`/goods` catalog (admin-managed). Purchasable via transactions API. **No shop UI.**

## Game price

Optional on create: `priceType`, `priceCurrency`, `priceTotal`. Display only — not charged in-app.

## FX

`CurrencyScheduler` every 2 hours (Frankfurter). `GET /currency`.
