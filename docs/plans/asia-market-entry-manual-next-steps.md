# Asia market entry — manual next steps

**Markets:** Indonesia · Japan · Thailand · India · China  
**UI locales (shipped in eng):** `id` · `ja` · `th` · `hi` · `zh` (Simplified)  
**Sports:** Padel + table tennis (never “ping-pong” in product). China = dual-sport ASO.  
**Not in scope yet:** WeChat / Alipay / LINE / UPI rails.

Eng foundation is in the repo (locale packs, geo countries/cities, native strings, EULA, allowlists, Playwright `asia-locales.spec.ts` in guest project, UI_TEST_PLAN PR-21g–o, iOS/Android widget Asia copy, store badges, geo export preserve for Asia labels, `npm run seed:asia-cities`). This doc is **only what you must do by hand** to go sellable.

Related catalog: `docs/UI_TEST_PLAN.md` (PR-21g–o, §19.3). Soft-launch order: **ID → JP → TH → IN → CN**.

---

## Principles (don’t reopen)

1. One pack per language — no dialect forks (`zh-TW`, regional IN languages, etc.).
2. India store = **English first**; Hindi is in-app.
3. Mainland China public is **last** and gated on legal/distribution — not the same as Indonesia soft launch.
4. Country flavor = store listing, currency cues, legal, ASO — not new UI packs.

---

## Phase A — Native review (per language)

**Owner:** You + native reviewer  
**Done when:** Written sign-off; issues filed `screen | key/screenshot | current | suggested | severity`.  
**Eng applies string fixes after the pass.**

### A.0 Order

| # | Locale | Why |
|---|--------|-----|
| 1 | `id` | First public market; Latin; fastest |
| 2 | `ja` | Premium polish bar |
| 3 | `th` | Script/glyph QA |
| 4 | `hi` | After India EN path is clear |
| 5 | `zh` | Terminology + dual-sport stakes |

### A.1 Setup

1. Install latest internal / TestFlight / Play internal (or staging web).
2. Profile → language → target; confirm `html[lang]`.
3. Create **one padel** and **one table tennis** game; join/queue both.
4. Female + male (or unset) accounts for gendered join copy.
5. Currency Auto with a city in that country (IDR / JPY / THB / INR / CNY).
6. Open EULA once from register/profile.

### A.2 Flows to walk

Login → city pick (CN/ID/IN/TH/JP present) → Home/My → Find → Create (padel + TT) → Game details → Chat → Profile → Marketplace (JPY/IDR = **0** decimals) → Push/Telegram if enabled.

### A.3 Must-pass criteria

- No leftover English UI sentences (brands OK: Bandeja, Playtomic, NTRP…).
- TT never labeled ping-pong in formal UI.
- `zh`: one padel term only (**板式网球** today) — flag if natives prefer 帕德尔 everywhere.
- Glyphs: no tofu on hi/th/zh/ja; buttons don’t clip badly.
- Feminine join/queue when gender=Female.

### A.4 Output

Spreadsheet or GitHub issues → hand to eng for string-fix PRs.

---

## Phase B — Device QA (manual matrix)

**Owner:** You / QA + native speaker  
**Done when:** Checklist signed on iOS + Android; P0 layout bugs closed.

| Device | Locales to force |
|--------|------------------|
| Small Android | `id`, `th`, `hi` |
| Large Android | `zh`, `ja` |
| iPhone SE-class | `zh`, `ja`, `th` |
| iPhone large | `id`, `hi` |
| Desktop web (optional) | all five smoke |

Check: tab truncation, create-game sticky CTAs, chat with mixed EN club names, week start Monday under Auto, marketplace JPY/IDR, language selector lists all Asia langs.

Automated: guest project including `smoke/asia-locales.spec.ts` before each Asia store candidate build.

---

## Phase C — Soft launches (staggered, manual ops)

Do **not** open all five public storefronts the same week.

### C.1 Indonesia (first)

1. **App Store + Play:** Bahasa + English listings; Jakarta/Bali padel imagery; TT secondary.
2. ASO sheet: keywords (padel, tenis meja, cari lawan, …) × EN.
3. What’s New: ID + EN.
4. Cohort **5–15** (Jakarta/Bali, ≥2 clubs): find → join → chat → IDR → EULA; create TT once.
5. Support: EN + ID path (or same-day triage); canned replies for language / currency / week start.
6. Go/no-go: no P0 join/create/chat bugs; crash bar OK; support not a dead end.

### C.2 Japan

1. Japanese-first listing; EN secondary; Tokyo/Osaka creatives; JPY 0 dp in marketplace shots.
2. Smaller cohort (5–10); higher polish bar.
3. Support: JA or same-day EN triage SLA.

### C.3 Thailand

1. Thai + EN; Bangkok-only cities OK for v1; THB cues.
2. Glyph QA on small Android before public.
3. Cohort 5–12 Bangkok (Thai + EN expat).

### C.4 India

1. **English store listing first** (metros). Hindi available in-app after A.`hi`.
2. Optional Hindi store listing later.
3. INR; Mumbai + one of Delhi-NCR / Bengaluru / Hyderabad creatives.
4. Cohort bilingual EN/HI; pitch cross-brand open games vs club-only apps.

### C.5 China (Mainland public last)

1. `zh` pack already usable for diaspora / testers on global builds.
2. Mainland public only after **Phase D** memo applied.
3. ASO Chinese-first; **TT + padel dual screenshots mandatory**.
4. App Store China distribution plan; do not rely on Play.
5. No WeChat login/pay assumption for v1.
6. Chinese support reply path required before public CN.

### C.6 Per-market go / no-go

- [ ] Phase A blockers fixed or accepted  
- [ ] Phase B no P0 layout bugs  
- [ ] Cities selectable; currency Auto correct  
- [ ] Crash-free within your bar  
- [ ] Support path for that language (or documented EN triage SLA)  
- [ ] China only: Phase D cleared  

---

## Phase D — Legal / privacy (parallel; you + counsel)

**Blocks Mainland China public.** Soften later markets for ads if memo requires.

Brief counsel: consumer sports scheduling; accounts; chat; optional marketplace; push; analytics; hosts likely outside target countries.

| Market | Ask |
|--------|-----|
| Indonesia | PDP Law; bilingual notices; cross-border hosting |
| Japan | APPI; store privacy nutrition |
| Thailand | PDPA |
| India | DPDP; EN (+ HI) notices; ads later |
| China | **PIPL**; cross-border; ICP / local hosting?; is world EULA enough? |

After memo: only **required** product tickets; update EULA/privacy per language with EN; counsel sign-off on final copy.

---

## Phase E — Cities, clubs, analytics (manual)

After soft launch stable for that country:

1. Partner / seed real clubs in metros (Jakarta, Tokyo/Osaka, Bangkok, Mumbai/Delhi/Bengaluru/Hyderabad, Shanghai/Shenzhen/Chengdu/Hangzhou).
2. Set `City.telegramPinnedLanguage` where Telegram city groups are used.
3. Dashboard: **country × UI language × sport** (padel vs table tennis).
4. Ads creatives for `zh/id/hi/th/ja` when monetizing.

### Ops sheets to create (once)

| Sheet | Contents |
|-------|----------|
| Club CRM | city, club, courts, booking app, contact, partner status |
| ASO workbook | country × lang × keywords × screenshot brief |
| Support macros | ~10 canned replies × language |
| Counsel memo log | PDF links + “required eng tickets” |

---

## Phase F / G — Later (not launch gates)

- Per-country ASO experiments; China separate padel vs TT creatives.  
- Traditional Chinese / Korean UI only if business decides.  
- WeChat / Alipay / LINE / UPI / ICP hosting only if growth or counsel demands.

---

## Suggested calendar (human)

| Window | You do |
|--------|--------|
| This week | Book native reviewers (start `id`/`ja`) + counsel brief; run Phase B on internal build |
| Next 1–2 weeks | Finish A for `id`/`ja`; draft ID store listings; ID cohort |
| After ID green | Soft launch Indonesia → Japan |
| Parallel | A for `th`/`hi`; Thailand soft launch; India EN listing |
| After D memo | China public go/no-go |

---

## Eng already done (don’t redo)

- Locales `zh/id/hi/th/ja` + selector/profile/dates/fonts  
- BE push/system/welcome + chat allowlists `id/hi/th`  
- Geo countries + 16 metro cities (seed: `cd Backend && npx ts-node --transpile-only scripts/seed-asia-cities.ts`)  
- Native Android/iOS/widgets; EULA content + `eula.html`  
- Playwright `Frontend/e2e/specs/smoke/asia-locales.spec.ts`  
- UI_TEST_PLAN PR-21g–o  

## Explicit non-goals (v1)

- WeChat mini-program, Alipay, LINE OA, UPI  
- Traditional Chinese / more Indic languages  
- Five dialect packs  
- Separate Asia app binary  
