# Navigation & Back Button Refactoring Plan

## Overview

This document outlines a complete refactoring of the navigation and back-button logic in PadelPulse. The current implementation relies on scattered `location.state` (fromPage, returnItemId, etc.), per-route fallback tables, and duplicated URL/state parsing. The new design uses **URL as the single source of truth** for all restorable UI state, with one unified back rule and DRY principles throughout.

---

## Goals

1. **URL = source of truth:** All page state (tabs, filters, drawers, sub-views) encoded in URL (path + search params).
2. **Restore on back:** When user navigates away and returns (via back or direct navigation), they see the exact same state (e.g. Find with calendar + date + trainings filter, Marketplace list with drawer open).
3. **One back rule:** No per-route fallback logic. Back = `navigate(-1)` if history exists, else `navigate(homeUrl())`.
4. **DRY:** One URL schema, one parser, one builder. No duplicated "read params and set state" across pages.
5. **Capacitor support:** Android back button and iOS swipe gesture work seamlessly with the same logic.
6. **Empty history (deep link / push):** Never get stuck; back always goes to Home when history is empty.

---

## 1. Design Principles

### 1.1 URL as single source of truth

- **All restorable state** lives in the URL: tabs, filters, dates, search queries, drawer/overlay IDs.
- **No reliance on `location.state`** for "where to go back" or for restoring list/drawer state.
- **One history entry per "place":** Navigating forward pushes a new entry; back uses browser/Capacitor history (or fallback to Home).

### 1.2 One back rule (no per-route fallbacks)

**Rule:**
```typescript
back = (history.length > 1) ? navigate(-1) : navigate(homeUrl(), { replace: true })
```

- **Optional safety:** After `navigate(-1)`, if the resulting pathname is not in our app's route set, call `navigate(homeUrl(), { replace: true })` to prevent landing on external pages.
- **No `setCurrentPage`/`setChatsFilter` in back logic:** The URL we navigate to drives the UI state.

### 1.3 Single overlay (drawer) model

**Model:** "Drawer open" = "current URL + overlay params"

- **Overlay params:** Same param names everywhere (e.g. `player` for player card, `item` for market item drawer).
- **Behavior:**
  - Opening drawer = update URL (push or replace with overlay param).
  - Closing = remove overlay param (replace) or `navigate(-1)` if we pushed.
  - Navigating to another screen from inside drawer = push target URL (no overlay on target). Back pops to previous URL which already has the overlay, so parser restores drawer.

### 1.4 Single sync direction: URL → state

- **URL is source of truth.** "State" (tabs, filters, drawers) is **derived** from URL in one place per area.
- **Per area, one parser:** `useFindFromUrl()`, `useChatsFromUrl()`, etc. (or one `parseLocation` that all areas use).
- **No duplicated "read search params and set store"** in multiple components.

### 1.5 Replace vs push convention

- **Push:** Navigating to a **new** place (another screen): game, chat, create-game, profile, etc.
- **Replace:** Updating the **same** place (same path, different params/overlay): tab change, filter change, open/close drawer.

---

## 2. URL Schema (Single Source)

### 2.1 Place types and URL patterns

Define all "places" in one module (`utils/urlSchema.ts` or `config/urlSchema.ts`):

| Place | Path | Query params | Overlay params |
|-------|------|--------------|----------------|
| **home** | `/` or `/my` | `tab=my-games\|past-games` | `player=userId` |
| **find** | `/find` | `view=calendar\|list`, `date=YYYY-MM-DD` (calendar), `week=YYYY-MM-DD` (list), `game=1`, `training=1`, `tournament=1`, `leagues=1` | `player=userId` |
| **chats** | `/chats` | `filter=users\|bugs\|channels\|market`, `q=...` (search) | `player=userId` |
| **chatsMarketplace** | `/chats/marketplace` | `role=seller\|buyer`, `item=itemId` (drawer), `q=...` | `player=userId` |
| **bugs** | `/bugs` | `status=...`, `type=...`, `createdByMe=1`, `create=1` (modal) | `player=userId` |
| **marketplace** | `/marketplace` | `item=itemId` (drawer) | `player=userId` |
| **marketplaceMy** | `/marketplace/my` | `item=itemId` (drawer) | `player=userId` |
| **leaderboard** | `/leaderboard` | *(none for now)* | `player=userId` |
| **profile** | `/profile` | `tab=general\|statistics\|comparison` | `player=userId` |
| **gameSubscriptions** | `/game-subscriptions` | *(none)* | `player=userId` |
| **game** | `/games/:id` | `tab=general\|schedule\|standings\|faq` (league) | `player=userId` |
| **gameChat** | `/games/:id/chat` | `view=item\|participants` (in-page panels) | `player=userId` |
| **userChat** | `/user-chat/:id` | *(none)* | `player=userId` |
| **groupChat** | `/group-chat/:id` | *(none)* | `player=userId` |
| **channelChat** | `/channel-chat/:id` | *(none)* | `player=userId` |
| **createGame** | `/create-game` | *(entity type in state if needed)* | - |
| **createLeague** | `/create-league` | - | - |
| **createMarketItem** | `/marketplace/create` | - | - |
| **editMarketItem** | `/marketplace/:id/edit` | - | - |
| **selectCity** | `/select-city` | - | - |
| **completeProfile** | `/complete-profile` | - | - |
| **login** | `/login`, `/login/phone`, `/login/telegram` | - | - |
| **register** | `/register` | - | - |

### 2.2 Overlay params (unified)

- **`player=userId`**: Opens PlayerCardBottomSheet on any page that supports it.
- **`item=itemId`**: Opens MarketItemDrawer on marketplace or chats/marketplace.
- **`create=1`**: Opens create bug modal on `/bugs`.
- **`view=item|participants`**: Opens in-page panel on game chat.

### 2.3 API (one module)

```typescript
// utils/urlSchema.ts

export type Place = 'home' | 'find' | 'chats' | 'chatsMarketplace' | 'bugs' | 'marketplace' | 'marketplaceMy' | 'leaderboard' | 'profile' | 'gameSubscriptions' | 'game' | 'gameChat' | 'userChat' | 'groupChat' | 'channelChat' | 'createGame' | 'createLeague' | 'createMarketItem' | 'editMarketItem' | 'selectCity' | 'completeProfile' | 'login' | 'register';

export interface PlaceParams {
  // Per-place params (e.g. id for game, tab for home/profile, etc.)
  [key: string]: string | number | boolean | undefined;
}

export interface Overlay {
  type: 'player' | 'item';
  id: string;
}

export interface ParsedLocation {
  place: Place;
  params: PlaceParams;
  overlay?: Overlay;
}

// Parse current location into place + params + overlay
export function parseLocation(pathname: string, search: string): ParsedLocation;

// Build URL from place + params + overlay
export function buildUrl(place: Place, params?: PlaceParams, overlay?: Overlay): string;

// Build home URL with default params
export function homeUrl(params?: PlaceParams): string;

// Overlay helpers
export function addOverlay(pathname: string, search: string, type: 'player' | 'item', id: string): string;
export function removeOverlay(pathname: string, search: string, type: 'player' | 'item'): string;
export function getOverlay(search: string): Overlay | null;
```

**DRY win:** All URL building and parsing goes through this module. No scattered fallbacks or hand-built URLs in routes, components, or back logic.

---

## 3. Single Back Rule

### 3.1 Implementation

One function decides "back": either one step in history or home.

```typescript
// utils/backNavigation.ts (or inside urlSchema)

export type BackAction = 
  | { type: 'history' }
  | { type: 'home', url: string };

export function getBackAction(): BackAction {
  if (window.history.length > 1) {
    return { type: 'history' };
  }
  return { type: 'home', url: homeUrl() };
}

export function handleBack(navigate: NavigateFunction): void {
  const action = getBackAction();
  
  if (action.type === 'history') {
    const previousPathname = window.location.pathname;
    navigate(-1);
    
    // Safety check: after navigate(-1), verify we're still in-app
    setTimeout(() => {
      const currentPathname = window.location.pathname;
      if (currentPathname === previousPathname || !isAppPath(currentPathname)) {
        navigate(homeUrl(), { replace: true });
      }
    }, 350); // SAFETY_CHECK_MS
  } else {
    navigate(action.url, { replace: true });
  }
}

function isAppPath(pathname: string): boolean {
  const APP_PATH_RE = /^\/(find|chats|profile|leaderboard|games|create-game|create-league|rating|bugs|game-subscriptions|marketplace|user-chat|group-chat|channel-chat|select-city|complete-profile|login|register|character)(\/.*)?$/;
  return pathname === '/' || APP_PATH_RE.test(pathname);
}
```

**Used by:**
- Android back button (backButtonService)
- Any header back button
- iOS swipe-back safety (popstate handler)

**DRY win:** One place implements "back". No `findMatchingRoute` + fallback per pattern, no `applyFallback` with lots of `setCurrentPage`/`setChatsFilter`.

### 3.2 Back handler order (modal stack)

**Keep existing order in `backButtonService`:**

1. If modal stack non-empty → close top modal (current behavior via `useBackButtonModal`).
2. Else if page registered a custom handler → run it; if it returns `true`, stop.
3. Else → run the **single default back** (`handleBack`).

So the "single back rule" is only the **default** when no modal and no page override. Custom handlers (GameChat, CreateGame, CreateLeague) and modals (Dialog, CreateMenuModal, etc.) stay as today.

---

## 4. Single Overlay (Drawer) Model

### 4.1 Unified behavior

All drawers (PlayerCardBottomSheet, MarketItemDrawer, and any future overlay) use the same mechanism:

- **Opening:** Update URL with overlay param (push or replace).
- **Closing:** Remove overlay param (replace) or `navigate(-1)` if we pushed.
- **Navigating from inside drawer:** Push target URL (without overlay). Back returns to previous URL which already has overlay, so parser restores drawer.

### 4.2 Implementation

**Helpers (in urlSchema or separate):**

```typescript
export function addOverlay(pathname: string, search: string, type: 'player' | 'item', id: string): string {
  const params = new URLSearchParams(search);
  params.set(type, id);
  return `${pathname}?${params.toString()}`;
}

export function removeOverlay(pathname: string, search: string, type: 'player' | 'item'): string {
  const params = new URLSearchParams(search);
  params.delete(type);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function getOverlay(search: string): Overlay | null {
  const params = new URLSearchParams(search);
  const player = params.get('player');
  const item = params.get('item');
  
  if (player) return { type: 'player', id: player };
  if (item) return { type: 'item', id: item };
  return null;
}
```

**Usage in components:**

```typescript
// PlayerCardBottomSheet (or wrapper)
const openPlayerCard = (userId: string) => {
  const newUrl = addOverlay(location.pathname, location.search, 'player', userId);
  navigate(newUrl, { replace: false }); // push so back closes drawer
};

const closePlayerCard = () => {
  navigate(-1); // or removeOverlay + replace if we used replace to open
};

// MarketItemDrawer (or wrapper)
const openMarketItem = (itemId: string) => {
  const newUrl = addOverlay(location.pathname, location.search, 'item', itemId);
  navigate(newUrl, { replace: false }); // push
};

const closeMarketItem = () => {
  navigate(-1);
};
```

**DRY win:** PlayerCardBottomSheet and MarketItemDrawer don't each implement pushState vs searchParams; they all call "open = set URL with overlay", "close = clear overlay / go back".

---

## 5. Single Sync Direction: URL → State

### 5.1 Per-area parsers

URL is source of truth. "State" (tabs, filters, drawers) is **derived** from URL in one place per area.

```typescript
// hooks/useHomeFromUrl.ts
export function useHomeFromUrl() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'my-games';
  return { tab: tab as 'my-games' | 'past-games' };
}

// hooks/useFindFromUrl.ts
export function useFindFromUrl() {
  const [searchParams] = useSearchParams();
  const view = searchParams.get('view') || 'calendar';
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const week = searchParams.get('week');
  const game = searchParams.get('game') === '1';
  const training = searchParams.get('training') === '1';
  const tournament = searchParams.get('tournament') === '1';
  const leagues = searchParams.get('leagues') === '1';
  
  return { view, date, week, game, training, tournament, leagues };
}

// hooks/useChatsFromUrl.ts
export function useChatsFromUrl() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const filter = location.pathname === '/bugs' ? 'bugs' 
    : location.pathname === '/chats/marketplace' ? 'market'
    : (searchParams.get('filter') || 'users');
  
  const q = searchParams.get('q') || '';
  const role = searchParams.get('role') || 'buyer';
  const item = searchParams.get('item');
  
  return { filter, q, role, item };
}

// Similar for marketplace, profile, etc.
```

### 5.2 One sync point

**Option A:** One root-level effect that runs `parseLocation(location)` and updates a single "location state" store/context. Each area's hook reads from that.

**Option B:** Each area's hook runs `parseLocation` or reads search params directly (as above). Components only read from these hooks, never from `searchParams` directly.

**Either way:** No duplicated "read q and setChatsFilter" in ChatsTab, ChatList, etc.; no "read date and setSelectedDate" only in FindTab.

**DRY win:** Tab/filter/drawer state is defined once (in URL schema + parsers). Components derive state from URL via one hook per area.

---

## 6. Single "Navigate To" API

### 6.1 No ad-hoc state

All navigations go through one API that only knows "place + params". No `fromPage`, `returnItemId`, or other "return context" in state.

```typescript
// services/navigationService.ts (updated)

class NavigationService {
  private navigate: NavigateFunction | null = null;

  initialize(navigate: NavigateFunction) {
    this.navigate = navigate;
  }

  navigateToGame(gameId: string, openChat: boolean = false) {
    const place = openChat ? 'gameChat' : 'game';
    const url = buildUrl(place, { id: gameId });
    this.navigate!(url); // push
  }

  navigateToUserChat(id: string) {
    const url = buildUrl('userChat', { id });
    this.navigate!(url);
  }

  navigateToChannelChat(id: string) {
    const url = buildUrl('channelChat', { id });
    this.navigate!(url);
  }

  navigateToFind(params?: PlaceParams) {
    const url = buildUrl('find', params);
    this.navigate!(url);
  }

  navigateToMarketplace(params?: PlaceParams) {
    const url = buildUrl('marketplace', params);
    this.navigate!(url);
  }

  // ... etc for all places
}
```

**Opening a drawer:** Same idea: `openDrawer(type, id)` = replace or push current path + current search with overlay param (using `addOverlay`).

**DRY win:** No call sites building `state: { fromPage, fromMarketplaceSubtab, returnItemId }`. One builder per place; back is always "previous URL".

---

## 7. Chats: One "Chat Entry" Shape, One Back Rule

### 7.1 All chat routes are the same kind of "place"

- **Chat places:** `userChat`, `groupChat`, `channelChat`, `gameChat`. Each has path + id. No extra "context" in state.
- **"Return to list with drawer":** When we're on `/marketplace/my?item=xyz` and we navigate to `/channel-chat/abc`, we **push** `/channel-chat/abc`. Previous entry stays `/marketplace/my?item=xyz`. Back = `navigate(-1)` → we're back on marketplace with `item=xyz`; parser restores drawer from URL.

Same for `/chats/marketplace?item=xyz` → channel chat → back. No `returnItemId` or `fromPage` anywhere.

### 7.2 Bugs

Same: from `/bugs` push `/channel-chat/:id`; back goes to `/bugs`. If later we add `?bug=id` for a bug drawer, it's just another overlay in the schema.

**DRY win:** One back rule for all chat types; "marketplace chat" and "bugs chat" are just channel chats with different previous URL. No special fallbacks or state for "from marketplace" vs "from chats".

---

## 8. Capacitor and "Empty History"

### 8.1 Same back rule everywhere

- **Android:** Back button → (optional: if modal stack non-empty, close top modal); else → single `handleBack()` (history -1 or home).
- **iOS:** Swipe = browser `history.back()`. If that leaves us with no previous in-app entry (e.g. first load or deep link), one popstate handler: if `history.length <= 1` (or similar), `navigate(homeUrl(), { replace: true })`.

### 8.2 Deep link and push: single entry

**Verified:** Deep link uses `replace: true`; push uses `navigationService` which uses `replace: true`. So both result in a single history entry. Back → home is correct.

**Implementation:** Keep `useDeepLink` and `pushNotificationService` using `replace: true` so the single back rule behaves as intended.

**DRY win:** One definition of "when to go home" and one `homeUrl()`. Capacitor and web share the same back logic.

---

## 9. Implementation Order

### Phase 1: URL schema and helpers

1. Create `utils/urlSchema.ts`:
   - Define `Place` type and all place patterns.
   - Implement `parseLocation`, `buildUrl`, `homeUrl`.
   - Implement overlay helpers: `addOverlay`, `removeOverlay`, `getOverlay`.
2. Create `utils/backNavigation.ts`:
   - Implement `getBackAction`, `handleBack`.

### Phase 2: Home + Find

1. Add query params for Home tab (`?tab=my-games|past-games`).
2. Create `hooks/useHomeFromUrl.ts` and `hooks/useFindFromUrl.ts`.
3. Update `MyTab` and `FindTab` to derive state from these hooks.
4. Update tab controllers (MyGamesTabController, FindTabController) to update URL (replace) when user changes tab/view.
5. Update `AvailableGamesSection` to read filters from URL and update URL on filter change.
6. Remove or reduce dependence on `gameFiltersStorage` for "current" state (can keep as persistence for "last used" if desired).

### Phase 3: Chats + Marketplace

1. Create `hooks/useChatsFromUrl.ts` and `hooks/useMarketplaceFromUrl.ts`.
2. Update `ChatsTab` and `ChatList` to derive filter, search, role, item from URL.
3. Update `ChatsTabController` to only update URL (not store) when changing filter.
4. Update `MarketplaceList` to align open/close drawer with history (already uses `?item=`).
5. Update `ChatList` marketplace drawer to use `?item=` in `/chats/marketplace` and sync open/close to URL.

### Phase 4: Player card

1. Replace raw `pushState({ playerCardOpen: true })` in `PlayerCardBottomSheet` with URL param `player=userId`.
2. Update `PlayerCardModalManager` (and any caller) to push or replace with that param.
3. Add popstate handler to close drawer when back removes param.
4. Update `LevelHistoryView`: navigating to game = normal push to `/games/:id`; no special state; back returns to URL that had `?player=userId`.

### Phase 5: Back handler

1. Update `backButtonService.defaultBackNavigation` to call `handleBack` from `backNavigation.ts`.
2. Update `useBackButtonHandler` default handler to call `handleBack`.
3. Remove old `navigationRoutes` fallbacks and `applyFallback`/`setCurrentPage`/`setChatsFilter` from back logic.
4. Keep modal stack and custom page handlers (GameChat, CreateGame, etc.) as-is; they run before the new default.

### Phase 6: Capacitor

1. Android: in `backButtonService`, call the new back handler (after modal stack).
2. iOS: ensure in-app transitions use history; add a single popstate listener that, when history is empty or external, redirects to `homeUrl()` instead of relying on WebView default.

### Phase 7: Cleanup

1. Remove `fromPage`, `fromMarketplaceSubtab`, `returnItemId`, etc. from navigations and from `LocationState` (or leave in type but unused).
2. Simplify or remove `navigationRoutes.ts` (e.g. only use for "which route matches" if needed for something else).
3. Optionally reduce `navigationStore` to only what's not in URL (e.g. animating, bottomTabsVisible).
4. Update `MainPage` to derive `currentPage` from `parseLocation` in one place instead of large useEffect.

---

## 10. Files to Touch (High Level)

### Core navigation/back

- `utils/urlSchema.ts` (new)
- `utils/backNavigation.ts` (new)
- `utils/navigation.ts` (simplify or remove)
- `config/navigationRoutes.ts` (remove or reduce)
- `services/navigationService.ts` (use `buildUrl`)
- `hooks/useBackButtonHandler.ts` (use `handleBack`)
- `services/backButtonService.ts` (use `handleBack`)
- `App.tsx` (popstate/setup)

### Hooks (new)

- `hooks/useHomeFromUrl.ts`
- `hooks/useFindFromUrl.ts`
- `hooks/useChatsFromUrl.ts`
- `hooks/useMarketplaceFromUrl.ts`
- `hooks/useProfileFromUrl.ts` (optional)

### Store

- `store/navigationStore.ts` (reduce or remove tabs/filters that are now in URL)

### Pages

- `pages/MainPage.tsx` (derive currentPage from URL)
- `pages/Home.tsx` / `pages/MyTab.tsx` (use `useHomeFromUrl`)
- `pages/FindTab.tsx` (use `useFindFromUrl`)
- `pages/ChatsTab.tsx` (use `useChatsFromUrl`)
- `pages/MarketplaceList.tsx` (use `useMarketplaceFromUrl`)
- `pages/GameDetails.tsx` (add `?tab=` for league sub-tab)
- `pages/GameChat.tsx` (add `?view=` for item/participants panels)
- `pages/Profile.tsx` (optional: add `?tab=`)

### Components

- `components/PlayerCardBottomSheet.tsx` (use URL overlay)
- `components/PlayerCardModalManager.tsx` (use URL overlay)
- `components/LevelHistoryView.tsx` (navigate without special state)
- `components/chat/ChatList.tsx` (use `useChatsFromUrl`)
- `components/marketplace/MarketItemDrawer.tsx` (use URL overlay)
- `components/home/AvailableGamesSection.tsx` (use `useFindFromUrl`)
- `components/headerContent/FindTabController.tsx` (update URL on change)
- `components/headerContent/MyGamesTabController.tsx` (update URL on change)
- `components/headerContent/ChatsTabController.tsx` (update URL on change)
- `components/headerContent/MarketplaceTabController.tsx` (update URL on change)

### Chat/marketplace navigation

- `components/marketplace/useMarketItemExpressInterest.ts` (use `buildUrl`)
- `components/chat/contextPanels/useMarketItemChatButton.ts` (use `buildUrl`)
- `pages/MarketplaceItemRedirect.tsx` (use `buildUrl`)
- `components/GameCard.tsx` (use `buildUrl`)
- Any component that navigates to chats or marketplace

---

## 11. Additions & Edge Cases

### 11.1 Game details: league sub-tab in URL

**Today:** `leagueSeasonTab` is in `location.state`.

**Add to schema:** `/games/:id?tab=schedule|standings|faq|general`

- Parsing: `parseLocation` for `place === 'game'` includes `tab`.
- Building: `buildUrl('game', { id, tab })` includes `?tab=...`.
- `LeagueScheduleTab` navigates to another game with the same tab in URL. Back restores game + tab from previous URL.

### 11.2 Game chat: in-page panels (item / participants)

**Today:** GameChat uses custom back handler to close `showItemPage` or `showParticipantsPage`.

**Add to schema:** `/games/:id/chat?view=item|participants`

- **Back** means: if `view` is set, navigate to same path without `view` (close panel); else run default back (leave chat).
- Implementation: custom `useBackButtonHandler` that (1) if `view` in URL, remove it and return true, (2) else call default back.

### 11.3 Profile and bugs in URL (optional but consistent)

- **Profile:** `/profile?tab=general|statistics|comparison` (derive from URL; update URL on tab change).
- **Bugs:** `/bugs?create=1` (create modal), `?status=...&type=...` (filters). Back removes param (close modal) or goes back.

### 11.4 Game subscriptions and other "single-screen" routes

**Places:** `/game-subscriptions`, `/create-game`, `/create-league`, `/select-city`, `/complete-profile`, `/character`.

- Just more "places" in the URL schema. No extra back logic: back = history -1 or home.
- Create flows: custom back handler can show "leave?" confirmation; on confirm, call default back (previous history entry or home).

### 11.5 Replace vs push convention

Make explicit:

- **Push:** New place (another screen): game, chat, create-game, profile, etc.
- **Replace:** Same place (same path, different params/overlay): tab change, filter change, open/close drawer.

Document in `urlSchema` or `navigationService` so all navigations use one rule.

### 11.6 homeUrl() default params

`homeUrl()` should return the **canonical** "root" URL with default params. E.g. `buildUrl('home', { tab: 'my-games' })` or `/` with default `?tab=...`.

### 11.7 currentPage / place derivation

**Today:** MainPage derives `currentPage` from pathname in a large `useEffect`.

**With URL schema:** Derive in **one** place from `parseLocation(location)`. MainPage/header/bottom bar read from that single source.

---

## 12. Testing Strategy

### 12.1 Manual testing checklist

- [ ] Navigate Home → Find → Game → back to Find (with same filters/date).
- [ ] Navigate Marketplace → open drawer → navigate to chat → back to Marketplace (drawer open).
- [ ] Open player card from Home → navigate to game from level history → back to Home (player card open).
- [ ] Deep link to game → back goes to Home (not stuck).
- [ ] Push notification to chat → back goes to Home.
- [ ] Android back button: closes modals first, then page panels, then navigates back.
- [ ] iOS swipe back: same behavior as Android back.
- [ ] Change tab on Home (My/Past) → navigate away → back restores tab.
- [ ] Change filter on Find (trainings only, date) → navigate away → back restores filter.
- [ ] Search in Chats → open chat → back restores search query.
- [ ] Marketplace role (seller) → open chat → back restores role + list.

### 12.2 Edge cases

- [ ] Refresh page with drawer open (e.g. `/?player=123`) → drawer opens on load.
- [ ] Share URL with drawer (e.g. `/marketplace?item=xyz`) → recipient sees list + drawer.
- [ ] Back from first screen after deep link → goes to Home (not blank).
- [ ] Back from game chat with item panel open → closes panel first, then leaves chat.
- [ ] Navigate from league game to child game → back returns to league with correct tab.

---

## 13. Migration Notes

### 13.1 Backward compatibility

- **Old deep links / push:** If backend sends old-style deep links (without new query params), they still work (we just don't restore sub-state like tab/filter). Gradually update backend to include params.
- **Existing `location.state`:** During migration, some routes may still read `location.state` for fallback. Remove incrementally.

### 13.2 Data migration

- **gameFiltersStorage (IndexedDB):** Can keep for "last used" persistence, but "current" state comes from URL. On first load, if URL has no params, optionally read from storage and update URL.

---

## 14. Benefits Summary

| Benefit | Description |
|---------|-------------|
| **Restorable state** | All page state (tabs, filters, drawers) in URL; back restores everything. |
| **No "stuck" on back** | Empty history (deep link, push) always goes to Home. |
| **DRY** | One URL schema, one parser, one builder, one back rule. No duplicated logic. |
| **Shareable URLs** | User can share URL with drawer open, filter set, etc.; recipient sees same state. |
| **Simpler back logic** | No per-route fallback tables, no `setCurrentPage`/`setChatsFilter` in back handler. |
| **Capacitor support** | Android back and iOS swipe use same logic; no platform-specific hacks. |
| **Testable** | URL-driven state is easy to test (set URL, verify UI); no hidden state in store. |
| **Maintainable** | Adding new place or overlay = update schema in one place; all navigation uses it. |

---

## 15. Open Questions / Decisions

1. **Home URL format:** `/` with `?tab=...` or separate paths `/my` and `/past`? (Recommend query param for simplicity.)
2. **Profile tabs:** In URL or store? (Recommend URL for consistency.)
3. **Bugs filters:** In URL or store? (Recommend URL for full restore, but can defer.)
4. **gameFiltersStorage:** Keep for persistence or remove? (Recommend keep for "last used", but URL is source of truth for "current".)
5. **Overlay push vs replace:** Always push when opening drawer, or replace if same place? (Recommend push for drawer so back closes it.)

---

## 16. Success Criteria

- [ ] All main screens (Home, Find, Chats, Marketplace, Leaderboard) restore state from URL.
- [ ] Both drawers (PlayerCard, MarketItem) restore from URL.
- [ ] Back from any screen goes to previous screen or Home (never stuck).
- [ ] Deep link and push leave one history entry; back goes to Home.
- [ ] Android back and iOS swipe work identically.
- [ ] No `fromPage`, `returnItemId`, etc. in `location.state` (or unused if present).
- [ ] One `handleBack()` function; no per-route fallback logic.
- [ ] All navigation uses `buildUrl` from URL schema; no hand-built URLs.

---

**End of plan.**
