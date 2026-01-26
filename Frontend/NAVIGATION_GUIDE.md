# Navigation System Guide

## Overview

This app uses a modern navigation system built on:
- **History State API** for reliable back button tracking
- **Declarative route configuration** for maintainable back navigation
- **Automatic tracking** via `navigateWithTracking()`

## ⚠️ IMPORTANT: Always Use Tracked Navigation

**❌ DON'T DO THIS:**
```typescript
const navigate = useNavigate();
navigate('/games/123'); // Won't be tracked!
```

**✅ DO THIS INSTEAD:**
```typescript
import { useNavigateWithTracking } from '@/hooks/useNavigateWithTracking';

const navigate = useNavigateWithTracking();
navigate('/games/123'); // Automatically tracked!
```

## Quick Start

### 1. For New Components

```typescript
import { useNavigateWithTracking } from '@/hooks/useNavigateWithTracking';

function MyComponent() {
  const navigate = useNavigateWithTracking();
  
  const handleClick = () => {
    // This is automatically tracked
    navigate('/profile', { 
      state: { fromPage: 'my' } 
    });
  };
  
  return <button onClick={handleClick}>Go to Profile</button>;
}
```

### 2. For Services (Non-React)

```typescript
import { navigateWithTracking } from '@/utils/navigation';

class MyService {
  private navigate: NavigateFunction;
  
  doSomething() {
    // Use navigateWithTracking instead of this.navigate directly
    navigateWithTracking(this.navigate, '/games/123', {
      state: { fromPage: 'find' }
    });
  }
}
```

## How It Works

### History State API

Every navigation adds `isAppNavigation: true` to the history state:

```typescript
window.history.state = {
  usr: { /* your state */ },
  isAppNavigation: true,  // Added automatically
  timestamp: 1234567890   // Added automatically
}
```

The back button checks this marker to know if it can safely go back.

### Declarative Routes

Routes are configured in `/config/navigationRoutes.ts`:

```typescript
{
  pattern: /^\/games\/[^/]+$/,
  fallback: (pathname, state) => {
    // Handle complex back navigation logic
    if (state?.fromLeagueSeasonGameId) {
      return `/games/${state.fromLeagueSeasonGameId}`;
    }
    return '/';
  },
  priority: 5,
}
```

To add a new route:
1. Add pattern to `navigationRoutes.ts`
2. Define fallback behavior
3. Set priority (higher = checked first)

### Back Button Behavior

1. **With History**: Uses browser back (`navigate(-1)`)
2. **Without History**: Uses declarative route configuration
3. **On Home (Android)**: Double-press to exit with toast message

## Common Patterns

### Passing State for Back Navigation

```typescript
// When navigating TO a page
navigate('/games/123', { 
  state: { 
    fromPage: 'find',              // Where we came from
    fromLeagueSeasonGameId: '456'  // Complex back navigation
  } 
});

// The back button will automatically navigate to the right place
```

### Navigation with Animation

```typescript
const { setIsAnimating } = useNavigationStore();

const handleNavigate = () => {
  setIsAnimating(true);
  navigate('/profile');
  setTimeout(() => setIsAnimating(false), 300);
};
```

### Modal Back Button Handling

```typescript
import { useBackButtonModal } from '@/hooks/useBackButtonModal';

function MyModal({ isOpen, onClose }) {
  // Automatically handles Android back button
  useBackButtonModal(isOpen, onClose);
  
  return <BaseModal isOpen={isOpen} onClose={onClose}>...</BaseModal>;
}
```

## Android Specific

### Double-Press to Exit

On the home page, users must press back twice within 2 seconds to exit:

```typescript
// First press: Shows toast
// Second press (within 2s): Exits app
```

Translation key: `common.pressBackAgainToExit`

### System Back Button

Handled automatically by `backButtonService`:
1. Closes top modal (if any)
2. Runs page handler
3. Falls back to default navigation

## Error Recovery

Navigation errors are caught by `NavigationErrorBoundary`:
- Soft recovery: Resets state without full reload
- Hard recovery: Only as last resort
- User sees temporary loading message

## Migration Guide

### Updating Existing Code

**Find all navigate calls:**
```bash
grep -r "const navigate = useNavigate()" src/
```

**Replace with:**
```typescript
// Old
const navigate = useNavigate();

// New
const navigate = useNavigateWithTracking();
```

**For services, wrap calls:**
```typescript
// Old
this.navigate('/path');

// New
navigateWithTracking(this.navigate, '/path');
```

## Testing

### Test Back Button

1. **With History:**
   - Navigate: Home → Profile → Settings
   - Press back → Should go to Profile
   - Press back → Should go to Home

2. **Without History:**
   - Open deep link to `/games/123`
   - Press back → Should go to Home (no history)

3. **Android Double-Press:**
   - On home page, press back once → Toast appears
   - Wait 3 seconds → Press back → Toast appears again
   - Press back twice quickly → App exits

### Debug Navigation

```typescript
// Check if navigation is tracked
console.log('Can go back:', canNavigateBack());
console.log('History state:', window.history.state);
console.log('History length:', window.history.length);
```

## Common Issues

### ❌ Back Button Not Working

**Problem:** Navigation not tracked
```typescript
// Wrong
navigate('/profile');
```

**Solution:** Use tracked navigation
```typescript
// Correct
const navigate = useNavigateWithTracking();
navigate('/profile');
```

### ❌ Back Goes to Wrong Page

**Problem:** Route configuration missing or incorrect

**Solution:** Add/update route in `navigationRoutes.ts`

### ❌ Android Back Doesn't Close Modal

**Problem:** Modal not using `useBackButtonModal`

**Solution:** Add the hook
```typescript
useBackButtonModal(isOpen, onClose);
```

## Best Practices

1. ✅ Always use `useNavigateWithTracking()` in components
2. ✅ Always use `navigateWithTracking()` in services
3. ✅ Pass `fromPage` state when navigating between tabs
4. ✅ Add complex routes to `navigationRoutes.ts`
5. ✅ Use `useBackButtonModal` for modals
6. ✅ Test back button on both browser and Android

## API Reference

### `useNavigateWithTracking()`
Returns a navigate function with automatic tracking.

### `navigateWithTracking(navigate, path, options)`
- `navigate`: NavigateFunction from React Router
- `path`: string | number (route or -1 for back)
- `options`: NavigateOptions with optional state

### `canNavigateBack()`
Returns boolean indicating if history navigation is safe.

### `useBackButtonModal(isOpen, onClose, modalId?)`
Registers modal for Android back button handling.

## Need Help?

Check the implementation in:
- `/utils/navigation.ts` - Core navigation logic
- `/config/navigationRoutes.ts` - Route configuration
- `/services/backButtonService.ts` - Android back button
- `/hooks/useNavigateWithTracking.ts` - React hook
