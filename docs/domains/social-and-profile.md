# Social and profile

## Own profile `/profile`

`Profile.tsx` / `ProfileTab`. Tabs via `shellNavStore.profileActiveTab`: **general**, **statistics**, **comparison**, **followers**, **reviews** (trainers only — non-trainers snap off reviews).

### General

Identity: avatar, name, email, gender, bio, verbal status, hand, court side. Sports: enable/disable, per-sport level (`UserSportProfile`; PADEL `User.approved*` is a denormalized mirror only), external rating hints, Playtomic import, competitive/social, weekly availability. Preferences: Home city (`switchCity` — not Browse), language, time format, week start, default currency, theme, native app icon carousel.

Privacy: messages from non-contacts, `showOnlineStatus`, always-show names. Sharing to followers: photos / creations / results. Linked Apple/Google/Telegram. Wallet modal. Notification prefs. Blocked users. Logout / delete. Links: `/profile/sessions`, `/profile/connected-clubs`, `/game-subscriptions`, EULA. Native build number.

### Statistics / comparison / followers / reviews

Per-sport stats, insights, streaks, reliability, level history, player-level-feedback aggregate (privacy threshold). Head-to-head comparison. Following/followers (`/favorites/users`). Trainer reviews.

## Other profile `/user-profile/:userId`

Guest-readable. Avatar, stats, levels, favorite/follow, share, DM, block, reviews. `?sport=` for level context.

## Social graph

- Follow/unfollow: API `/favorites/users` (UI “follow”). Also highlights trainers on Find.
- Favorite clubs: separate API; Find filter shortcut.
- Block/unblock: chat + follow.
- User teams `/user-team/:id`: pair, invite, add pair to a game the member can invite to, delete.
- Invite friend: share link (Home empties / invite modal).

## Player overlay `?player=`

`PlayerCardModalManager` + `urlSchema.getOverlay`. Bottom sheet: avatar/stats, follow, block, DM, invite, send coins (`SendMoneyToUserModal`), common groups `GET /users/:id/common-groups`. `?sport=` preserved.

## Sessions `/profile/sessions`

Per-device refresh sessions; revoke one / all.

## i18n

`APP_UI_LANGUAGES`: en, ru, sr, es, cs, ar, zh, id, hi, th, ja. Synced from `user.language`. RTL: ar. Fallback en. Namespaces under `Frontend/src/i18n/locales/<lang>/`.
