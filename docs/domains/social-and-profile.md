# Social and profile

## Own profile `/profile`

`Profile.tsx` / `ProfileTab`. Tabs via `shellNavStore.profileActiveTab`: **general**, **statistics**, **comparison**, **followers**, **reviews** (trainers only — non-trainers snap off reviews).

### General

Identity: avatar, name, email, gender, bio, verbal status, hand, court side. Sports: enable/disable, per-sport level (`UserSportProfile`; PADEL `User.approved*` is a denormalized mirror only), external rating hints, Playtomic import, competitive/social, weekly availability. Preferences: Home city (`switchCity` — not Browse), language, time format, week start, default currency, theme, native app icon carousel.

Premium users also have a **Main theme** selector in Appearance: **Classic** / **Premium**. `User.mainTheme` is saved on the account independently of the device's Light/Dark/System preference. It defaults to `premium` (including existing accounts), but Premium styling requires both `isPremium === true` and `mainTheme === 'premium'`. Standard users see Classic and no selector. Losing membership preserves the preference for a later renewal; choosing Classic does not remove premium benefits. Profile writes validate both the enum and premium membership. Document, loading-screen, chat, and native WebView backgrounds follow both theme choices, including System changes on resume. Classic uses cool neutral backgrounds; Premium uses warm neutrals.

Privacy: messages from non-contacts, `showOnlineStatus`, always-show names. Sharing to followers: photos / creations / results. Linked Apple/Google/Telegram. Wallet modal. Notification prefs. Blocked users. Logout / delete. Links: `/profile/sessions`, `/profile/connected-clubs`, `/game-subscriptions`, EULA. Native build number.

The Main theme control uses two visual radio choices (`components/MainThemeSelector.tsx`): Classic shows cool neutrals and blue accents; Premium shows obsidian, gold and the tiger crest. Each preview retains its own palette under either selected theme and follows Light/Dark for its page surface. A border and checkmark identify the saved selection. Native radio keyboard controls are supported; both choices are disabled while saving, and a failed save leaves the previous selection and app appearance intact.

Premium members also have a **Show premium status** switch in Appearance, saved as `User.showPremiumStatus` (default `true`). Turning it off removes the gold treatment on names and public premium owner fire markers on game cards, including chat game cards, so the member appears as a standard user. It does not alter `isPremium`, premium benefits, `mainTheme`, or Light/Dark/System. The switch is disabled while saving; failed saves preserve its prior state. Only Premium members can change it; a downgrade preserves the preference for renewal. Account merges retain either account’s opt-out. Public user projections include the preference so guests and all viewers respect it.

### Premium names

Public names receive gold lettering, a thin dark outline and a soft gold glow when `showsPremiumStatus(user)` is true (`isPremium === true` and `showPremiumStatus !== false`). The treatment uses the existing font and layout, with no underline, nameplate, added spacing or avatar decoration. Profiles, roster/invite lists, followers, rankings, chat names and DM headers share it. Opting out removes the treatment and Premium tooltip; personal theme and membership benefits remain independent.

### Premium welcome

After authenticated startup, Premium members verify `/users/me/premium-onboarding` against the server, independently of Classic/Premium theme selection. A null `User.premiumOnboardingCompletedAt` shows the full-screen Inner Circle artwork with a cinematic entrance: a gold tiger seal and vertical light seam, paired dark panels opening over 3.4 seconds, then a slow camera settle onto the unchanged poster. A single gilded light pass gives way to restrained lamplight and 24 softly glowing gold particles until dismissal. The particles build after the doors open with varied sizes, soft halos and longer rising paths from the same low origins, fading around the middle of the poster before reaching the headline. Motion begins only when the poster loads; a failed image shows a readable text welcome. A localized “I accept” compact obsidian pill with high-resolution black-and-gold marble matching the poster’s stone moving in a continuous circular orbit, muted gold text and a slow light sweep beneath the poster replaces the Close icon, with a centered text-only label, keyboard focus treatment and safe-area spacing. The button fades up as soon as the doors finish opening, while the poster continues its camera settle; reduced motion and image failure show it immediately. Its compact reserved space avoids a layout jump. Accepting, Escape, and native Back dismiss immediately and save completion in the background through `POST /users/me/premium-onboarding/complete`. First completion immediately selects the Premium main theme locally and saves `mainTheme=premium` together with the completion timestamp on the account, leaving Light/Dark/System unchanged. Replaying an already completed welcome preserves any later main-theme choice. A slow or failed save never blocks closing, shows an error, or automatically reopens the welcome during the current session. If saving fails, the server may show the welcome again on a later launch. Opening or viewing alone never completes onboarding. Completion is account-wide and idempotent, survives renewal, and is retained when accounts merge. The Premium header brand replays the same animation without route navigation; completed members incur no further write. Reduced-motion users receive the complete static poster immediately, without the entrance panels, zoom or atmospheric effects.

The Premium theme uses the gold tiger for the footer, HTML/React loading screens and native iOS/Android launch branding. Background colors still follow Light/Dark/System. Classic and non-Premium accounts retain their chosen sport/app-icon branding. Native launch changes require a new store build.

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
