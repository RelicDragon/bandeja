# Fix: i18n, copy, integration

Closes the findings in `critic-i18n-integration.md` for PRDs 345–357 on `feat/prd-345-357`.

Nothing here was type-checked, linted or test-run by me (heavy commands are the orchestrator's).
Two changes need to land in files another agent owns — the exact diffs are in
[§ Diffs for the orchestrator](#diffs-for-the-orchestrator) and are **not** applied.

---

## BLOCKER 1 — enrichment merge dropped six of nine fields

**Was wrong.** `Frontend/src/utils/attachAvailableGamesEnrichment.ts` declared a hand-written
`AvailableEnrichmentFields = { userNote | weatherSummary | reactions }` and spread exactly those
three. The backend returns nine. Both list queries send `format: 'card'`, so inline enrichment is
skipped and the card projection carries none of the six either — this endpoint is the only source.
PRDs 345, 346, 347, 348, 349, 357 rendered nothing on Find and Home-upcoming.

**Fix — the type now *is* the contract, not a copy of it.**

- `Frontend/src/types/gameCardEnrichment.ts` gains `GameCardEnrichment` (the nine fields),
  `GAME_CARD_ENRICHMENT_KEYS` (runtime mirror, `as const satisfies readonly (keyof …)[]`) and
  `AllEnrichmentKeysListed`, an `AssertNever<Exclude<keyof GameCardEnrichment, …>>` that fails to
  compile **naming the field you forgot** if the array falls behind the interface.
- `Game` now `extends GameCardEnrichment` (`Frontend/src/types/index.ts`); the six duplicated
  field declarations were deleted, so `Game`, the wire contract and the merge cannot drift.
- `mergeEnrichmentOntoGames` walks `GAME_CARD_ENRICHMENT_KEYS` instead of naming fields. It now
  also returns the *same* game object when a patch carries no defined key (previously any present
  patch allocated a new object and defeated the memo fast path for free).
- Backend symmetry: `Backend/src/services/game/availableGamesEnrichment.ts` gains
  `AllEnrichFieldsEmitted`, the same compile-time proof that `ENRICH_FIELD_KEYS` plus the three
  unconditional fields cover `keyof AvailableGameEnrichFields`.

**Consumers checked.** `useAvailableGamesQuery.ts:145,305` and
`useAvailableUpcomingGamesQuery.ts:76,113` are the only callers; both just pass games through.
`useAvailableGamesQuery.test.ts:397` exercises chunking only. No other module imports the type.

**Files:** `Frontend/src/types/gameCardEnrichment.ts`, `Frontend/src/types/index.ts`,
`Frontend/src/utils/attachAvailableGamesEnrichment.ts`,
`Backend/src/services/game/availableGamesEnrichment.ts`.

**Tests:** `Frontend/src/utils/attachAvailableGamesEnrichment.test.ts` — a `Required<GameCardEnrichment>`
fixture (so a tenth field is a *type error* in the test) merged onto a bare game, then asserted
field-by-field over `GAME_CARD_ENRICHMENT_KEYS`; plus a case for "absent key = no change,
`null` = explicitly nothing, empty patch = same array reference".

---

## BLOCKER 2 — the memoised card never repainted

**Was wrong.** `buildGameRenderSignature` (`Frontend/src/utils/gameCardPropsEqual.ts`) omitted
`seriesLabel`, `weatherRisk`, `spotOpenedAt`/`lastSeatOpenedAt`, `attendanceSummary`,
`perHeadPrice`, `liveSummary`, `eventKind` and `weatherSummary.isDay`. Enrichment produces a new
game object, so `a.game === b.game` never fires, the signature compared equal and `GameCard` never
re-rendered — which would have hidden the BLOCKER 1 fix.

**Fix.** Added a documented block of small key builders, each covering exactly what the card and
its children read, verified against the render sites:

| Field | Render site |
|---|---|
| `eventKind` | `GameCardHeaderTags.tsx:66`, `EventPosterCard` via the outer `GameCard` memo |
| `seriesLabel` (`seriesId:cadence:name:endedAt`) | `GameCardHeaderTags.tsx:72-81`, `hasTagRow` in `GameCard.tsx:330` |
| `spotOpenedAt` + `lastSeatOpenedAt` | `resolveSpotOpenedAt` → `GameCardHeaderTags.tsx:93`, `GameCard.tsx:322,334`, join-button shimmer |
| `weatherRisk` (`severity:pop:windKph:at:kept`) | `WeatherRiskPill.tsx:75-87`, `hasTagRow` via `shouldShowWeatherPill` |
| `perHeadPrice` (all five numbers) | `GameCardInfoRows.tsx:156` → `GameCardPerHeadPrice.tsx:50-59` (`totalCents`/`payerCount` are in the accessible name) |
| `attendanceSummary` (counts + viewer + entries) | `GameCard.tsx:164-180` `attendanceRail` memo → `GameCardRightRail` |
| `weatherSummary.isDay` | `rightRailPropsEqual` already compared it (`GameCardRightRail.tsx:157`) — the parent did not, which was an outright inconsistency |
| `liveSummary` | not rendered by `GameCard` today; included deliberately so the contract stays whole (bounded at two sides, so it is O(1)) |

Cost: the signature is built **once per immutable game object** (`signatureCache` WeakMap), and
every addition is a scalar join except `attendanceSummary.entries` (roster-sized) and
`liveSummary.sides` (exactly two). `resultsStatus` was already present and was not duplicated.

**Files:** `Frontend/src/utils/gameCardPropsEqual.ts`.

**Tests:** `Frontend/src/utils/gameCardPropsEqual.test.ts` — a `Record<GameCardEnrichmentKey, [before, after]>`
table (adding a contract field without a case is a type error), one `it.each` over
`GAME_CARD_ENRICHMENT_KEYS` asserting the comparator returns `false`, an `eventKind` case, and a
negative case proving an unchanged enriched game still compares equal.

---

## BLOCKER 3 — Arabic recap rendered in English

**Was wrong.** i18next asks `Intl.PluralRules` for the category of the real count and appends it
verbatim. A missing category does not degrade — the key does not resolve, i18next falls through to
`en` and recomputes the suffix *for English*. `ar/recap.json` declared only `_one`/`_other`, so
every Arabic count from 2 to 99 rendered the English string.

**Fix — full CLDR coverage, and a test that makes the class of defect impossible.**

- `ar`: added `_zero`, `_two`, `_few`, `_many` to all 17 `recap` families (68 keys) using the real
  Arabic counting rules — 3–10 takes the broken plural (`مباريات`), 11–99 the accusative singular
  (`مباراةً`), 0/100+ the singular; `_two` follows the file's own `_one` convention of putting the
  numeral in parentheses after the dual. Also `weatherAlerts.courtsOutdoor` (`_zero`, `_two`),
  `pairs.gamesCount` / `pairs.floorHint` (`_zero`), and four `referral` families (`_zero`).
- `cs`: added `_many` (the **fractional** category, genitive singular) to 23 families across
  `clubPage`, `recap`, `shop` — reachable today via `clubPage.today.freeHours`.
- `es`: added `_many` (exact millions, the `de`-form) to 32 families. Unreachable in practice, but
  the same defect mechanism and the new assertion below requires it.
- `sr`: **removed** 17 dead `_many` keys from `sr/recap.json`. Serbian resolves `one/few/other`
  only, so those were never selected — every one was byte-identical to its `_other`.
- `ru`, `hi`, `zh`, `id`, `th`, `ja`: already complete; verified, not touched.

**Test:** `Frontend/src/i18n/localeParity.test.ts` gains three assertions the old test structurally
could not make:

1. every locale declares **every** category `Intl.PluralRules` reports for it (`sr` resolved as
   `sr-Latn`), per family, across all 30 covered namespaces;
2. no locale declares a category its grammar never selects (this is what caught the dead `sr`
   `_many` keys);
3. English declares `_one` **and** `_other` for every family — the floor that lets the MAJOR below
   stay fixed.

---

## MAJOR — bare `sr` handed to `Intl` (Cyrillic in a Latin UI)

**Fix.** `resolveLocale()` was correct and used nowhere outside the file that defined it. Promoted
to `Frontend/src/utils/intlLocale.ts` as `resolveIntlLocale()`, which also handles region tags
(`sr-RS` → `sr-Latn-RS`) and respects an explicit script (`sr-Cyrl` is left alone).

Now used by every `Intl` construction in the new code:

| File | Was |
|---|---|
| `features/game-series/seriesFormat.ts:36` | `resolveLocale` is now a re-export of the shared util |
| `features/game-series/SeriesRepeatRow.tsx:76` | inline `locale === 'sr' ? 'sr-Latn' : locale` |
| `features/recap/recapFormat.ts:38-52` | bare `locale` for month names, numbers, percent, level |
| `components/wallet/WalletOwedSections.tsx:37` | bare `locale` for the owed-row date |
| `components/clubPage/clubTodayStripFormat.ts:20` | bare `locale` for `RelativeTimeFormat` |
| `features/weather-alerts/weatherRiskDisplay.ts:49` | `safeLocale` now delegates, so it resolves `sr` too |

**Tests:** `Frontend/src/utils/intlLocale.test.ts` — tag mapping, script preservation, empty-tag
fallback, and a live check that `sr` produces no Cyrillic for month names and relative time *while
asserting the bare tag does*. Plus a Serbian case in the new `clubTodayStripFormat.test.ts`.

**Not fixed (pre-existing, outside PRD 345–357), recommended:**
`Frontend/src/utils/displayPreferences.ts:159` maps `sr → sr-RS`, which `Intl` also resolves to
Cyrillic — that is the app-wide date path (game cards, calendar), so every Serbian user sees
Cyrillic months today. One-line fix (`'sr': 'sr-Latn-RS'`) but a broad blast radius; deliberately
left out of this change. Same root: `Backend/src/utils/translations.ts:3` imports
`date-fns/locale/sr` (Cyrillic).

---

## MAJOR — counted English strings with no plural family

- **`recap.slides.outro.caption`** ("{{games}} games · {{wins}} wins"). Two counted nouns cannot
  share one i18next family. Split into `outro.gamesPart` and `outro.winsPart` (own families) with
  `caption` reduced to the joiner `"{{games}} · {{wins}}"`.
  The new parts were **derived** from the already-translated, fully-pluralised
  `recap.profile.gamesOnly` and `recap.slides.wins.caption` in each locale, with `{{count}}`
  rewritten to `{{count, number}}` so the numeral keeps the `Intl` formatting the old
  `formatters.number()` call supplied — no locale received a fresh, unreviewed sentence.
  Call site: `Frontend/src/components/stories/slides/RecapStorySlide.tsx:406-411`.
  `caption` is now identical in all 11 locales (it contains no words), so it is the single entry in
  `PARITY_IDENTICAL_ALLOWLIST` with the reason written above it.
- **`series.confirmedOf`** ("{{confirmed}} of {{total}} regulars confirmed"). `{{total}}` renamed
  to `{{count}}` and given a full family in all 11 locales. Call sites updated:
  `features/game-series/SeriesOrganizerStrip.tsx:110`, `pages/SeriesPage.tsx:284,351`.
- **`cost.toast.reminded`** ("Reminder sent · {{players}} players"). Caller lives in
  `GameCostCard.tsx`, which another agent owns — **diff below, not applied.** Applying only the
  JSON half would break the key outright (no `count` ⇒ no suffix ⇒ raw key rendered), so both
  halves must land together.

## MAJOR — `series.capReached` interpolated a count into a frozen genitive

Now a real plural family in all 11 locales, with the categories each grammar requires
(`ru` one/few/many/other, `cs` + fractional `many`, `sr` one/few/other, `ar` all six, `es` + `many`,
`hi` one/other, `zh`/`id`/`th`/`ja` other). Both call sites already passed `count`, so no code
change was needed. Russian now reads "У вас 3 активные серии", Czech "3 aktivní série".

## MAJOR — `clubPage.today.windowHint` hard-coded a 24-hour clock

`:00` removed from the copy in all 11 locales; the hours are formatted by a new
`formatOpeningHour(hour, locale, hour12)` in `components/clubPage/clubTodayStripFormat.ts` and fed
from `resolveDisplaySettings(user)` in `ClubTodayStrip.tsx`, so it follows the viewer's own 12/24
preference like every other time in the app. 24-hour output is zero-padded (`22:00`, `00:00`),
12-hour is not (`7:00 AM`); hour `24` rolls to midnight and out-of-range input clamps.

**Tests:** `Frontend/src/components/clubPage/clubTodayStripFormat.test.ts` (new) covers both clock
shapes, the rollover, and that no locale gets a bare hour number.

**Related, not fixed:** `WeatherRiskPill` is rendered from `GameCardHeaderTags` without `hour12`,
so the risk-pill tooltip time uses the locale default rather than the viewer's preference. Same
class of issue, different component, and `GameCardHeaderTags` has no access to display settings —
flagged rather than reworked.

## MAJOR — recap **card** PNG had no RTL guard

`Backend/src/services/recap/recapSlideImage.renderer.ts`: the card block is `text-anchor="start"`
at `x=80` with `letter-spacing` on the title — in Arabic that hugs the wrong edge and the tracking
disconnects the cursive joins. Now mirrors like its sibling slide export: `text-anchor="end"` at
`WIDTH - 80`, `direction="rtl"`, and `letter-spacing="0"` on the localized title. `BANDEJA` is
Latin in every locale so it keeps its tracking and only moves to the same edge.

The SVG builder was extracted as `buildRecapSummaryCardSvg()` (pure) with
`renderRecapSummaryCard()` reduced to the `sharp` call, so this is testable without rendering.

**Tests:** `Backend/src/services/recap/recapSlideImage.renderer.test.ts` (new) — LTR anchoring and
tracking, RTL anchoring/direction/zero tracking, and the wordmark.

## MAJOR — register drift

The rule applied: **match how the rest of the app addresses the user**, measured against the
non-programme namespaces of the same locale.

- **`ru`** is formal by an overwhelming margin (686 formal pronoun/possessive tokens vs 6 informal,
  all six in new or pre-existing outlier files). Converted `ru/referral.json` (`твоей` → `вашей`)
  and `ru/recap.json` (`твой уровень`, `тебя ждёт`, `твои итоги`, `Выбери`, `Твой месяц`) to formal.
- **`sr`**: the legacy bundle uses formal pronouns and possessives (`Vi`, `Vaš`) everywhere, while
  the new namespaces went informal. Converted 54 strings across `attendance`, `live`, `onboarding`,
  `recap`, `referral`, `series`, `shop` to formal address. **Bare imperative button labels were
  left alone on purpose** — `Otkaži`, `Nastavi`, `Podeli`, `Pokušaj ponovo` are the established
  house style in the pre-existing bundle (7–9 occurrences each), so changing them would have been
  churn against the app's own convention; imperatives *inside* a sentence that also carries formal
  address were changed so the sentence agrees with itself.
- Zero informal pronoun/possessive tokens remain in the 12 programme namespaces for either locale.

## MAJOR — Admin Platform Settings missing the PRD 351 rows

Added a **Referral Rewards** section (`Admin/index.html`, after the PRD 348 Cost Split card) with
active-value readouts and inputs for `REFERRAL_REWARD_REFERRER` / `REFERRAL_REWARD_REFERRED`, and
`loadReferralRewardSettings` / `saveReferralRewards` / `updateReferralRewardsSaveButton` in
`Admin/platform-settings.js`, wired into `loadPlatformSettingsPage()` and exported on `window`.
Blank clears the row and falls back to `REFERRAL_DEFAULT_*`; only whole non-negative numbers are
accepted; only changed keys are PUT.

**Bug found while doing it (not in the critic's report, PRD 348, MAJOR):**
`GET /admin/platform-settings` answers `{ settings, knownKeys }`, not a bare array
(`admin.controller.ts:524-539`), but `loadCoinsPerCurrencyUnitSetting` did
`(response.data || []).find(…)` — a `TypeError` on every load, surfacing to the operator as
"Failed to load". **The Cost Split card has never worked.** Fixed with a shared
`platformSettingRows(response)` accessor (tolerant of both shapes) used by both sections.

---

## MINORs fixed

- **`series.regularWinRate` / `regularAttendance` hard-coded `%`.** The only percentage in the
  programme bypassing `Intl`, with per-locale spacing left to eleven guesses. `%` stripped from all
  11 locales; `SeriesPage.tsx` now formats through a new shared `Frontend/src/utils/intlPercent.ts`
  (`formatIntlPercent`), which `weatherRiskDisplay.formatPercent` now re-exports instead of
  reimplementing. Arabic gets `٧٠٪`-shaped output with its isolation marks like everywhere else.
- **Arabic bot back arrow.** `Backend/src/services/live/liveCopy.ts:274` `'← رجوع'` → `'→ رجوع'`
  (after bidi reordering a `←` sits at the visual right and reads as "forward").
- **`$`-injectable `String.replace` with user-controlled names.**
  `Backend/src/services/gameCost/costReminderCopy.ts` now interpolates through a global regex with
  a **function** replacement, so `$&` / `` $` `` / `$'` / `$$` in a player or game name are literal
  and a repeated placeholder is no longer silently dropped. Test:
  `Backend/src/services/gameCost/costReminderCopy.test.ts` (new). The other new backend copy
  modules were checked — `liveT` already uses `split`/`join`, and the rest carry no user input.
- **`/shop` and `/series/:id` broken shell with the flag off.** `Frontend/src/App.tsx` now sends the
  user home instead of rendering an empty content area inside the app chrome (§7.7).
- **`getOwed` missing `assertEnabled()`.** `Backend/src/controllers/gameCost.controller.ts:153` —
  the one cost handler answering with the flag off; now follows the 404 convention of the other five.
- **`SeriesPage.refresh()` did not invalidate `series.mine`.** Ending / renaming / re-rostering a
  series left a stale cadence chip on Create Game for up to 30 s. One extra invalidation.
- **`PairSheet.ensurePairTeam` did not invalidate the pair detail.** The cached `teamId === null`
  made a reopened sheet re-run the create path and send a duplicate invite. Now invalidated.
- **`hi` MT tell in `shop.previewRosterHint`.** `"शनिवार शाम 18:00 बजे"` paired "evening" with a
  24-hour reading; now `"शनिवार शाम 6 बजे"`.

## Filed findings I judged **not** defects

- **MINOR "decorative plural families whose `_one` and `_other` are identical"**
  (`en/spots.json` `queue.position`, `settings.queueCount`, `en/live.json` `started`).
  English genuinely has no distinction in those sentences ("#3 of 1" / "1 in queue" /
  "Started 1 min ago" are all correct), and the family is *required* — it is what lets `ru`, `cs`,
  `sr` and `ar` decline. Removing it would reintroduce BLOCKER 3 for those locales. The `#` vs `№`
  vs `n.º` observation is an English-source style choice, not an error; every locale used its own
  ordinal marker correctly. **Left as-is.**
- **MINOR "count-neutral `Label: {{count}}` copy in `series`."** CONTRACT §8.3 explicitly
  grandfathers `series`/`attendance`/`cost` here, and the critic files it as known debt itself.
  Rewriting `scopeLockedNote` and friends into verb-first sentences is a copy decision across 11
  locales with no correctness gain. **Left as-is, still debt.**
- **MINOR "hard-coded sample clock in `shop.previewRosterHint`."** Only the `hi` string was
  actually wrong (fixed above). The rest is *mock* content inside a preview card next to a
  hard-coded `4.0` rating — there is no datum being mis-formatted, and routing it through `Intl`
  would mean inventing a fake `Date` and threading display settings into a preview. **Left as-is.**
- **MINOR "feature flags: `Backend/src/config/env.ts` accepts only `'false'` while the frontend
  accepts `0`/`false`/`off`."** The critic's own note says the backend is contract-correct (§7.7
  specifies `!== 'false'`) and `Backend/env.sample` documents `=false`. Tightening the frontend to
  match would *break* any operator already using `VITE_*=0`, which is the documented-permissive
  behaviour in `featureFlags.ts`'s own docblock. The real hazard — a link landing on a flagged-off
  page — is fixed above. **Asymmetry left, deliberately.**
- **MINOR "three dead API surfaces"** (`shopApi.getItem`, `referralApi.getGameInviteLink`, the
  matching `queryKeys` entries and two backend routes). Real dead weight, but the frontend half
  lives in `src/api/shop.ts` / `ShopPage`-adjacent code that a UX agent is mid-edit in, and
  deleting backend routes is not an i18n/integration fix. **Not touched — recommend a follow-up.**
- **MINOR "`live.startedMinutesAgo` uses the Arabic singular `دقيقة` for 3–10."** Genuinely
  ungrammatical, but the backend copy layer (`liveT`) has no plural machinery at all, and CONTRACT
  §8.3 forbids rewording to dodge pluralization — so the honest fix is to add `Intl.PluralRules`
  selection to `liveT` plus per-language variants for that key, which is a feature-sized change to
  a Telegram surface. **Not fixed; recommend a follow-up** (note that 11–99 is already correct —
  only 3–10 needs `دقائق`).
- **UNVERIFIED "does `series.controller.ts` sit on a mounted router?"** — **it does.**
  `routes/index.ts:115` mounts `gameSeries.routes.ts` and `:169` mounts `series.routes.ts`; both
  import `../controllers/series.controller`, whose `:17` side-effect import registers
  `gameSeriesCardEnricher`. The series pill had exactly one reason to be missing (BLOCKER 1).
- **MINOR "duplicated formatting concepts."** Partly closed: one locale resolver
  (`utils/intlLocale.ts`) and one percentage formatter (`utils/intlPercent.ts`) now serve the new
  code. `features/attendance/attendanceVisuals.ts:93` still has its own `formatPercent` — that
  directory is owned by another agent right now; diff below. The four money formatters are a
  pre-existing split across two runtimes and out of scope here.

---

## Diffs for the orchestrator

These touch files owned by other agents and are **not applied**.

### 1. `cost.toast.reminded` — plural family (must land as one change)

`Frontend/src/components/GameDetails/cost/GameCostCard.tsx:257`

```diff
-        toast.success(t('cost.toast.reminded', { players: result.sent }));
+        toast.success(t('cost.toast.reminded', { count: result.sent }));
```

`Frontend/src/i18n/locales/<locale>/cost.json` → replace `cost.toast.reminded` with a family
(`{{players}}` → `{{count}}`; categories per locale as enforced by `localeParity.test.ts`):

| locale | forms |
|---|---|
| `en` | `_one` `Reminder sent · {{count}} player` / `_other` `Reminder sent · {{count}} players` |
| `ru` | `_one` `Напоминание отправлено · игроков: {{count}}` — the existing `игроков: {{count}}` shape is already count-neutral, so `_one`/`_few`/`_many`/`_other` may all carry it |
| `sr` | `_one`/`_few`/`_other` `Podsetnik poslat · igrača: {{count}}` |
| `es` | `_one` `Recordatorio enviado · {{count}} jugador` / `_many` `… {{count}} de jugadores` / `_other` `… {{count}} jugadores` |
| `cs` | `_one`/`_few`/`_many`/`_other` `Připomenutí odesláno · hráčů: {{count}}` |
| `ar` | all six; `_few` `أُرسل التذكير · {{count}} لاعبين`, the rest `… {{count}} لاعب` / `_many` `… {{count}} لاعبًا` |
| `zh`, `id`, `th`, `ja` | `_other` only, current text with `{{count}}` |
| `hi` | `_one` `याद दिलाया गया · {{count}} खिलाड़ी` / `_other` same |

### 2. `sr` Cyrillic in the attendance sparkline

`Frontend/src/features/attendance/AttendanceStatisticsSection.tsx`

```diff
 import { ShowsUpTile } from './ShowsUpTile';
 import { shouldShowAttendanceRate } from './attendanceVisuals';
+import { resolveIntlLocale } from '@/utils/intlLocale';
@@
-    return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(year, month - 1, 1));
+    // `sr` in this app is Serbian Latin; a bare tag gives Cyrillic month names.
+    return new Intl.DateTimeFormat(resolveIntlLocale(locale), { month: 'short' }).format(
+      new Date(year, month - 1, 1),
+    );
```

### 3. Optional — drop the third `formatPercent`

`Frontend/src/features/attendance/attendanceVisuals.ts:93` can become a re-export, which also gives
it the `sr` fix for free:

```diff
-export function formatPercent(rate: number, locale: string): string {
-  …
-}
+/** Single implementation lives in `@/utils/intlPercent` (it also resolves `sr`). */
+export { formatIntlPercent as formatPercent } from '@/utils/intlPercent';
```

`attendanceVisuals.test.ts:106-107` (`toContain('75')`, and `'not-a-locale'` falling back) both
still hold.

---

## Files touched

**Frontend — new:** `src/utils/intlLocale.ts`, `src/utils/intlLocale.test.ts`,
`src/utils/intlPercent.ts`, `src/components/clubPage/clubTodayStripFormat.test.ts`.

**Frontend — changed:** `src/types/gameCardEnrichment.ts`, `src/types/index.ts`,
`src/utils/attachAvailableGamesEnrichment.ts` (+ test), `src/utils/gameCardPropsEqual.ts` (+ test),
`src/i18n/localeParity.test.ts`, `src/App.tsx`, `src/pages/SeriesPage.tsx`,
`src/components/clubPage/ClubTodayStrip.tsx`, `src/components/clubPage/clubTodayStripFormat.ts`,
`src/components/wallet/WalletOwedSections.tsx`, `src/components/pairs/PairSheet.tsx`,
`src/components/stories/slides/RecapStorySlide.tsx`, `src/features/recap/recapFormat.ts`,
`src/features/game-series/seriesFormat.ts`, `src/features/game-series/SeriesRepeatRow.tsx`,
`src/features/game-series/SeriesOrganizerStrip.tsx`,
`src/features/weather-alerts/weatherRiskDisplay.ts`.

**Frontend — locales:** `ar/{recap,weatherAlerts,pairs,referral,series}.json`,
`cs/{clubPage,shop,recap,series}.json`, `es/{clubPage,live,onboarding,pairs,recap,shop,spots,weatherAlerts,series}.json`,
`sr/{recap,attendance,live,onboarding,referral,series,shop,clubPage}.json`,
`ru/{referral,recap,series}.json`, `hi/{shop,series,recap,clubPage}.json`, and
`{en,zh,id,th,ja}/{series,recap,clubPage}.json` for the `confirmedOf` / `capReached` /
`outro` / `windowHint` / `regularWinRate` changes.

**Backend — new:** `src/services/recap/recapSlideImage.renderer.test.ts`,
`src/services/gameCost/costReminderCopy.test.ts`.

**Backend — changed:** `src/services/game/availableGamesEnrichment.ts`,
`src/services/recap/recapSlideImage.renderer.ts`, `src/services/gameCost/costReminderCopy.ts`,
`src/services/live/liveCopy.ts`, `src/controllers/gameCost.controller.ts`.

**Admin:** `index.html`, `platform-settings.js`.
