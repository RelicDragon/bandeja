# Critic: i18n, copy, integration

Scope: PRDs 345–357 on `feat/prd-345-357`. Standard: `docs/plans/prd-345-357/CONTRACT.md` §7.1 (copy), §7.7 (flags), §8 (i18n), §9 (Admin). Automated floor: `Frontend/src/i18n/localeParity.test.ts`.

## Verdict

**i18n and copy.** The translation work is, key-for-key, unusually good: all 12 namespaces exist in all 11 locales with real, idiomatic translations, no Latin-script leakage into `ru`/`ar`/`ja`/`zh`/`th`/`hi`, no schema jargon in any user-facing value, no hard-coded English attributes or toasts in the new components, clean logical-property (RTL) discipline throughout the new component tree, and Intl used correctly for percentages, wind, currency, relative time and most dates. But the parity test only enforces *presence of `_other`*, and three classes of defect slipped straight through it. One is a BLOCKER: **the entire Arabic `recap` namespace declares only `_one`/`_other`, so an Arabic user whose recap covers 2–99 games, wins, weeks or slides sees the slide captions in English** — i18next resolves `_few` in `ar`, misses, falls through to `en`, and finds `_other` there. Second, `sr` is passed to `Intl` as the bare tag in four new modules, so a Serbian-Latin user gets Cyrillic month names and relative times — `resolveLocale()` was written for exactly this and then not used outside the file that defines it. Third, a handful of counted English strings carry no plural family at all and will render "1 players", "1 games · 1 wins", "1 of 1 regulars confirmed" in English itself, plus `series.capReached` interpolates a count into a declined noun phrase in `ru`/`cs`/`sr`/`ar`. Copy register also drifts inside single locales (`sr` mixes *ti* and *Vi*; `ru/referral.json` mixes *ты* and *Вы* in one file) — the visible fingerprint of twelve agents translating in parallel with no shared style sheet.

**Integration.** The seams held far better than expected. Every socket event is wired emitter→listener with matching kebab-case strings; every new `NotificationType` has a producer, a pref mapping and a default; all 13 routers are mounted; all three schedulers are started and stopped; the Telegram callback regex now covers all twelve implemented prefixes including the previously-missing `uti:`/`sip:`; the backend/frontend enrichment *type* mirrors agree field for field; `hasTagRow` lists every tag `GameCardHeaderTags` can render; `rightRailPropsEqual` compares every prop; all four Admin Goods/Referrals edits landed; docs coverage is complete. What did not hold is the data path itself. **Six PRDs' card surfaces never render on Find or Home-upcoming**: the backend emits `spotOpenedAt`, `liveSummary`, `weatherRisk`, `perHeadPrice`, `seriesLabel` and `attendanceSummary` from `/games/available/enrichment`, and `mergeEnrichmentOntoGames` — a file nobody in the programme owned — copies exactly three keys and silently drops the other six. Compounding it, `buildGameRenderSignature` omits all six of those fields plus `eventKind`, so even once the merge is fixed the memoized card will not repaint when they arrive. These two defects are the single highest-value thing in this report; between them they make 345, 346, 347, 348, 349 and 357 invisible on the list screens no matter how correct the rest of each feature is.

---

## Findings

### [BLOCKER] integration — the available-games enrichment merge drops six of nine fields

- **Where:** `Frontend/src/utils/attachAvailableGamesEnrichment.ts:15-19` and `:30-35`; backend counterpart `Backend/src/services/game/availableGamesEnrichment.ts:182-189`
- **Defect:** `AvailableEnrichmentFields` declares only `userNote | weatherSummary | reactions` and `mergeEnrichmentOntoGames` spreads only those three, while the backend `ENRICH_FIELD_KEYS` returns nine — the six new ones (`spotOpenedAt`, `liveSummary`, `weatherRisk`, `perHeadPrice`, `seriesLabel`, `attendanceSummary`) are fetched over the wire and thrown away.
- **Consequence:** This is the live path, not a fallback. `Frontend/src/queries/games/useAvailableGamesQuery.ts:72` and `useAvailableUpcomingGamesQuery.ts:34` both send `format: 'card'`; `Backend/src/services/game/availableGamesProtocol.ts:28` therefore resolves `enrich = false`, so `availableGamesQuery.ts:562` skips inline enrichment and `availableGamesCard.projection.ts` does not project any of the six either (grep for `seriesLabel|perHeadPrice|attendanceSummary|spotOpenedAt|liveSummary|weatherRisk` in that file returns one comment and no fields). The deferred endpoint is the *only* source. Net result: the series pill (345), attendance rail (346), spot-opened pill (347), per-head price row (348), live summary (349) and weather-risk pill (357) never appear on Find or Home-upcoming. Six PRDs' card surfaces are dead.
- **Standard violated:** CONTRACT §13 "Every User Story … satisfied by working code, not a stub"; §7.6 data layer.

### [BLOCKER] i18n — Arabic `recap` has no `_few`/`_many`/`_two`, so Arabic users see English recap captions

- **Where:** `Frontend/src/i18n/locales/ar/recap.json` — all 17 plural families (`slides.games.caption`, `slides.wins.caption`, `slides.streak.caption`, `slides.partner.caption`, `slides.club.caption`, all their `alt` twins, `share.cta`, `share.previewLabel`, `profile.gamesOnly`, `profile.gamesAndWinRate`) declare only `_one` and `_other`.
- **Defect:** Arabic CLDR routes count 2→`_two`, 3–10→`_few`, 11–99→`_many`. None of those keys exist. i18next 26 (`node_modules/i18next/dist/cjs/i18next.js:822-860`) builds `finalKeys = [key, key + '_few']` for `code='ar'`, finds neither, then moves to the next code in `languages` — `en` — recomputes the suffix *for English* (`_other`) and resolves `recap.slides.games.caption_other` = `"{{count}} games played"`.
- **Consequence:** An Arabic user's monthly recap renders **in English** for every realistic count. A recap with 7 games shows "7 games played" in Latin script mid-RTL story slide; only `count === 1` (and ≥100 / fractions) hit the Arabic strings. Same mechanism shipped as `weatherAlerts.courtsOutdoor` in `ar`, which has `_few`/`_many`/`_one`/`_other` but no `_two` — "2 of 4 courts are outdoor" falls back to English.
- **Standard violated:** CONTRACT §8.3 ("Arabic can use `_zero`, `_two`, `_few`, `_many`" — here it must, because the `_other` it does define is the >99/fraction form, not a catch-all); §13 "All copy is in all 11 locales".
- **Why the parity test missed it:** `localeParity.test.ts:141-146` (`pluralFamiliesMissingOther`) only asserts `_other` exists. It has no per-locale required-category table, so `ar` with two forms is indistinguishable from `ja` with one.

### [BLOCKER] integration — `buildGameRenderSignature` omits every field the six new card surfaces render

- **Where:** `Frontend/src/utils/gameCardPropsEqual.ts:113-163` (note: `src/utils/`, not `src/components/gameCard/`), used as the memo comparator at `Frontend/src/components/GameCard.tsx:513,520`
- **Defect:** The 45-part signature does not include `seriesLabel`, `weatherRisk`, `spotOpenedAt`/`lastSeatOpenedAt`, `attendanceSummary`, `perHeadPrice`, `eventKind`, or `weatherSummary.isDay` — every one of which has a render site (`GameCardHeaderTags.tsx:66,72-81,93,148-152`, `GameCard.tsx:164-180,322`, `GameCardInfoRows.tsx:156-157`, `GameCardWeatherTag.tsx:42`).
- **Consequence:** Enrichment produces a **new** game object (`{...game, ...patch}`), so the `a.game === b.game` fast path at `gameCardPropsEqual:178` does not fire and the signature comparison runs; the signature is byte-identical, `gameCardPropsEqual` returns `true`, and the card never repaints. Every socket patch, refetch and enrichment merge that touches only these fields is silently swallowed. `rightRailPropsEqual` *does* compare `weatherSummary.isDay` (`GameCardRightRail.tsx:157`), which makes the omission in the parent an outright inconsistency. This hides the fix for the first BLOCKER: repair the merge and the cards still will not update.
- **Standard violated:** CONTRACT §13; the comparator's own contract (a memo comparator must enumerate every rendered field).

---

### [MAJOR] i18n — `sr` is passed to `Intl` as a bare tag, so Serbian-Latin users get Cyrillic

- **Where:** `Frontend/src/features/recap/recapFormat.ts:33,38,43`; `Frontend/src/features/attendance/AttendanceStatisticsSection.tsx:29`; `Frontend/src/components/wallet/WalletOwedSections.tsx:37`; `Frontend/src/components/clubPage/clubTodayStripFormat.ts:20`
- **Defect:** All four take `i18n.language`, which `Frontend/src/i18n/config.ts:68` sets to the bare two-letter code, and hand it straight to `Intl.DateTimeFormat` / `Intl.RelativeTimeFormat`. `Intl.DateTimeFormat('sr', {month:'long'})` → `септембар`; `Intl.RelativeTimeFormat('sr')` → `пре 5 минута`. The correct tag is `sr-Latn` (`ponedeljak`, `pre 5 minuta`).
- **Consequence:** In a UI whose every other string is Serbian Latin, recap headlines and captions ("`септембар 2026.`"), the attendance sparkline month labels, wallet owed-row dates and the club "Updated …" phrase render in Cyrillic. Mixed-script on one screen.
- **Aggravating:** `resolveLocale()` at `Frontend/src/features/game-series/seriesFormat.ts:36-40` was written for precisely this, with the comment "`sr` in this app is Serbian **Latin**; `Intl` needs the script tag to agree", and is exported — but no module outside `seriesFormat.ts` imports it. `Frontend/src/features/game-series/SeriesRepeatRow.tsx:76` re-implements it inline as `locale === 'sr' ? 'sr-Latn' : locale` instead. Units, percentages and currency are unaffected (`Intl.NumberFormat('sr', …)` is script-neutral for those), so the blast radius is exactly month names, weekday names and relative time.
- **Standard violated:** CONTRACT §8.1 ("`sr` is Serbian **Latin**").
- **Note (pre-existing, out of scope but same root):** `Backend/src/utils/translations.ts:3` imports `date-fns/locale/sr`, which is also Cyrillic; `Frontend/src/utils/displayPreferences.ts:159` maps `sr → sr-RS`, which `Intl` also resolves to Cyrillic.

### [MAJOR] i18n — counted English strings with no plural family render "1 players" / "1 games · 1 wins"

- **Where:**
  - `Frontend/src/i18n/locales/en/recap.json` → `recap.slides.outro.caption` = `"{{games}} games · {{wins}} wins"`, rendered at `Frontend/src/components/stories/slides/RecapStorySlide.tsx:406-409`
  - `Frontend/src/i18n/locales/en/cost.json` → `cost.toast.reminded` = `"Reminder sent · {{players}} players"`, rendered at `Frontend/src/components/GameDetails/cost/GameCostCard.tsx:181` with `players: result.sent`
  - `Frontend/src/i18n/locales/en/series.json` → `series.confirmedOf` = `"{{confirmed}} of {{total}} regulars confirmed"`
- **Defect:** Three counted sentences with no `_one`/`_other` family and no plural-safe rewording.
- **Consequence:** Nudging a single unpaid player toasts "Reminder sent · 1 players". A recap month with one win captions "5 games · 1 wins". A one-regular series reads "1 of 1 regulars confirmed". This is broken in **English**, before any translation question arises, and every one of the 11 locales inherits the same shape.
- **Standard violated:** CONTRACT §8.3 "Do **not** reword copy to dodge pluralization"; §7.1 plain copy.

### [MAJOR] i18n — `series.capReached` interpolates a count into a declined noun with no plural family

- **Where:** `Frontend/src/i18n/locales/{en,ru,cs,sr,es,ar,hi}/series.json` → `series.capReached`; call sites `Frontend/src/features/game-series/SeriesRepeatRow.tsx:108,114,178` and `SeriesRepeatSheet.tsx:440`, both passing `{ count: … }`.
- **Defect:** `ru` = `"У вас {{count}} активных серий. Завершите одну, чтобы добавить новую."` — the noun phrase is frozen in the genitive plural. `cs` = `"Máš {{count}} aktivních sérií…"`, `sr` = `"Imaš {{count}} aktivnih serija…"`, `ar` = `"لديك {{count}} سلاسل نشطة…"` — same shape. No `_one`/`_few`/`_many` anywhere in the family.
- **Consequence:** For the common cap values the grammar is simply wrong: Russian renders "У вас 3 активных серий" where the count-3 form is "3 активные серии"; Czech renders "3 aktivních sérií" where it should be "3 aktivní série". Unlike `series.regularGames` below, this one was *not* written count-neutral — it is a full sentence with an inflected noun, so it does not fall under the CONTRACT §8.3 grandfather clause for `series`/`attendance`/`cost`.
- **Standard violated:** CONTRACT §8.3 ("'3 games' must read naturally in Russian").

### [MAJOR] i18n — `clubPage.today.windowHint` hard-codes a 24-hour clock in all 11 locales

- **Where:** `Frontend/src/i18n/locales/*/clubPage.json` → `today.windowHint`; caller `Frontend/src/components/clubPage/ClubTodayStrip.tsx:106-109`, passing `availability.openHour` / `availability.closeHour`, typed `number` at `Frontend/src/api/clubPublic.ts:93-94`.
- **Defect:** Every locale bakes the format into the string: `en` `"Shown from {{open}}:00 to {{close}}:00"`, `ja` `"{{open}}:00 から {{close}}:00 まで表示"`, `ar` `"يُعرض من {{open}}:00 حتى {{close}}:00"`. The raw integer hour goes in unformatted.
- **Consequence:** An `en-US` user sees "Shown from 7:00 to 22:00" instead of 7 AM–10 PM; an Arabic user gets Western digits with no RTL isolation next to a colon, which bidi-reorders unpredictably. `Frontend/src/features/weather-alerts/weatherRiskDisplay.ts:82-99` (`formatClockTime`) already does this correctly with `Intl.DateTimeFormat`, so the app now formats clock times two different ways.
- **Standard violated:** CONTRACT §7.1 / §8; the brief's Intl requirement for hour formats.

### [MAJOR] i18n — recap **card** export has no RTL guard, while the sibling slide export does

- **Where:** `Backend/src/services/recap/recapSlideImage.renderer.ts:287-309` (card) vs `:203-219` (slide)
- **Defect:** `renderRecapSlideImage` explicitly handles RTL — `const eyebrowSpacing = isRecapRtlLanguage(language) ? 0 : 4;` at `:204`, with a comment explaining that letter-spacing pushes centred RTL text off-centre, and everything is `text-anchor="middle"`. `renderRecapCardImage` does none of it: every `<text>` is `x="80"` with the default `text-anchor="start"`, and `:290` applies `letter-spacing="6"` to `recapCopy(language,'summaryTitle').toUpperCase()` while `:308` applies `letter-spacing="8"`.
- **Consequence:** The `recap-card` PNG — the one that lands in a user's camera roll and gets reshared — left-aligns Arabic text, and SVG letter-spacing on Arabic breaks cursive glyph joining, rendering the title as disconnected letterforms. The share-to-followers slide is fine; the save-to-photos card is not.
- **Standard violated:** CONTRACT §8.1 (RTL), §13 ("RTL (`ar`) verified").

### [MAJOR] copy — formal/informal register drifts inside a single locale

- **Where:**
  - `sr`: `Frontend/src/i18n/locales/sr/spots.json:8-10` `"Vi ste {{position}}. od {{count}}"` and `sr/weatherAlerts.json:33` `"Vaša rezervacija … otkažite je"` (formal *Vi*) against `sr/shop.json:43` `"Dodato u tvoju kolekciju"`, `sr/onboarding.json:38` `"Tvoj nivo"`, `sr/series.json`, `sr/attendance.json`, `sr/referral.json`, `sr/recap.json` (informal *ti*, 34 occurrences across those files).
  - `ru`: `Frontend/src/i18n/locales/ru/referral.json:8` `"Сыграем в Bandeja — после **твоей** первой игры…"` against `:11` `"**Ваши** приглашения"` and `:23` `"**Вы** получите монеты после первой игры"` — both registers inside one file. `ru/recap.json` is uniformly informal (`:32` `"Сейчас твой уровень"`, `:104` `"Выбери слайды"`) while every other `ru` namespace in the programme is formal.
- **Defect:** No shared register decision; twelve agents each picked one.
- **Consequence:** A Serbian user is addressed formally by the queue panel and informally by the shop two taps later. The referral sheet switches pronoun between its own headline and its own body.
- **Standard violated:** CONTRACT §7.1 "plain, second person" — implicitly one second person.
- **Note:** the parity test cannot see this; it only compares against English, which has no T–V distinction.

### [MAJOR] integration — Admin Platform Settings is missing the PRD 351 referral reward rows

- **Where:** `Admin/index.html` Platform Settings page (sections at `:702` "Game Results Artifacts" and `:731-749` PRD 348 "Cost Split") — `grep -rn REFERRAL_REWARD Admin/` returns nothing.
- **Defect:** `Backend/src/services/platformSetting.service.ts:20-22` defines `REFERRAL_REWARD_REFERRER` / `REFERRAL_REWARD_REFERRED` as admin-tunable and `Backend/src/services/referral/referral.service.ts:78,82` reads them, but no input, loader or `window.` export was added on the Admin side.
- **Consequence:** Referral payout amounts are pinned to the hard-coded `REFERRAL_DEFAULT_*` fallbacks; changing them requires hand-crafting a `PUT /admin/platform-settings/:key`.
- **Standard violated:** CONTRACT §9 ("new rows on **Platform Settings** (348, 351)").
- **Contrast:** Goods (355) and Referrals (351) *pages* landed all five §9 edits correctly (`index.html:59,754,2106` + `app.js:513`; `index.html:65,328,2115` + `app.js:532`).

---

### [MINOR] i18n — `series.regularWinRate` / `regularAttendance` hard-code `%` and bypass Intl

- **Where:** `Frontend/src/i18n/locales/*/series.json` → `regularWinRate` (`en` `"Wins: {{value}}%"`, `cs` `"Výher: {{value}} %"`, `ar` `"الفوز: {{value}}%"`), rendered at `Frontend/src/pages/SeriesPage.tsx:98,101` with `value: regular.winRate` — a plain `number` (`Frontend/src/api/series.ts:35-36`).
- **Defect:** The only percentage in the programme not formatted through `Intl.NumberFormat`. `pairFormat.ts:55-58`, `attendanceVisuals.ts:93-102`, `weatherRiskDisplay.ts:54-64` and `recapFormat.ts:45-48` all do it properly.
- **Consequence:** Arabic gets Western digits and no RLM isolation where every other percentage in the app gets `٧٠٪`-shaped output; the per-locale `%` spacing is left to eleven independent translator judgements (`cs` added the required space, the rest did not).

### [MINOR] i18n — decorative plural families whose `_one` and `_other` are identical

- **Where:** `Frontend/src/i18n/locales/en/spots.json` → `queue.position_one` == `queue.position_other` == `"You're #{{position}} of {{count}}"`, `settings.queueCount_one` == `_other` == `"{{count}} in queue"`; `Frontend/src/i18n/locales/en/live.json` → `started_one` == `started_other` == `"Started {{count}} min ago"`.
- **Defect:** The family exists only to satisfy the parity check; English carries no distinction.
- **Consequence:** Harmless at runtime (the non-English locales did translate the categories properly), but it signals the family was added mechanically rather than because the sentence needs it — and in `spots.queue.position` the English form uses `#` as an ordinal marker, which no other locale adopted (`ru` `№`, `es` `n.º`, `cs`/`sr` `{{position}}.`, `ja`/`zh`/`th` none). The translations are right; the English source is the outlier.

### [MINOR] i18n — count-neutral "Label: {{count}}" copy in `series`

- **Where:** `Frontend/src/i18n/locales/en/series.json` → `regularGames` `"Games: {{count}}"`, `regularsCount` `"Regulars: {{count}}"`, `scopeAppliedNote` `"Updated games: {{count}}"`, `keptGamesNote` `"Upcoming games kept because they already have results: {{count}}"`, `scopeLockedNote` `"Games that keep their current details because results already started: {{count}}"`.
- **Defect:** Exactly the "reworded to dodge pluralization" pattern §8.3 names, plus two label strings long enough to be sentences.
- **Consequence:** Grammatically safe but reads like a debug dump rather than product copy; `scopeLockedNote` is a 12-word noun phrase where §7.1 asks for a plain verb-first sentence. CONTRACT §8.3 explicitly grandfathers `series`/`attendance`/`cost` here ("Those three may be revisited"), so this is flagged as known debt, not a new violation.

### [MINOR] i18n — hard-coded sample clock in `shop.previewRosterHint`

- **Where:** `Frontend/src/i18n/locales/*/shop.json` → `previewRosterHint`, rendered at `Frontend/src/components/shop/ShopItemPreview.tsx:114`
- **Defect:** `en` `"Saturday at 18:00"` — weekday name and 24-hour clock baked into copy. It is mock content inside a preview card, so no real datum is being mis-formatted, but the `en-US` preview shows a 24-hour time the app never uses elsewhere.
- **MT tell in the same key:** `hi` = `"शनिवार शाम 18:00 बजे"` — pairs शाम ("evening") with a 24-hour reading; idiomatic Hindi is शाम 6 बजे. `sr` and `id` correctly switched the separator to `18.00`, which shows the others simply copied the English literal.

### [MINOR] i18n / Telegram — Arabic bot copy

- **Where:** `Backend/src/services/live/liveCopy.ts:274` `'play.back': '← رجوع'`; `:267` `'live.startedMinutesAgo': 'بدأت قبل {minutes} دقيقة'`
- **Defect:** (a) An LTR left-arrow prefixing an RTL label — after bidi reordering the glyph sits at the visual right of the button and still points left, which reads as "forward" in RTL. Should be `→`. All ten other locales correctly use `←`. (b) `دقيقة` is the singular; Arabic requires `دقائق` for 3–10. The backend copy layer has no plural machinery at all (`buildLiveMessage` → `liveT` → simple `{minutes}` substitution), so there is nowhere to express it.
- **Consequence:** Cosmetic on the arrow; mildly ungrammatical on the minute count. Contained to the `/play` and `/live` bot surfaces.

### [MINOR] integration — `String.prototype.replace` with user-controlled names is `$`-injectable

- **Where:** `Backend/src/services/gameCost/costReminderCopy.ts:122-125` (`.replace('{{name}}', input.payerName)`, `.replace('{{game}}', input.gameName)`); same pattern in the other backend copy modules.
- **Defect:** A string replacement argument interprets `$$`, `$&`, `` $` `` and `$'`. `payerName` and `gameName` are user-supplied. Also non-global, so a translation repeating a placeholder silently drops the second occurrence.
- **Consequence:** A player named `$&` makes the push body read "… to {{name}} for …". Low impact, trivially avoided with a function replacement.
- **Good, by contrast:** Telegram Markdown escaping is correct everywhere it matters. `escapeMarkdown` (`Backend/src/services/telegram/utils.ts:25-31`) is applied to every user-supplied name in `play.command.ts:319-321`, `notifications/game-series.notification.ts:27` and `notifications/game-weather-alert.notification.ts:29`, and `live.command.ts:38-40` correctly extends it with a backtick swap (`escapeMarkdown` does not cover `` ` ``, and the `/live` score blocks are code spans) — with the reasoning written down at `:29-37`. No unescaped-name path found.

### [MINOR] integration — duplicated formatting concepts across the new modules

- **Where:**
  - Three independent `formatPercent`: `Frontend/src/features/attendance/attendanceVisuals.ts:93`, `Frontend/src/features/weather-alerts/weatherRiskDisplay.ts:54`, `Backend/src/services/weather/weatherAlertCopy.ts:246` (plus inline ones in `pairFormat.ts:55` and `recapFormat.ts:45`).
  - Two locale resolvers: `seriesFormat.ts:36` `resolveLocale` vs inline `SeriesRepeatRow.tsx:76`; and two "safe locale" guards: `weatherRiskDisplay.ts:49` `safeLocale` vs `weatherAlertCopy.ts:241` `safeLocale` — neither of which resolves `sr`.
  - Four money formatters: `Frontend/src/features/cost/costMoney.ts:26`, pre-existing `Frontend/src/utils/currency.ts#formatPrice`, `Frontend/src/components/shop/shopFormat.ts:11`, `Backend/src/services/gameCost/costReminderCopy.ts:100`.
  - One number-formatting *style* outlier: `Frontend/src/i18n/locales/*/referral.json:41-48` is the only place in the entire bundle using i18next's `{{count, number}}` formatter; `shop` passes a pre-formatted `{{formatted}}`, `series` passes a raw number.
- **Consequence:** No runtime bug today, but the `sr` defect above is exactly what this shape produces — the one module that solved it could not propagate the fix, because four other modules reimplemented the same function.

### [MINOR] integration — feature flags: three residual gaps

- **Where:**
  - `Frontend/src/deepLinks/catalog.ts:61` (`shop: { id: 'shop', path: '/shop' }`) and `Frontend/src/App.tsx:824` / `:814` — the `/shop` and `/series/:id` routes are registered unconditionally, and with the flag off `ShopPage.tsx:58` / `SeriesPage.tsx:205` return `null`.
  - `Backend/src/config/env.ts:260,265,271` accept only the literal `'false'`; `Frontend/src/config/featureFlags.ts:13` accepts `0` / `false` / `off`.
  - `Backend/src/controllers/gameCost.controller.ts:154` (`getOwed`) is the one cost handler without `assertEnabled()`; the service returns an empty result (`gameCost.service.ts:695`) so it is safe, just inconsistent with the 404 convention used by the other five.
- **Defect / consequence:** (a) A push or deep link to `/shop` with `VITE_SHOP_ENABLED=0` lands the user on an empty content area inside the app chrome — the "broken shell" §7.7 forbids — rather than a redirect. In-app entry points are correctly gated (`WalletModal.tsx:182`, `CollectionSection.tsx:60`), so only links reach it. (b) An operator setting `SHOP_ENABLED=0` + `VITE_SHOP_ENABLED=0` disables the UI and leaves the backend serving the feature. `Backend/env.sample:278,281,284` documents `=false`, and §7.7 specifies `!== 'false'`, so the backend is contract-correct and the frontend is the permissive one — but the asymmetry is a live trap.
- **Otherwise clean:** every frontend reader gates the query via `enabled`, not just render (`useSeries.ts:26,43,55`, `useGameCostQuery.ts:26,35`, `ShopPage.tsx:39`, `CollectionSection.tsx:31`, `SeriesRepeatRow.tsx:58`, `WalletOwedSections.tsx:72`, `GameCostCard.tsx:65`, `equippedGoodsStore.ts:42`) — no request fires with a flag off. Backend router-level gates are complete for `SHOP_ENABLED` (`shop.routes.ts:47`) and `GAME_SERIES_ENABLED` (`series.routes.ts:50`, `gameSeries.routes.ts:40`).

### [MINOR] integration — three dead API surfaces

- **Where:** `Frontend/src/queries/queryKeys.ts:107` `shop.item(goodsId)`, `:109` `shop.equipped(userIds)`, and `referral.gameLink(gameId)` — none is referenced anywhere.
- **Defect:** `shopApi.getItem` (`Frontend/src/api/shop.ts:86`) and `referralApi.getGameInviteLink` (`Frontend/src/api/referral.ts:74`) have zero callers, leaving `GET /shop/items/:goodsId` (`Backend/src/routes/shop.routes.ts:52`) and `GET /referrals/game-link/:gameId` (`Backend/src/routes/referral.routes.ts:43`) unreachable from the app. `ShopItemSheet` takes `item` as a prop; `features/referral/useReferral.ts:85-90` builds the `?ref=` URL client-side from the cached summary.
- **Consequence:** Untested, unmonitored endpoints with no consumer — dead weight and a small attack surface.

### [MINOR] integration — two mutations that do not invalidate what they changed

- **Where:** `Frontend/src/pages/SeriesPage.tsx:140-141` — `refresh()` invalidates only `series.detail(seriesId)`; `endSeries`, `updateSeries`, `addRegular` and `removeRegular` all change the my-series list but `queryKeys.series.mine` is never invalidated. `Frontend/src/components/pairs/PairSheet.tsx:74` — `ensurePairTeam` creates a `UserTeam` then navigates away without invalidating `queryKeys.pairs.detail(pairId, sport)`.
- **Consequence:** (a) The cadence chip in `SeriesRepeatRow` on Create Game shows an ended series until `SERIES_STALE_MS = 30_000` (`useSeries.ts:17`) expires — self-healing, low. (b) Reopening the pair sheet still sees `detail.teamId === null`, so the short-circuit at `ensurePairTeam.ts:18` never fires and a redundant re-invite is sent; `createOrReuseUserTeam` prevents a duplicate team. Whether the duplicate invite surfaces a toast error is UNVERIFIED.

---

## Systemic patterns

1. **The parity test defines the ceiling, not the floor.** Every defect above that the test *could* have caught, it did — key sets, placeholders, English copies. Every i18n defect that survived is one the test structurally cannot see: per-locale required plural categories (`ar` recap → English), the script subtag of `sr`, formatting baked into a value rather than a placeholder (`:00`, `%`, `18:00`), and register consistency. Three cheap assertions would close most of it: a `REQUIRED_CATEGORIES: Record<Locale, string[]>` table, a lint forbidding `:00`/`%`/`km/h` literals adjacent to `{{…}}` in locale JSON, and a check that any `{{…}}` whose English neighbour is a bare plural noun has a `_one` sibling.

2. **Shared files that nobody owned are where the programme actually broke.** Every file with an explicit owner in the ownership list survived twelve concurrent agents intact — `GameDetailsShell.tsx`, `GameCardHeaderTags.tsx`, `GameSettings.tsx`, `WalletModal.tsx`, `Profile.tsx`, `callback.handler.ts`, `Admin/*` all carry every expected insert with no clobbering. Both BLOCKERs live in files nobody listed: `attachAvailableGamesEnrichment.ts` and `gameCardPropsEqual.ts`. The contract enumerates collision-prone files by name; it did not enumerate the two chokepoints every card field must pass through.

3. **Correct solutions were written and then not reused.** `resolveLocale` (the `sr` fix), `formatClockTime` (the Intl hour fix), `isRecapRtlLanguage` (the RTL guard) and `Intl`-based `formatPercent` all exist in this branch and are all correct — and each one has at least one sibling module that solved the same problem worse or not at all, in the same wave. Parallel agents converge on the right answer independently but cannot propagate it.

4. **Register was never decided.** Eleven locales, twelve namespaces, no style sheet. `sr` and `ru` visibly switch pronoun between features and, in `ru/referral.json`, inside a single file.

---

## Verified good

- **Key parity and translation quality.** All 12 namespaces × 11 locales present; zero keys used in new code that are absent from the `en` bundle; zero Latin-script leakage into `ru`/`ar`/`ja`/`zh`/`th` (the single `hi` hit, `"UPI आईडी…"`, is correct localization); `ru`/`cs`/`sr` carry full `_few`/`_many` sets for every English plural family; `ja`/`zh`/`th`/`id` correctly carry `_other` only.
- **No hard-coded user-facing English in the new components.** Swept 291 new/modified source files for `toast.*('…')`, `aria-label="…"`, `placeholder="…"`, `title="…"`, literal JSX text nodes and English sentence literals — no hits in any PRD 345–357 component. The handful found (`ProfileLeaderboard.tsx:339`, the `defaultValue:` fallbacks in `GameParticipants.tsx` / `AvailableGamesSection.tsx`) are all pre-existing and outside the diff.
- **RTL discipline.** Across every new feature directory, exactly one physical-direction class remains (`GameCardRightRail.tsx:125` `right-1`, pre-existing); everything else uses `ms-`/`me-`/`ps-`/`pe-`/`start`/`end`.
- **No schema jargon** (`resultsStatus`, `PLAYING`, `NON_PLAYING`, `ANNOUNCED`, `IN_QUEUE`, `entityType`) in any of the 132 locale files.
- **New system messages** — all five (`ATTENDANCE_NUDGED`, `USER_NOTED_NO_SHOW`, `GAME_MOVED_INDOOR`, `GAME_SPOT_OPENED`, `GAME_SEAT_AUTO_FILLED`) present and genuinely translated in all 11 `chat.json` files, so the English `FALLBACK_TEMPLATES` at `Frontend/src/utils/systemMessages.ts:75-79` are never reached.
- **Backend translation parity** — all 36 new `Backend/src/utils/translations.ts` keys added in all 11 languages; all seven new backend copy modules (`gameSeriesCopy`, `liveCopy`, `recapCopy`, `recapPushCopy`, `referralCopy`, `costReminderCopy`, `weatherAlertCopy`) carry identical key sets across all 11. (`ru`/`sr`/`es`/`cs` gaps on `telegram.openApp` / `errors.invites.ownerCannotDecline` are pre-existing.)
- **Intl where it counts** — `costMoney.ts`, `costReminderCopy.ts`, `attendanceVisuals.ts`, `pairFormat.ts`, `weatherRiskDisplay.ts` (percent, `kilometer-per-hour` unit, clock), `recapFormat.ts`, `shopFormat.ts`, `clubTodayStripFormat.ts` all use `Intl` with the active locale and a safe fallback. `seriesFormat.ts` even reads `Intl.Locale.weekInfo` for first-day-of-week. No hand-concatenated currency symbol anywhere in the new code.
- **Hour/duration units** (`{{hours}} h`, `ч`, `ساعة`, `時間`, `ชม.`, `घंटे`, `小时`, `jam`) are properly localized in all 11 locales for `attendance.organizer.nudgeCooldown`, `series.seatDeadlineValue` and `cost.remindCooldown`.
- **Telegram** — all 12 implemented callback prefixes (`ia sr uti at sg pi sip wx rm rum rg rbm`) covered by the regex at `Backend/src/services/telegram/bot.service.ts:65`, including the previously-missing `uti:`/`sip:`; Markdown escaping correct on every user-supplied name.
- **Contract mirror** — `Backend/src/services/game/availableGamesEnrichmentTypes.ts` and `Frontend/src/types/gameCardEnrichment.ts` agree field for field across all shapes, including optionality and union members; every backend enricher emits every declared field.
- **`hasTagRow`** (`Frontend/src/components/GameCard.tsx:327-343`) lists every tag `GameCardHeaderTags.tsx` can render, using the same guards on both sides (`isGameSeriesEnabled`, `resolveSpotOpenedAt`, `shouldShowWeatherPill`).
- **`rightRailPropsEqual`** (`GameCardRightRail.tsx:134-160`) compares all 16 props including `attendanceRail` via `attendanceRailDataEqual`.
- **Orphans** — none. All six socket events wired emitter→listener with matching strings; all 10 new `NotificationType`s have a producer, a `NOTIFICATION_TYPE_TO_PREF` entry and a default; all 13 routers mounted; all three schedulers started and stopped; no stub controllers.
- **Docs** — all 13 PRDs present in both `ui-test-plan/` and `domains/`; thinnest file is 81 lines.

## Not verified

- Whether `Backend/src/controllers/series.controller.ts:17` (sole importer of `gameSeriesCardEnricher`) sits on a router reachable from `routes/index.ts`. If not, the series pill has a second independent reason to be missing. **UNVERIFIED** — needs a route-mount trace.
- Whether the redundant pair re-invite (PairSheet finding) surfaces a user-visible error toast. **UNVERIFIED.**
- Whether `weatherAlerts.indoorAlternatives(gameId)` needing invalidation after a move-indoor action has any user-visible effect, or whether the sheet always closes on success. **UNVERIFIED** (`Frontend/src/components/weather/MoveIndoorSheet.tsx:57`).
- Rendered appearance of any of this. Everything above is from reading source and locale JSON; no build, test run or device check was performed (per brief).
- Locale *quality* judgements are limited to structural and grammatical defects I can substantiate from the string itself (wrong plural category, frozen case, mixed register, baked formatting). I did not attempt a fluency review of `th`, `hi`, `id` or `zh`.
