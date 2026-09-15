# Home and Find

Home city (`user.currentCity`) drives both tabs. Browse city does not. Users with no enabled sport are redirected here to Profile.

## My tab `/`

`Frontend/src/pages/MyTab.tsx`. Payload: `GET /api/me/my-tab-data` via `useMyGames`. URL: `useHomeFromUrl` + `useUrlStoreSync`.

### URL

| Query | Effect |
|-------|--------|
| (none) / `?tab=calendar` | Calendar (default) |
| `?tab=past-games` | FINISHED/ARCHIVED list (`usePastGames`) |
| `?focus=invites` | Calendar + scroll to `#home-invites-section` |
| `?tab=list` or `?tab=advanced` | Replaced with `/` |

`?player=` / `?item=` overlays still apply. Play-intent deep links (`?playIntentOpen=1`, `?proposal=`, `?lobby=1`) are handled by `PlayIntentProvider` on the action grid.

### Layout (top → bottom)

1. **Stories** — `StoriesRail` (see `stories.md`).
2. **CityPromptBanner** — city unset / auto-city confirm.
3. **SportQuestionnairePrompt** — per primary sport.
4. **Unlinked bookings** — `MyTabUnlinkedBookingsSection`. Upcoming Booktime/Padeloo/Klikteren/Nspadel reservations not fully linked to a game. Confirmed via one batch linked-games lookup; a failed lookup does not pretend unlinked. Per-slot: link, create game, cancel. Adjacent same-court grouping. “See all” → `/profile/connected-clubs`. Fully linked upcoming bookings stay behind the compact Bookings CTA.
5. Home hero ad (`AD_PLACEMENTS.HOME_HERO`) when `cityIsSet`.
6. **HomeActionGrid** — Play hero (`PlayHeroButton`, court lobby / looking), Browse games → `/find`, Leagues CTA (expands `YourLeaguesHomeSection` when `panelCounts.leagues > 0`), Bookings CTA when remaining linked bookings (`hideBookingsCta` while unlinked section is visible/pending).
7. **Invites** — accept/decline (`useDeclineInvite`, optional note). Gender/name/overlap gates. Accept PLAYING consumes looking intent (see `play-intent.md`).
8. Calendar heading / `CalendarSection` (month grid; overflow adjacent-month days with games selectable). Desktop: splitter, calendar left.
9. **MyGamesSection** — cards for selected day (calendar) or upcoming list. Unread chips via `useUnreadBridge`. EVENT listings only if OWNER, Going (`PLAYING`), or Need partner (`lookingForPartner`).
10. **UserTeamsHomeSection** — user’s pairs; tap → `/user-team/:id`.

Past-games tab: `PastGamesSection` + teams. `LEAGUE_SEASON` hubs excluded from the past list.

Gender prompt lives on Find, not Home. Invite-friend CTA is on invite/search empties, not a Home banner.

### Game cards

Tap → `/games/:id`. Unread chat badge. Create from calendar date pre-fills `createGameInitialDate`. Join/leave/overlap/gender gates same as Find.

## Find tab `/find`

`Frontend/src/pages/FindTab.tsx` → `AvailableGamesSection`. Queries: `useAvailableGames` (calendar `indexOnly` month + day-scoped), `useAvailableUpcomingGames` (list). City: `user.currentCity.id`. Header city chip (`FindHeaderActions`) opens `CityModal` and calls `switchCity` (Home). Re-tap Find → today (`requestFindGoToCurrent`).

### Views

- Calendar (default). Month picker, go-to-today. Selected-day list. Desktop split: calendar + list.
- List (`?view=list`) — from today, grouped by date.

`findViewMode` is URL-backed (`useUrlStoreSync`). Toggle writes `navigationService.navigateToFind({ view })`.

### URL + persist

| Source | What |
|--------|------|
| `?view=calendar\|list` | View |
| `?date=` / `?dayOffset=` | Selected day; forces calendar |
| `?player=` / `?item=` | Overlays |
| `?playIntentOpen=1` / `?proposal=` / `?lobby=1` | Court lobby |
| IndexedDB `padelpulse-game-filters` | Chips + advanced panel (`useGameFilters`) |

`useFindFromUrl` also reads `game`/`training`/`tournament`/`leagues`; chips are not written to the URL today.

### Category chips (OR)

`findEntityTypeChips.ts`. Keys: Games, Training, Tournaments, Leagues, Events.

| Chip state | List river | Calendar days + selected-day list |
|-----------|------------|-----------------------------------|
| All off | All types **except** `EVENT` | Includes `EVENT` (`idleIncludesEvent`) |
| Any on | Union of selected types (`LEAGUE` chip includes `LEAGUE_SEASON`) | Same |

`resolveFindEntityTypesParam` order: `GAME,TRAINING,TOURNAMENT,LEAGUE,EVENT`. Empty → omit param.

Advanced panel filters AND with chips (`findFilter.ts`): clubs (favorite shortcut), time window, level range, sport (`primary`/`all`/one), available slots, suitable rating, no-rating, hide bar, private (admin). Training chip on → trainer carousel (tap filters by trainer).

### Events rail

`FindCityEventsRail` **below the calendar** (desktop: games column). `useUpcomingCityEvents` (`entityTypes: EVENT`). Cap 3. Layout: 1 → full-width row; 2–3 → horizontal carousel (`findCityEventsRailLayout`). Hidden when Events chip is on. **See all** turns Events chip on. `ON_APPROVE` omitted except owner/`isAdmin`.

### Join

Card join / queue. Blocked: wrong gender, out-of-range level, missing name, overlap confirm. Badges: gender lock, booked (manual blue / external green / partial blue). Find month index is progressive — do not fold continuation into the main query promise (`product/constraints.md`).

Play-intent strip: `PlayIntentFindBar` (Home city). Radar: `play-intent.md`. Invite Search|Looking is a different surface (`plans/player-invite-looking.md`).
