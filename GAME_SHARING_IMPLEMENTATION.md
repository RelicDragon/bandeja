# Game Sharing with Meta Tags - Implementation Summary

## What Was Implemented

### 1. Backend Changes

#### a. Meta Tags Controller (`Backend/src/controllers/metatags.controller.ts`)
- Created controller to generate HTML with Open Graph and Twitter meta tags
- Includes game name, location, datetime, and image
- Serves HTML that bots/crawlers can read

#### b. Backend Route (`Backend/src/app.ts`)
- Added route `GET /games/:gameId` to serve meta tags
- This route is only hit by bots (nginx routes bots here)

#### c. Game Service (`Backend/src/services/game/read.service.ts`)
- Added `skipRestrictions` parameter to `getGameById()`
- Allows public viewing of games without auth/city restrictions
- Normal users still have restrictions, but bots can fetch any game

#### d. API Route (`Backend/src/routes/game.routes.ts`)
- Already uses `optionalAuth` middleware
- Allows both authenticated and unauthenticated API access

### 2. Frontend Changes

#### a. Public Route (`Frontend/src/App.tsx`)
- Route `/games/:id` now accessible without authentication
- Redirects incomplete profiles to home (if authenticated)
- Allows unauthenticated users to view game details

#### b. Public Game Prompt (`Frontend/src/components/GameDetails/PublicGamePrompt.tsx`)
- New component showing login/register buttons for unauthenticated users
- Appears when viewing a game without being logged in

#### c. Game Details (`Frontend/src/pages/GameDetails.tsx`)
- Protected API calls (invites, etc.) only run if user is authenticated
- Shows PublicGamePrompt for unauthenticated users
- GameParticipants component only shown to authenticated users

#### d. Axios Interceptor (`Frontend/src/api/axios.ts`)
- 401 errors on game pages don't redirect to login
- Allows viewing game details even when not authenticated

### 3. Nginx Configuration (`Frontend/nginx.conf`)

#### a. Bot Detection
- Map directive detects common bots/crawlers by User-Agent
- Includes: Facebook, Twitter, WhatsApp, Telegram, Slack, Discord, etc.

#### b. Smart Routing
- **Bots**: Proxied to backend → receive HTML with meta tags
- **Regular Users**: Served React SPA → full interactive experience

#### c. Implementation Pattern
- Uses `error_page 418` trick to conditionally proxy
- Named location `@backend_meta` handles bot requests
- Regex pattern matches `/games/[id]` format

## How It Works

### When a Bot/Crawler Visits
1. Bot requests `https://app.bandeja.me/games/abc123`
2. Nginx detects bot via User-Agent
3. Nginx proxies request to Backend at `/games/abc123`
4. Backend fetches game data (no auth required)
5. Backend generates HTML with meta tags
6. Bot receives HTML with proper Open Graph tags

### When a Regular User Visits
1. User requests `https://app.bandeja.me/games/abc123`
2. Nginx detects regular browser
3. Nginx serves `index.html` (React SPA)
4. React router loads GameDetails page
5. If not logged in: shows login/register prompt
6. If logged in: shows full game details with interactions

## Meta Tags Included

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="Bandeja Padel">
<meta property="og:url" content="[game url]">
<meta property="og:title" content="[game name]">
<meta property="og:description" content="[location, datetime]">
<meta property="og:image" content="[game avatar or club photo]">

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="[game name]" />
<meta name="twitter:description" content="[location, datetime]" />
<meta name="twitter:image" content="[game avatar or club photo]" />
```

## Testing

### To Test Bot Behavior
```bash
# Simulate Facebook bot
curl -A "facebookexternalhit/1.0" https://app.bandeja.me/games/YOUR_GAME_ID

# Simulate Twitter bot
curl -A "Twitterbot/1.0" https://app.bandeja.me/games/YOUR_GAME_ID

# Should return HTML with meta tags
```

### To Test Regular User
1. Open `https://app.bandeja.me/games/YOUR_GAME_ID` in browser (not logged in)
2. Should see game details with login/register prompt
3. Should NOT be redirected away
4. Should see game name, location, time, participants

### To Test Sharing
1. Share game link in Telegram/WhatsApp/Facebook
2. Should show rich preview with:
   - Game name as title
   - Location and datetime as description
   - Game avatar or club photo as image

## Deployment

### Backend
```bash
cd Backend
npm run build
# Restart backend service
```

### Frontend
```bash
cd Frontend
npm run build
# Copy dist folder to server
# Restart nginx
```

### Nginx
- Update nginx config on server with new version from `Frontend/nginx.conf`
- Test config: `nginx -t`
- Reload nginx: `systemctl reload nginx`

## Environment Variables

Make sure `FRONTEND_URL` is set correctly in backend `.env`:
```
FRONTEND_URL=https://app.bandeja.me
```

This is used for generating the correct URLs in meta tags.
