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
3b. **Live now rail** — only when the viewer has **no game of their own today**, computed in the viewer's *city* day (`Frontend/src/features/live/homeLiveRailGate.ts`). Softer header ("Live in Belgrade"), at most 3 cards, plus a **See all on Find** link. Home stays about the viewer; the rail is what fills an empty day. See [live-scoring.md](./live-scoring.md).
3c. **Monthly recap bubble** — front of the story rail on the 1st–3rd. See [stories.md](./stories.md).
4. **Unlinked bookings** — `MyTabUnlinkedBookingsSection`. Upcoming Booktime/Padeloo/Klikteren/Nspadel reservations not fully linked to a game. Confirmed via one batch linked-games lookup; a failed lookup does not pretend unlinked. Per-slot: link, create game, cancel. Adjacent same-court grouping. “See all” → `/profile/connected-clubs`. Fully linked upcoming bookings stay behind the compact Bookings CTA.
5. Home hero ad (`AD_PLACEMENTS.HOME_HERO`) when `cityIsSet`.
6. **HomeActionGrid** — Play hero (`PlayHeroButton`, court lobby / looking), Browse games → `/find`, Leagues CTA (expands `YourLeaguesHomeSection` when `panelCounts.leagues > 0`), Bookings CTA when remaining linked bookings (`hideBookingsCta` while unlinked section is visible/pending).
7. **Invites** — accept/decline (`useDeclineInvite`, optional note). Gender/name/overlap gates. Accept PLAYING consumes looking intent (see `play-intent.md`).
8. Calendar heading / `CalendarSection` (month grid; overflow adjacent-month days with games selectable). Desktop: splitter, calendar left.
9. **MyGamesSection** — cards for selected day (calendar) or upcoming list. Unread chips via `useUnreadBridge`. EVENT listings only if OWNER, Going (`PLAYING`), or Need partner (`lookingForPartner`).
10. **UserTeamsHomeSection** — user’s pairs; tap → `/user-team/:id`.

Past-games tab: `PastGamesSection` + teams. `LEAGUE_SEASON` hubs excluded from the past list.

Gender prompt lives on Find, not Home. Invite-friend CTA is on invite/search empties, not a Home banner.

**First-run onboarding does not replace these prompts.** `/welcome` ([social-and-profile.md](./social-and-profile.md)) puts the city prompt, the sport questionnaire and follow suggestions into an ordered first run — but every one of those steps is skippable, and the Home banner for a skipped step stays exactly as it was. Skipping the level step leaves the level unset and the questionnaire prompt on Home; skipping the city step leaves the city prompt. Removing a banner "because onboarding covers it" would strand every user who skipped. The one behaviour that did change: a completed account with **no enabled sport** used to be bounced to Profile and now goes to `/welcome?step=sport`.

### Game cards

Tap → `/games/:id`. Unread chat badge. Create from calendar date pre-fills `createGameInitialDate`. Join/leave/overlap/gender gates same as Find.

## Find tab `/find`

`Frontend/src/pages/FindTab.tsx` → `AvailableGamesSection`. Queries: `useAvailableGames` (calendar `indexOnly` month + day-scoped), `useAvailableUpcomingGames` (list). City: `user.currentCity.id`. Header city chip (`FindHeaderActions`) opens `CityModal` and calls `switchCity` (Home). Re-tap Find → today (`requestFindGoToCurrent`).

### Views

- Calendar (default). Month picker, weather toggle, List toggle. Selected-day list. Desktop split: calendar + list.
- List (`?view=list`) — from today, grouped by date.

`findViewMode` is URL-backed (`useUrlStoreSync`). Toggle writes `navigationService.navigateToFind({ view })`.

### Quick shortcuts (PRD 358)

Today · Tomorrow · Weekend as one `SegmentedSwitch` row (`FindQuickShortcutsRow`) under the calendar heading, in both the expanded and the collapsed (list) state; on My the calendar has no row. A shortcut is a **preset over existing state**, not a filter: `resolveQuickShortcut` (`components/home/findQuickShortcuts.ts`, pure) turns a kind into `{ selectedDay, dayKeys? }` in the **Home-city timezone**. Tonight was dropped after review: padel days are mostly evenings, so an 18:00 cut looked identical to Today.

The row **reflects the calendar** (`resolveActiveQuickShortcut`): Today is highlighted whenever today is the selected day, Tomorrow whenever tomorrow is, Weekend whenever Saturday or Sunday of the coming weekend is (and both days are listed), however the day was picked; nothing is highlighted in list view or on other days. On Friday, tomorrow is Saturday and reads as Weekend. The only stored bit is the Weekend **pin** (`shellNavStore.activeFindQuickShortcut`), which decides a weekend day that is also today: the Weekend option sets it, Today clears it.

| Shortcut | Day | Under the calendar | Notes |
|---|---|---|---|
| Today | today | selected-day list | Go to today (`requestFindGoToCurrent`); re-tap scrolls the calendar into view |
| Tomorrow | tomorrow | selected-day list | Plain day selection; no stored state |
| Weekend | coming Sat (today if Sat/Sun) | Sat + Sun as date-grouped sections | Calendar stays open. `FindTab` also runs the upcoming query while Weekend is active (same derived rule) and hands the section `weekendGames`; `filterFindGames({ dayKeys })` cuts it to `resolveWeekendDayKeys(today)` |

Every shortcut runs in calendar view (tapping one from list view switches back). The pin is **session-only** — never in `useGameFilters` / IndexedDB — and is dropped once the calendar shows a non-weekend day, the view is List, or the city day has rolled over (`isQuickShortcutCurrent`). Re-tapping a highlighted option changes nothing, except Today, which scrolls the calendar into view. Empty title under a shortcut: `resolveFindEmptyMessage({ quickShortcut })` replaces only the generic "No games found".

Deep link: `/find?quick=tomorrow|weekend` is read once by `useUrlStoreSync` into `requestFindQuickShortcut`; `AvailableGamesSection` applies it and rewrites the URL without the param. Copy: `games.quickShortcuts.*` (labels, `empty.*`).

### URL + persist

| Source | What |
|--------|------|
| `?view=calendar\|list` | View |
| `?date=` / `?dayOffset=` | Selected day; forces calendar |
| `?quick=tomorrow\|weekend` | Applies a quick shortcut once, then stripped |
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

### Live now rail

Above the calendar on Find (desktop: top of the games column, above the events rail). Data-driven — absent when the city has nothing live, with no empty card and no reserved space. At most 10 cards. Source and privacy gate: [live-scoring.md](./live-scoring.md).

### `?clubIds=` on Find

`useFindFromUrl` parses `?clubIds=a,b` and `FindTab` applies it through `applyFindClubIdsFromUrl` once the stored filters have hydrated. Deliberately conservative: a URL with **no** `clubIds` leaves the player's saved filter alone, and a URL matching the saved filter produces no update, so the effect cannot loop. When it does apply, the filters panel opens so the player can see (and clear) the filter that arrived with the link. Produced by the public club page's "See all on Find" ([club-admin.md](./club-admin.md)).

## Card enrichment

Find and My cards are rendered from a lean projection plus a bag of derived fields attached per batch. Enrichers register themselves by name:

```ts
registerAvailableGamesEnricher(name, async (userId, games) => Record<gameId, Partial<fields>>)
```

`Backend/src/services/game/availableGamesEnrichment.ts`. Rules for an implementation: read-only, a **bounded** number of queries (one batched query per call, never one per game), tolerate ids it knows nothing about, and return `{}` rather than throwing when there is nothing to attach — though a throw is survivable too, since `enrichAvailableGamesSafe` catches per enricher and the list still paints.

| Field | Registered by | Meaning |
|-------|---------------|---------|
| `userNote` / `weatherSummary` / `reactions` | core enrichment | pre-existing card extras |
| `spotOpenedAt` | `gameSeat/spotOpenedEnricher.ts` (`prd347.spotOpened`) | **Spot opened** pill, only within the 2 h window and only while `resultsStatus === 'NONE'` |
| `liveSummary` | `game/liveGamesEnricher.ts` | compact live score for the Live now rail |
| `weatherRisk` | `weather/weatherAlert.service.ts` | rain / wind pill for outdoor games within 48 h over the threshold |
| `perHeadPrice` | `gameCost/perHeadPrice.enricher.ts` | derived per-player share for the card price row |
| `seriesLabel` | `gameSeries/gameSeriesCardEnricher.ts` | `↻ Weekly` pill and the series link |
| `attendanceSummary` | `gameAttendance/gameAttendance.service.ts` | confirmed / not-yet counts for the right rail |

Registration happens at **import time of the feature's own module**, reached through a module the app actually loads — usually the feature's route file, occasionally its service (`gameSeat.service.ts` imports `./spotOpenedEnricher`, and there is no `gameSeat.routes.ts`).

Two things about this pipeline are load-bearing and documented in [constraints.md](../product/constraints.md): the backend and frontend field types are **hand-mirrored with no compile-time link**, and the client merge is the only source of these fields — a merge that names fields individually silently drops the rest. `buildGameRenderSignature` must also name every field the card renders, or the memoised card never repaints.

**Sorting is client-side only.** `sortDayGroupGames` (`Frontend/src/features/spot-opened/spotOpenedWindow.ts`) floats spot-opened cards to the top of their day group, keeping start-time order within each half. `Frontend/src/utils/groupGamesByDate.ts` and the private duplicate inside `Frontend/src/components/home/UpcomingGamesList.tsx` both call it; they must not drift.
