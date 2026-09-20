# Weather

Home-city scoped (`user.currentCity`). Calendar cells + game details.

- Preview on game/day (`useMonthCalendarWeather`, `weatherPreviewQueryOptions` / `weatherDayQueryOptions`).
- Full-day hourly dialog; archive for past days (`WeatherDayArchiveService`).
- API: `GET /weather/day?cityId&date=YYYY-MM-DD`, `GET /weather/preview?cityId&startTime&endTime&scope=game|day|forecast`. Game: `GET /games/:id/weather`.
- Scheduler: `WeatherForecastScheduler`. Forecast service non-blocking on game create/update.

Do not drive weather from Browse city.

## Weather alerts (outdoor games)

Proactive, twice at most, only for outdoor games. **The property that matters is silence**: an indoor game, a game whose courts cannot be determined, and a game with no forecast must all produce *nothing* — no banner, no card pill, no push, and above all no "weather data unavailable" state.

A step inside `GameStatusScheduler` (`0,30 * * * *`, after `sendReminders()`) evaluates `ANNOUNCED` games with `timeIsSet` whose `startTime` falls in one of two windows:

| Window | Start time from now | Fires when |
|--------|--------------------|------------|
| First | 11.5–12.5 h | severity ≥ `likely` and nothing has been sent yet |
| Second | 1.5–2.5 h | the severity **class** rose above the one already sent, and the organizer has not chosen "Keep as planned" |

The two windows never overlap, so one pass can never alert the same game twice. 60 % → 72 % is the same class and must not re-alert.

Severity is `none | likely | heavy | storm`, computed over the **whole** game window (`weatherRisk.ts`, thresholds as named constants):

| Class | Trigger |
|-------|---------|
| `likely` | precipitation probability ≥ 60 %, or ≥ 1 mm/h, or wind ≥ 40 km/h |
| `heavy` | probability ≥ 85 % or ≥ 4 mm/h |
| `storm` | a `thunderstorm` condition key, wind ≥ 60 km/h, or ≥ 8 mm/h |

Forecast data is the **existing** `weatherForecast.service.ts` DB cache (`WeatherForecastCache`), read cache-only and batched per city by `getCachedForecastPayloadsForCities`. The alert path never calls a provider: `WeatherForecastScheduler.prewarmUpcomingGameCities` keeps the rows warm, and a city with no usable row simply produces no alert. There is no second provider path.

Dedupe lives in `Game.weatherAlertState` (Json) and is **persisted on purpose** — the sibling 24 h/2 h reminders in the same scheduler dedupe with in-memory `Set`s and re-fire after a deploy; a weather alert must not:

```jsonc
{ "severity": "likely", "sentAt": ["2026-09-21T07:00:00.000Z"], "keepAsPlannedAt": "…", "lastEvaluatedAt": "…" }
```

The sweep must never throw out of the cron callback — `runWeatherAlertSweep` catches per game and in aggregate, so a provider or DB hiccup can never take the game-status sweep or the reminders down with it.

### Outdoor detection

`detectOutdoor()` in `weatherRisk.ts`, in this order:

1. Courts linked to the game (`GameCourt` rows, else `Game.court`). Any `isIndoor === false` makes the game outdoor; the outdoor/total counts drive the "1 of 2 courts is outdoor" copy.
2. No court at all → the club's **active** courts decide by strict majority.
3. Anything else — no courts and no club courts, or an exact indoor/outdoor tie — is **unknown**.

Unknown is not "probably outdoor". It returns `known: false` and every caller must treat that as "render nothing", never as a neutral or "no data" state. That is why `Court.isIndoor` is surfaced in club admin as a segmented switch with a roof icon on the schedule grid ([club-admin.md](./club-admin.md)).

### Surfaces and API

- **Game details** — `WeatherRiskBanner` above the game info block. Amber for rain, slate for wind, four hourly icons around the start time. Organizers get Move indoor / Change time / Keep as planned / Ask the group (which posts a normal chat poll); everyone else gets Forecast, i.e. the existing `GameWeatherDialog`.
- **Home & Find cards** — the `weatherRisk` enrichment (`{ severity, pop, windKph, at, keptAsPlanned? }`) for outdoor games within 48 h over the threshold, rendered as a pill ([home-and-find.md](./home-and-find.md)).
- **Calendar day cells** — unchanged. Day weather there is the pre-existing preview, not this.

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /games/:id/weather-alert` | `canAccessGame` | current severity + keep-as-planned state for the banner |
| `POST /games/:id/weather-alert/keep` | `canEditGame` | records "Keep as planned"; suppresses the second alert |
| `GET /games/:id/indoor-alternatives` | `canEditGame` | the club's active indoor courts (matching the game's sport, or sport-agnostic), each marked free or busy for the game window |

`GET /games/:id/weather` (the plain forecast) is unrelated and unchanged. Socket: `game-weather-alert-updated` → `{ gameId, severity }` in room `game-${gameId}`.

**Applying a move is not done by `indoor-alternatives`.** The frontend calls the existing edit path (`saveLocationTime` → `PUT /games/:id` + `POST /game-courts/game/:id`), which is the only place that validates a court against a game's club and sport. Availability and the external-booking caveat: [booking.md](./booking.md). Notification copy, actions and the `wx:` Telegram callback: [notifications.md](./notifications.md).

Code: `Backend/src/services/weather/` (`weatherRisk.ts`, `weatherAlert.service.ts`, `weatherAlertCopy.ts`), `Frontend/src/features/weather-alerts/`.
