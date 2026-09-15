# Game subscriptions

`/game-subscriptions`. CRUD per user (`GameSubscription`). Alerts when a **new public** game is created with `clubId`, not `LEAGUE` / `LEAGUE_SEASON`. Recipients: active subscriptions in the **same city**; creator excluded. Push and/or Telegram; respects notification prefs (`SEND_MESSAGES`).

Matcher: `GameSubscriptionService.checkGameMatchesSubscriptions` (called from `notification.service.ts` on create). Empty filter = no constraint.

| Filter | Match |
|--------|--------|
| City | `subscription.cityId === game.cityId` (query already scoped) |
| Entity types | Game `entityType` in list if list non-empty |
| Clubs | `game.clubId` in list if list non-empty |
| Day of week | Start weekday in **city TZ** ∈ list |
| Date range | Game date ≥ `startDate` and ≤ `endDate` (city TZ, `yyyy-MM-dd`) |
| Time window | Start time-of-day ≥ `startTime` and **<** `endTime` (city TZ; end exclusive) |
| Level | Interval overlap of game `[minLevel,maxLevel]` vs subscription when either side has bounds |
| My gender only | Skip `MEN`/`WOMEN` that do not match subscriber gender; `ANY` (and code also treats `MIXED`) pass. Schema gender enum is `MIX_PAIRS` not `MIXED`. |

`dayOfWeek` 0–6. Times `HH:MM` or `24:00`.
