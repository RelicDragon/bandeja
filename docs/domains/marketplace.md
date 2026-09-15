# Marketplace

Peer listings in the city. Routes: `/marketplace`, `/marketplace/my`, `/marketplace/create`, `/marketplace/:id`, `/marketplace/:id/edit`. Overlay `?item=` or path. Unread on Chats → Market filter (`/chats/marketplace`), not the Market bottom tab.

## Listings

`MarketItem`: title, description, up to 5 `mediaUrls`, `categoryId`, `cityId` + `additionalCityIds`, `tradeTypes` (`BUY_IT_NOW` | `SUGGESTED_PRICE` | `AUCTION` | `FREE`), prices in cents + `PriceCurrency`, `status` `ACTIVE` | `SOLD` | `RESERVED` | `WITHDRAWN`. Infinite scroll + category/city filters. Draft autosave on create/edit. Seller: view/edit/withdraw.

## Auctions

`AuctionType`: `RISING` (classical ascending) | `HOLLAND` (price drops). Fields: `auctionEndsAt`, `startingPriceCents`, `reservePriceCents`, `buyItNowPriceCents`, `currentPriceCents`, `hollandDecrementCents`, `hollandIntervalMinutes`, `winnerId`.

Bids: `MarketItemBid`. Place / buy-it-now / withdraw. Holland win flagged in bid service.

## Chats

`GroupChannel.marketItemId` + `buyerId` — seller/buyer threads. Express interest opens that thread.

## Live + schedulers

Socket auction rooms / bid events. `AuctionScheduler`: end auctions every 1 min; `tickHollandPrices` every 5 min (`Backend/src/services/auctionScheduler.service.ts`, `marketItemBid.service.ts`).

## Code

BE: `Backend/src/services/marketItem/*`, `/market-items`. FE: `pages/MarketplaceList.tsx`, `CreateMarketItem.tsx`, `MarketplaceItemRedirect.tsx`.
