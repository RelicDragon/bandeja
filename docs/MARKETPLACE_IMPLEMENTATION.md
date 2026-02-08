# Marketplace Implementation Plan

## Overview

Marketplace for users to sell/buy padel equipment. Each item has a public chat (GroupChannel with `isChannel: true`). Trade types: buy-it-now, suggested price, auction. Categories are admin-managed. Items use user's city by default.

---

## 1. Schema Changes (Prisma)

### MarketItemCategory (Admin-managed)

```prisma
model MarketItemCategory {
  id        String       @id @default(cuid())
  name      String
  order     Int          @default(0)
  isActive  Boolean      @default(true)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  items     MarketItem[]
}
```

### MarketItem

```prisma
enum MarketItemTradeType {
  BUY_IT_NOW
  SUGGESTED_PRICE
  AUCTION
}

enum MarketItemStatus {
  ACTIVE
  SOLD
  RESERVED
  WITHDRAWN
}

model MarketItem {
  id              String              @id @default(cuid())
  sellerId        String
  categoryId      String
  cityId          String
  title           String
  description     String?
  mediaUrls       String[]
  tradeType       MarketItemTradeType
  priceCents      Int?                // BUY_IT_NOW: fixed; SUGGESTED_PRICE: initial; AUCTION: starting bid
  currency        PriceCurrency       @default(EUR)
  auctionEndsAt   DateTime?           // AUCTION only
  status          MarketItemStatus    @default(ACTIVE)
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  seller          User                @relation(...)
  category        MarketItemCategory  @relation(...)
  city            City                @relation(...)
  groupChannel    GroupChannel?
}
```

### GroupChannel update

```prisma
model GroupChannel {
  // ... existing fields
  bugId        String?      @unique
  marketItemId String?      @unique
  marketItem   MarketItem?  @relation(...)
  @@index([marketItemId])
}
```

### City & User relations

- Add `marketItems MarketItem[]` to City
- Add `marketItems MarketItem[]` to User

---

## 2. GroupChannel + Chat

- Create GroupChannel with `isChannel: true`, `isPublic: true`, `marketItemId`, `cityId` when creating item
- Seller = OWNER participant
- Messages: `ChatContextType.GROUP`, `contextId` = groupChannel.id
- Public: anyone can see & join (join = get notifications)
- Reuse existing push/telegram flow for GROUP context

### GroupChannelService.getGroupChannels

Add `market` filter or extend `channels`:

- `marketItemId: { not: null }`, `bugId: null`
- Same access: participant or public

---

## 3. Backend Services

### marketItem.service.ts

- `createMarketItem(data)` – create item + GroupChannel in transaction
- `getMarketItems(filters)` – list by city, category, tradeType, status, pagination
- `getMarketItemById(id, userId?)` – single item with category, seller, city, groupChannel
- `updateMarketItem(id, userId, data)` – seller only, ACTIVE only
- `withdrawMarketItem(id, userId)` – set status WITHDRAWN

### marketItem/participant.service.ts

- `joinMarketItemChat(marketItemId, userId)` – join via groupChannel
- `leaveMarketItemChat(marketItemId, userId)` – leave
- `isParticipant(marketItemId, userId)` – check

### marketItem/trade.service.ts (Phase 2)

- `placeBid(marketItemId, userId, amount)` – AUCTION
- `acceptOffer(marketItemId, userId)` – SUGGESTED_PRICE
- `buyNow(marketItemId, userId)` – BUY_IT_NOW
- Mark SOLD/RESERVED, emit events

---

## 4. Backend Routes & Controllers

### marketItem.routes.ts

- `POST /market-items` – create (auth)
- `GET /market-items` – list (city, category, tradeType, status, page)
- `GET /market-items/:id` – get single
- `PUT /market-items/:id` – update (seller)
- `POST /market-items/:id/withdraw` – withdraw
- `POST /market-items/:id/join-chat` – join item chat
- `POST /market-items/:id/leave-chat` – leave item chat

### marketItemCategory (Admin)

- `GET /admin/market-categories` – list
- `POST /admin/market-categories` – create
- `PUT /admin/market-categories/:id` – update
- `DELETE /admin/market-categories/:id` – delete (if no items)

---

## 5. Admin Panel

- New section: Market Categories CRUD
- Admin nav: Marketplace / Categories
- Page: table (name, order, isActive, actions)

---

## 6. Frontend

### Navigation

- Add Marketplace tab (BottomTabBar or Find/Profile)
- Update navigationStore `currentPage`

### API (api/marketplace.ts)

- `getMarketItems(filters)`, `getMarketItemById(id)`
- `createMarketItem(data)`, `updateMarketItem(id, data)`, `withdrawMarketItem(id)`
- `joinMarketItemChat(id)`, `leaveMarketItemChat(id)`
- `getMarketCategories()` – public

### Pages

- **MarketplaceList** – list with filters (city, category, tradeType)
- **MarketplaceItemDetail** – item details, gallery, seller, trade actions, "Open chat" → GameChat with groupChannelId
- **CreateMarketItem** – form: category (read-only), city (default user), trade type, price/auction fields

### Chat

- From item: "Open chat" → navigate to chat with groupChannelId
- Add `market` filter to ChatList or show under channels
- Reuse GameChat for GROUP context with marketItem

---

## 7. Implementation Order

| Phase | Tasks |
|-------|-------|
| 1. Schema | MarketItemCategory, MarketItem, enums, GroupChannel.marketItemId, migration |
| 2. Admin | Admin routes + controller for categories, Admin UI |
| 3. Backend core | marketItem.service, participant.service, create + GroupChannel |
| 4. GroupChannel | Extend getGroupChannels with market filter |
| 5. Routes | marketItem.routes, marketItem.controller |
| 6. Frontend API | api/marketplace.ts |
| 7. Frontend UI | Marketplace list, item detail, create item, chat link |
| 8. Trade logic | buyNow, placeBid, acceptOffer (Phase 2) |

---

## 8. Notes

- **City**: Default from `user.currentCityId` on create; optional override
- **Categories**: Admin-only; users pick from dropdown (read-only)
- **Trade types**: BUY_IT_NOW (fixed), SUGGESTED_PRICE (negotiate), AUCTION (auctionEndsAt + bids)
- **Chat**: GroupChannel with marketItemId, isChannel, isPublic; all can see/join; participants get notifications
