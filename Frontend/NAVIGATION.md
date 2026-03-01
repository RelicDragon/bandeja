# Navigation & Back Button Implementation

## Architecture Overview

Bandeja uses a multi-layered navigation system built on React Router v6 with Capacitor integration for native mobile behavior. The system handles web browser navigation, Android hardware back button, iOS swipe-back gestures, deep linking, modal interception, and desktop split-view routing — all through a unified architecture.

### Core Files

| File | Purpose |
|------|---------|
| `src/services/navigationService.ts` | Singleton wrapper around React Router's `navigate` |
| `src/services/backButtonService.ts` | Android hardware back button + modal stack manager |
| `src/store/navigationStore.ts` | Zustand store for navigation UI state |
| `src/utils/navigation.ts` | Core back-navigation logic, history tracking, popstate fallback |
| `src/config/navigationRoutes.ts` | Route-to-fallback mapping with priorities |
| `src/hooks/useBackButtonHandler.ts` | Hook for page-level back button registration |
| `src/hooks/useBackButtonModal.ts` | Hook for modal-level back button registration |
| `src/hooks/useDeepLink.ts` | Capacitor deep link handler |
| `src/layouts/Header.tsx` | Header with back button UI |
| `src/components/navigation/BottomTabBar.tsx` | Bottom tab navigation |
| `src/pages/MainPage.tsx` | Route-to-content mapping |
| `src/App.tsx` | Route definitions, initialization |
| `src/components/NavigationErrorBoundary.tsx` | Error recovery for navigation failures |

---

## 1. Navigation Service (`navigationService.ts`)

A singleton that wraps React Router's `navigate` function, providing domain-specific navigation methods.

### Initialization

Called once in `App.tsx`:

```typescript
useEffect(() => {
  navigationService.initialize(navigate);
  backButtonService.setNavigate(navigate);
}, [navigate]);
```

### Methods

| Method | Route | Behavior |
|--------|-------|----------|
| `navigateToGame(gameId, openChat?)` | `/games/{id}` or `/games/{id}/chat` | Sets `currentPage: 'gameDetails'`, hides bottom tabs |
| `navigateToUserChat(userChatId)` | `/user-chat/{id}` | Sets `currentPage: 'chats'` |
| `navigateToBugChat(bugId)` | `/channel-chat/{id}` or `/group-chat/{id}` | Resolves bug → channel mapping, falls back to group chat |
| `navigateToGroupChat(groupChannelId)` | `/group-chat/{id}` | Sets `currentPage: 'chats'` |
| `navigateToChannelChat(channelId)` | `/channel-chat/{id}` | Sets `currentPage: 'chats'` |
| `navigateToBugsList()` | `/chats` | Sets filter to `'bugs'` |
| `navigateToCreateBug()` | `/chats` | Opens bug creation modal |
| `navigateToCreateListing()` | `/marketplace/create` | Sets `currentPage: 'marketplace'` |

### Key Patterns

- All methods set `isAnimating = true` for 300ms (transition animation guard).
- All methods use `navigateWithTracking()` internally to mark navigations in history state.
- `replace: true` is used by default to avoid bloating the history stack.

---

## 2. Navigation Store (`navigationStore.ts`)

Zustand store managing UI-level navigation state.

### State

```typescript
interface NavigationState {
  currentPage: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard'
              | 'gameDetails' | 'gameSubscriptions' | 'marketplace';
  bottomTabsVisible: boolean;
  isAnimating: boolean;                          // 300ms transition lock
  gameDetailsCanAccessChat: boolean;
  bounceNotifications: boolean;
  activeTab: 'my-games' | 'past-games' | 'search';
  profileActiveTab: 'general' | 'statistics' | 'comparison';
  chatsFilter: 'users' | 'bugs' | 'channels';
  openBugModal: boolean;
  findViewMode: 'calendar' | 'list';
  requestFindGoToCurrent: boolean;
}
```

### Usage

- `currentPage` determines which content `MainPage` renders and which header variant is shown.
- `bottomTabsVisible` is set to `false` when entering game details, chat detail pages, etc.
- `isAnimating` prevents rapid consecutive navigations and enables CSS transition classes.
- `chatsFilter` controls which chat list tab is active (users/bugs/channels).

---

## 3. Route Configuration (`navigationRoutes.ts`)

Defines fallback routes for back navigation. Each route has a regex pattern, a fallback path, and a priority.

### Route Fallback Table

| Pattern | Fallback | Priority | Notes |
|---------|----------|----------|-------|
| `/user-chat/{id}` | `/chats` | 10 | Preserves `searchQuery` if present, sets filter `'users'` |
| `/group-chat/{id}` | `/chats` | 10 | Preserves `searchQuery`, sets filter `'channels'` |
| `/channel-chat/{id}` | `/chats` or `/bugs` | 10 | Uses `fromPage` state to decide; preserves `searchQuery` |
| `/games/{id}/chat` | `/games/{id}` | 10 | Strips `/chat` suffix |
| `/marketplace/{id}/edit` | `/marketplace` | 10 | |
| `/marketplace/{id}` | `/marketplace` | 10 | |
| `/marketplace/create` | `/marketplace` | 10 | |
| `/login` | `/` | 5 | |
| `/profile` | `/` or `fromPage` | 5 | Uses `fromPage` from location state |
| `.*` (catch-all) | `/` | 0 | Default fallback |

### How Matching Works

1. Routes are sorted by priority (highest first).
2. Current pathname is tested against each route's regex pattern.
3. First match determines the fallback path.
4. Fallback can be a string or a function that receives `(pathname, locationState)` and returns a path.

### Context and Filter Setting

Some routes specify `contextType` and `setFilter`:

```typescript
{
  pattern: /^\/user-chat\/[^/]+$/,
  fallback: (pathname, state) => state?.searchQuery ? `/chats?q=${state.searchQuery}` : '/chats',
  contextType: 'USER',
  setFilter: 'users',
  priority: 10,
}
```

When navigating back, if `setFilter` is defined, the navigation store's `chatsFilter` is updated accordingly.

---

## 4. History Tracking & Back Navigation Logic (`navigation.ts`)

### History State Marking

Every in-app navigation marks the history entry:

```typescript
function markNavigation() {
  window.history.replaceState(
    { ...window.history.state, isAppNavigation: true, timestamp: Date.now() },
    ''
  );
}
```

This allows `canNavigateBack()` to distinguish app navigations from external/browser navigations.

### `canNavigateBack()`

```typescript
function canNavigateBack(): boolean {
  return window.history.length > 1
    && (window.history.state?.isAppNavigation === true
        || window.history.state?.usr?.isAppNavigation === true);
}
```

Checks both `state.isAppNavigation` (direct) and `state.usr.isAppNavigation` (React Router wraps state in `usr`).

### `navigateWithTracking(navigate, path, options)`

Wrapper around React Router's `navigate`:

```typescript
function navigateWithTracking(navigate, path, options?) {
  navigate(path, {
    ...options,
    state: { ...options?.state, isAppNavigation: true, timestamp: Date.now() },
  });
  setTimeout(() => markNavigation(), 0);
}
```

### `handleBackNavigation(params)` — Core Algorithm

This is the central back-navigation decision function. Called by both the Header back button and Android hardware back button.

**Parameters:**

```typescript
{
  pathname: string;
  locationState: LocationState;
  navigate: NavigateFunction;
  setCurrentPage: (page: string) => void;
  nativeCanGoBack?: boolean;           // From Capacitor BackButtonEvent
}
```

**Decision Flow:**

```
1. Find matching route config for current pathname
   → Determine fallback path

2. Classify current route:
   a. isGameChatFromInApp:
      - Pathname matches /games/{id}/chat
      - AND locationState.fromPage exists

   b. isChatFromInApp:
      - Pathname matches /user-chat/*, /group-chat/*, /channel-chat/*
      - AND locationState.fromPage is 'chats' or 'bugs'

   c. isEntryPointRoute:
      - Pathname matches /games/{id}, /user-chat/*, /group-chat/*, /channel-chat/*
      - These are routes that can be opened directly via deep link/shared URL
      - NEVER use history.back() for these — always use fallback

3. Navigate:
   if (isGameChatFromInApp || isChatFromInApp) && canNavigateBack():
       → navigate(-1) with safety check
   else if (isEntryPointRoute):
       → Always use fallback path (never history.back)
   else if (canNavigateBack()):
       → navigate(-1) with safety check
   else:
       → Use fallback path

4. Apply side effects:
   - If route config has setFilter → update navigationStore.chatsFilter
   - Set currentPage based on fallback route
   - Set isAnimating for 300ms
```

### Safety Check (350ms Timeout)

After calling `navigate(-1)` (history back), a safety check runs:

```typescript
const currentPath = window.location.pathname;
navigate(-1);
setTimeout(() => {
  if (window.location.pathname === currentPath || !canNavigateBack()) {
    // history.back() failed or went to non-app page
    navigate(fallbackPath, { replace: true });
  }
}, 350);
```

This prevents the app from getting stuck when:
- Browser history is exhausted.
- History.back() lands on a non-app URL.
- The popstate event doesn't fire (edge case).

### `setupPopstateFallback(navigate)` — iOS Swipe-Back Safety

On Capacitor (iOS specifically), the native WebView allows swipe-back gestures that trigger `popstate` events. If the user swipes back to a non-app URL (e.g., blank page from initial load), this handler catches it:

```typescript
function setupPopstateFallback(navigate) {
  const handler = () => {
    const pathname = window.location.pathname;
    if (!pathname || pathname === '/' || !isAppRoute(pathname)) {
      navigate('/', { replace: true });
    }
  };
  window.addEventListener('popstate', handler);
  return () => window.removeEventListener('popstate', handler);
}
```

Initialized in `App.tsx` only on Capacitor platforms.

---

## 5. Location State Structure

Navigation state is passed between routes via React Router's location state:

```typescript
interface LocationState {
  fromLeagueSeasonGameId?: string;
  leagueSeasonTab?: 'general' | 'schedule' | 'standings' | 'faq';
  fromPage?: 'my' | 'find' | 'chats' | 'bugs' | 'profile' | 'leaderboard'
            | 'gameDetails' | 'gameSubscriptions' | 'marketplace';
  fromFilter?: 'users' | 'bugs' | 'channels';
  searchQuery?: string;
  isAppNavigation?: boolean;
  timestamp?: number;
}
```

Key uses:
- **`fromPage`**: Determines which page to return to. Used by profile, channel-chat, and game detail routes.
- **`fromFilter`**: Preserves the active chat filter tab when returning from a chat detail.
- **`searchQuery`**: Preserves active search text when navigating back to the chats list.
- **`isAppNavigation`**: Marker for `canNavigateBack()` check.
- **`timestamp`**: Safety check for stale history entries.
- **`fromLeagueSeasonGameId` / `leagueSeasonTab`**: League-specific context for returning to the correct league tab.

---

## 6. Back Button Service (`backButtonService.ts`)

Manages Android hardware back button and provides a modal stack for intercepting back presses.

### Modal Stack

Modals register themselves with the back button service to intercept back presses:

```typescript
registerModal(id: string, handler: () => void)    // Push onto stack
unregisterModal(id: string)                        // Remove from stack
```

When the back button is pressed, the **topmost** modal's handler is called first. If no modals are registered, normal back navigation proceeds.

### Page Handler

A single page-level handler can be registered:

```typescript
registerPageHandler(handler: () => boolean | undefined)
```

- Returns `true` → back press was handled by the page (e.g., closing a panel).
- Returns `false` → not handled, proceed with normal back navigation.
- Returns `undefined` → treated as handled.

### Android Back Button Flow

```
1. Hardware back button pressed
   ↓
2. Is a modal open? (modalStack.length > 0)
   YES → Call topmost modal handler, STOP
   ↓ NO
3. Is a page handler registered?
   YES → Call page handler
         → If returns true/undefined: STOP
         → If returns false: continue
   ↓ NO / not handled
4. Is current route the home page (/ or empty)?
   YES → Double-press-to-exit logic:
         - First press: Show toast "Press back again to exit"
         - Second press within 2000ms: App.exitApp()
         - After 2000ms: Reset exit flag
   ↓ NO
5. Call handleBackNavigationFromService(navigate, backEvent.canGoBack)
   → Uses same handleBackNavigation() logic as Header back button
   → Passes nativeCanGoBack from Capacitor's BackButtonListenerEvent
```

### De-duplication

The `isHandling` flag prevents concurrent back button processing:

```typescript
if (this.isHandling) return;
this.isHandling = true;
try { /* handle */ } finally { this.isHandling = false; }
```

---

## 7. Back Button Hooks

### `useBackButtonHandler(customHandler?)`

Used in the Header component and pages that need custom back behavior:

```typescript
function useBackButtonHandler(customHandler?: () => void) {
  useEffect(() => {
    const handler = customHandler || defaultBackHandler;
    backButtonService.registerPageHandler(handler);
    return () => backButtonService.unregisterPageHandler();
  }, [customHandler]);
}
```

The default handler calls `handleBackNavigation()` with current location info.

### `useBackButtonModal(isOpen, onClose)`

Used in modal/dialog components:

```typescript
function useBackButtonModal(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (isOpen) {
      const id = `modal-${Date.now()}-${Math.random()}`;
      backButtonService.registerModal(id, onClose);
      return () => backButtonService.unregisterModal(id);
    }
  }, [isOpen, onClose]);
}
```

Automatically registers/unregisters the modal when `isOpen` changes. The unique ID prevents conflicts between simultaneous modals.

---

## 8. Deep Linking (`useDeepLink.ts`)

Handles `padelpulse://` URLs from native platforms and app launch URLs.

### Supported Deep Link Routes

| URL Pattern | Navigates To | State |
|-------------|-------------|-------|
| `padelpulse://games/{id}` | `/games/{id}` | `{ fromPage: 'my' }` |
| `padelpulse://games/{id}/chat` | `/games/{id}/chat` | `{ fromPage: 'my' }` |
| `padelpulse://user-chat/{id}` | `/user-chat/{id}` | `{ fromPage: 'chats' }` |
| `padelpulse://group-chat/{id}` | `/group-chat/{id}` | `{ fromPage: 'chats' }` |
| `padelpulse://channel-chat/{id}` | `/channel-chat/{id}` | `{ fromPage: 'chats' }` |
| `padelpulse://find` | `/find` | — |
| `padelpulse://chats` | `/chats` | — |
| `padelpulse://profile` | `/profile` | — |
| `padelpulse://leaderboard` | `/leaderboard` | — |
| `padelpulse://marketplace` | `/marketplace` | — |

### Initialization

```typescript
useEffect(() => {
  // Listen for deep links while app is running
  App.addListener('appUrlOpen', ({ url }) => {
    handleDeepLink(url);
  });

  // Check if app was launched via deep link
  setTimeout(async () => {
    const launchUrl = await App.getLaunchUrl();
    if (launchUrl?.url) handleDeepLink(launchUrl.url);
  }, 100);  // 60-100ms delay for app readiness
}, []);
```

All deep link navigations use `replace: true` and include `isAppNavigation` state.

---

## 9. App Routing Setup (`App.tsx`)

### Route Definitions

```tsx
<Routes>
  {/* Auth routes (public) */}
  <Route path="/login" element={<LoginPage />} />
  <Route path="/login/phone" element={<PhoneLoginPage />} />
  <Route path="/login/telegram" element={<TelegramLoginPage />} />
  <Route path="/register" element={<RegisterPage />} />

  {/* Setup routes (authenticated, no main layout) */}
  <Route path="/select-city" element={<ProtectedRoute><SelectCityPage /></ProtectedRoute>} />
  <Route path="/complete-profile" element={<ProtectedRoute><CompleteProfilePage /></ProtectedRoute>} />

  {/* Main app routes (authenticated, with layout) */}
  <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
    <Route path="/" element={<MainPage />} />
    <Route path="/find" element={<MainPage />} />
    <Route path="/chats" element={<MainPage />} />
    <Route path="/bugs" element={<MainPage />} />
    <Route path="/profile" element={<MainPage />} />
    <Route path="/leaderboard" element={<MainPage />} />
    <Route path="/games/:id" element={<MainPage />} />
    <Route path="/games/:id/chat" element={<MainPage />} />
    <Route path="/game-subscriptions" element={<MainPage />} />
    <Route path="/user-chat/:id" element={<MainPage />} />
    <Route path="/group-chat/:id" element={<MainPage />} />
    <Route path="/channel-chat/:id" element={<MainPage />} />
    <Route path="/marketplace" element={<MainPage />} />
    <Route path="/marketplace/create" element={<MainPage />} />
    <Route path="/marketplace/:id" element={<MainPage />} />
    <Route path="/marketplace/:id/edit" element={<MainPage />} />
  </Route>

  {/* Fallback */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

All main app routes render `<MainPage />`, which internally decides what content to display based on `location.pathname`.

### Initialization Sequence

```typescript
// 1. Initialize navigation service and back button service
useEffect(() => {
  navigationService.initialize(navigate);
  backButtonService.setNavigate(navigate);
}, [navigate]);

// 2. Set up iOS popstate fallback (Capacitor only)
useEffect(() => {
  if (isCapacitor()) {
    return setupPopstateFallback(navigate);
  }
}, [navigate]);

// 3. Initialize Android back button listener (Capacitor only)
useEffect(() => {
  if (isCapacitor()) {
    backButtonService.initialize();
  }
}, []);
```

---

## 10. MainPage Content Routing (`MainPage.tsx`)

`MainPage` maps the current pathname to the appropriate page component:

```typescript
function getContent(pathname: string) {
  if (pathname === '/' || pathname === '/login') return <MyTab />;
  if (pathname === '/find') return <FindTab />;
  if (pathname.startsWith('/chats') || pathname.startsWith('/bugs')
      || pathname.startsWith('/user-chat') || pathname.startsWith('/group-chat')
      || pathname.startsWith('/channel-chat')) return <ChatsTab />;
  if (pathname === '/profile') return <ProfileTab />;
  if (pathname === '/leaderboard') return <LeaderboardTab />;
  if (pathname.match(/^\/games\/[^/]+$/) && !pathname.endsWith('/chat')) return <GameDetailsPage />;
  if (pathname === '/game-subscriptions') return <GameSubscriptionsContent />;
  if (pathname.startsWith('/marketplace')) return <MarketplaceContent />;
  return <MyTab />;
}
```

### Desktop Split View

On larger screens, certain pages render in a split layout:

- **Chats page**: Chat list on left panel, selected chat conversation on right panel.
- **Game details**: Game info on left panel, game chat on right panel.

---

## 11. Header Back Button (`Header.tsx`)

### Visibility Rules

The back button is **hidden** on main tab pages:
- `/` (my), `/find`, `/chats`, `/profile`, `/leaderboard`, `/marketplace` (list)

The back button is **shown** on:
- `/games/{id}` (game details)
- `/games/{id}/chat` (game chat)
- `/user-chat/{id}`, `/group-chat/{id}`, `/channel-chat/{id}` (chat details)
- `/game-subscriptions`
- `/marketplace/create`, `/marketplace/{id}`, `/marketplace/{id}/edit`

### Click Handler

```typescript
const handleBackClick = () => {
  setIsAnimating(true);
  handleBackNavigation({
    pathname: location.pathname,
    locationState: location.state,
    navigate,
    setCurrentPage: navigationStore.setCurrentPage,
  });
  setTimeout(() => setIsAnimating(false), 300);
};
```

Uses the same `handleBackNavigation()` function as the Android back button, ensuring consistent behavior across platforms.

---

## 12. Bottom Tab Bar (`BottomTabBar.tsx`)

### Tabs

| Icon | Label | Route | Page |
|------|-------|-------|------|
| Home | My | `/` | `my` |
| Calendar | Find | `/find` | `find` |
| Chat | Chats | `/chats` | `chats` |
| Cart | Marketplace | `/marketplace` | `marketplace` |
| Trophy | Leaderboard | `/leaderboard` | `leaderboard` |

### Tab Press Behavior

```typescript
const handleTabPress = (path, page) => {
  if (currentPage === page) {
    // Already on this tab
    if (page === 'find') {
      // Special: scroll to current date
      setRequestFindGoToCurrent(true);
    }
    return; // No navigation
  }

  setIsAnimating(true);
  navigate(path, { replace: true });
  setCurrentPage(page);
  setBottomTabsVisible(true);
  setTimeout(() => setIsAnimating(false), 300);
};
```

- Uses `replace: true` to avoid history bloat from tab switching.
- Same-tab press is a no-op (except Find tab: scrolls to today).
- Notification badge on Chats tab bounces via `bounceNotifications` state.

### Desktop Layout

On desktop, the tab bar animates to a left sidebar using Framer Motion layout animations.

---

## 13. Platform-Specific Behavior

### Android

- **Hardware back button**: Handled by `backButtonService` via Capacitor `App.addListener('backButton', ...)`.
- **Double-press to exit**: On home page, first press shows toast, second press within 2s calls `App.exitApp()`.
- **`nativeCanGoBack`**: Capacitor provides `backEvent.canGoBack` indicating if the WebView has history. This is passed to `handleBackNavigation` as an additional safety check.

### iOS

- **Swipe-back gesture**: Native WebView gesture. The `popstate` fallback handler catches cases where swipe-back lands on a non-app page and redirects to home.
- **No hardware back button**: Back navigation is only via Header back button and swipe gesture.
- **Status bar**: Configured via `setupCapacitor()` in `capacitorSetup.ts`.

### Web

- **Browser back/forward buttons**: Standard browser history navigation. `canNavigateBack()` checks ensure the app doesn't call `history.back()` when there's no valid app history.
- **No native integrations**: No Capacitor listeners, no popstate fallback.

---

## 14. Error Recovery (`NavigationErrorBoundary.tsx`)

Wraps the main content to catch navigation-related rendering errors:

```typescript
class NavigationErrorBoundary extends React.Component {
  state = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (this.state.retryCount < 1) {
      // Retry once
      this.setState({ hasError: false, retryCount: this.state.retryCount + 1 });
    } else {
      // Hard reload after max retries
      setTimeout(() => window.location.reload(), 2000);
    }
  }
}
```

---

## 15. Complete Back Navigation Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                 BACK BUTTON PRESSED                      │
│  (Header tap / Android hardware / iOS swipe)             │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │  Modal stack empty?  │
              └──────┬──────────────┘
                     │
            NO ──────┤────── YES
            │                │
            ▼                ▼
   Close topmost     ┌──────────────────┐
   modal. STOP.      │ Page handler set? │
                     └──────┬───────────┘
                            │
                   NO ──────┤────── YES
                   │                │
                   │                ▼
                   │     Call page handler
                   │     Returns true? → STOP
                   │     Returns false? → continue
                   │                │
                   ▼                ▼
          ┌────────────────────────────────┐
          │  On home page? (Android only)  │
          └──────────┬─────────────────────┘
                     │
            YES ─────┤────── NO
            │                │
            ▼                ▼
   Double-press       ┌─────────────────────────┐
   to exit logic      │  Match route config      │
                      │  Determine fallback path │
                      └──────────┬──────────────┘
                                 │
                                 ▼
                      ┌─────────────────────────┐
                      │  Is entry point route?   │
                      │  (/games/id, /user-chat, │
                      │   /group-chat, etc.)     │
                      └──────────┬──────────────┘
                                 │
                        YES ─────┤────── NO
                        │                │
                        ▼                ▼
                 Use fallback     ┌──────────────────┐
                 path directly    │  canNavigateBack? │
                                  └──────┬───────────┘
                                         │
                                YES ─────┤────── NO
                                │                │
                                ▼                ▼
                        navigate(-1)      Use fallback
                        + 350ms safety    path directly
                        check
                                │
                                ▼
                        ┌───────────────────┐
                        │ Pathname changed?  │
                        └──────┬────────────┘
                               │
                      YES ─────┤────── NO
                      │                │
                      ▼                ▼
                   Success      Use fallback
                                path (recovery)
```

---

## 16. Key Design Decisions & Gotchas

### Why `replace: true` for most navigations?

Tab switches and service navigations use `replace: true` to prevent the browser history from growing unboundedly. Without this, switching between tabs 100 times would require 100 back presses to exit. Only explicit "push" navigations (entering a game detail from a list) create real history entries.

### Why entry point routes always use fallback?

Routes like `/games/{id}` can be opened directly via deep link or shared URL. In these cases, there's no meaningful "previous page" in the browser history. Using `navigate(-1)` would land on a blank page or external URL. The fallback ensures a predictable destination.

### Why the 350ms safety timeout?

`navigate(-1)` (which calls `history.back()`) is asynchronous — the URL updates via the `popstate` event. The 350ms window allows the browser to process the navigation. If the pathname hasn't changed, the navigation failed and we fall back to the route config's fallback path.

### Why separate modal stack from page handlers?

Modals and pages need different back-button semantics:
- **Modals**: Back = close the modal (dismiss). Multiple modals stack (LIFO).
- **Pages**: Back = navigate away. Only one page handler at a time.

The modal stack is checked first, so an open modal always intercepts back before page navigation occurs.

### Why `isAppNavigation` marking?

React apps in WebViews can have browser history entries from non-app URLs (initial load, OAuth redirects, etc.). The `isAppNavigation` flag on history state entries distinguishes app navigations from these, preventing `navigate(-1)` from accidentally leaving the app.

### Search query preservation

When a user searches in the chats list, navigates into a chat, and presses back, the search query is preserved via `locationState.searchQuery`. The fallback function constructs the return URL with the query parameter: `/chats?q={searchQuery}`.
