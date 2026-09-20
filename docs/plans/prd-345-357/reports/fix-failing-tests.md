# Fix pass — the five failing tests (PRDs 346, 348, 351, 352)

One agent, read-only diagnosis (no heavy commands run). For each failure: what was
actually wrong, which side changed, and why.

---

## 1. Cost-share rounding — `test:cost-split`, backend + frontend (PRD 348)

**Verdict: the tests were wrong. The implementation is right.**

PRD 348, *Implementation Decisions*:

> "Shares materialize when `priceType` is a known total and the roster changes while
> `resultsStatus === NONE`; frozen at FINAL. Owner NON_PLAYING is excluded unless payer.
> **Rounding to cents; remainder to the payer.**"

Scenario: 4000 minor units, `a/b/c/d`, payer `a`, override `d: 500`. The three free
players split 3500 → base 1166 each, remainder 2. "Remainder to the payer" puts **both**
cents on `a`: `{ a: 1168, b: 1166, c: 1166, d: 500 }`, which is exactly what
`splitCostShares` produces.

The expected `{ a: 1167, b: 1166, c: 1167, d: 500 }` corresponds to no deterministic
rule at all — spreading one cent each to `a` then `c` while skipping `b` would require
iterating "payer first, then the remaining ids in reverse". It is a hand-arithmetic slip.
The same test file already pins the PRD rule two blocks earlier
(`costShareMath.test.ts`: 1001 over `a/b/c` with payer `c` → `{333, 333, 335}` — both
remainder cents on the payer), so the file contradicted itself.

Changed (tests only):
- `Backend/src/services/gameCost/costShareMath.test.ts:193` → `{ a: 1168, b: 1166, c: 1166, d: 500 }`
- `Frontend/src/features/cost/costViewModel.test.ts` (`previewEvenSplit` mirror) → same numbers

`Frontend/src/features/cost/costViewModel.ts#previewEvenSplit` and
`Backend/.../costShareMath.ts#splitCostShares` were already byte-for-byte equivalent in
behaviour; no production code needed to move to make the two sides agree.

---

## 2. `detectOverriddenUserIds` — structurally wrong (PRD 348)

**Verdict: the implementation was wrong (a real bug). The test's intent was right; its
fixture numbers were the fix-1 numbers and moved with them.**

`detectOverriddenUserIds` exists so a roster change preserves an organizer's manual
override (`recomputeShares` → `gameCost.service.ts:182` on every roster/price sync, and
`:530` on `PUT /games/:id/cost-shares`). The old implementation re-split the **whole**
previous total evenly over **all** stored rows and flagged every row that differed.

That cannot work: an override shifts the canonical base for everybody else, so the
absorbers get flagged too. For the stored shape `1168/1166/1166/500` it returned all four
ids instead of `['d']`. The practical consequence in `recomputeShares` is that **every**
row becomes a pinned override the moment a single override exists — a fifth player then
joins and receives only the leftover (0 in the common case) while `a/b/c` never re-split.
The `4500` recompute test passed only by arithmetic coincidence (the four pinned rows
summed to 4000, so the newcomer got the residual 500 that `d` was "supposed" to show).

New algorithm (same file, `Backend/src/services/gameCost/costShareMath.ts`): invert
`splitCostShares` by peeling. Re-split the still-free rows over the money not held by
already-detected overrides; if every free row matches its canonical amount, stop; else
fix the single most out-of-line row and repeat. Ties prefer a non-payer, since the payer
is the remainder absorber and therefore the less likely hand-set row. It terminates in at
most `rows.length` passes (each pass either stops or fixes one row; with one free row left
the split is that row's own amount by construction).

Tests updated/added in `costShareMath.test.ts`:
- the detection fixture now uses the real stored shape `1168/1166/1166/500` → `['d']`
- new case: two overrides in one game (`1750/1750/200/300`, payer `a`) → `['c', 'd']`
- the "override survives a roster change" case now asserts the **whole** result
  (`{ a: 1000, b: 1000, c: 1000, d: 500, e: 1000 }`), not just `d`. That assertion is what
  fails on the old implementation, so the regression is now actually covered.

---

## 3. Pairs suites could not load (PRD 352)

**Verdict: the tests were wrong — incomplete `react-i18next` mock.**

`@/api/pairs` (and therefore every pairs component) transitively reaches
`Frontend/src/i18n/config.ts`, whose first statements are `import { initReactI18next }
from 'react-i18next'` + `i18n.use(initReactI18next)`. A factory `vi.mock` replaces the
whole module, so omitting that export makes the import throw.

House pattern already used by 12 passing suites (e.g.
`Frontend/src/components/clubPage/ClubHeroGallery.test.tsx:12`,
`Frontend/src/components/gameCard/GameCardPerHeadPrice.test.tsx:18`):
`initReactI18next: { type: '3rdParty', init: () => {} }`.

Added that line (with a one-line why) to:
- `Frontend/src/components/pairs/PairLeaderboard.test.tsx`
- `Frontend/src/components/pairs/PairSheet.test.tsx`
- `Frontend/src/components/pairs/PairSortChips.test.tsx`

No component code touched; nothing else in the pairs graph imports `Trans` or any other
`react-i18next` export.

---

## 4. Attendance organizer strip — 2 failures (PRD 346)

**Verdict: the test was wrong — its `t` mock serialised params as JSON, which
`renderToStaticMarkup` HTML-escapes.**

Checked the component first, as instructed: `AttendanceOrganizerStrip.tsx` does render a
real progress pill (`t('attendance.organizer.progress', { confirmed: confirmedCount,
total: playingCount })` fed from `details.confirmedCount` / `details.playingCount` via
`AttendanceCard.tsx:197-206`) and a real cooldown caption
(`t('attendance.organizer.nudgeCooldown', { hours: Math.max(1, nudgeRemainingHours) })`).
Nothing renders empty — the sibling assertion on `attendance.organizer.progress` and
`role="progressbar"` passes.

The mock returned `` `${key}:${JSON.stringify(params)}` ``. React's server renderer escapes
`"` to `&quot;` in **both** text nodes and attribute values, so the markup contains
`&quot;confirmed&quot;:2` and the assertion `toContain('"confirmed":2')` can never match,
no matter what the component does. No other suite in `Frontend/src` asserts quoted JSON
against static markup.

Changed `Frontend/src/features/attendance/AttendanceCard.test.tsx` only: the mock now
serialises `key:name=value,name=value` (escape-free, still shows the interpolated values),
and the three assertions read `confirmed=2`, `total=4`, `hours=5`. The assertions still
fail if the component stops interpolating or renders a placeholder count.

---

## 5. Referral code validation (PRD 351)

**Verdict: not a bug. The test fixture `'tampered'` is itself a structurally valid
referral code.** The read boundary is already validated, on all three surfaces.

`'tampered'` → `.trim().toUpperCase()` → `TAMPERED`: eight characters, and every one of
`T A M P E R E D` is a member of `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. So
`REFERRAL_CODE_PATTERN` matches and `normalizeReferralCode` correctly returns `TAMPERED`.
The test simply picked an English word that happens to be a legal code.

Audit of the three boundaries requested — all already guarded, nothing to fix:

| Surface | Guard |
|---|---|
| `Frontend/src/utils/appAttribution.ts:118` (`readStoredAttribution`) | `ref: normalizeReferralCode(parsed.ref)` — re-normalises on **every** read; `getCapturedReferralCode`, `getAttributionForAuth` (axios interceptor, `api/axios.ts:41`) and `reportStoredAttributionIfAuthed` all go through it. No caller reads `localStorage` raw. |
| `Frontend/public/link-to-app/index.html:474-485` | local `normalizeRef()` with the identical regex, applied to `stored.ref` *and* `params.get('ref')`; a non-matching value is dropped **and** deleted from the outgoing query string. |
| `POST /auth/attribution` → `linkToApp.controller.ts:66` → `linkToApp.attributionParse.ts:53` | `ref: normalizeReferralCode(merged.ref)` server-side; then `referral.service.ts:181 resolveReferrerUserId` normalises again and requires the code to belong to an **active** user, else `null`. The client's word is never trusted. |

Changed `Frontend/src/utils/appAttributionReferral.test.ts` only:
- "ignores a stored ref that is not a valid code" now iterates genuinely invalid values:
  out-of-alphabet character, too long, too short, the four ambiguous characters
  (`0 O I 1`), `'<script>'`, empty string, a number, and an object.
- new case documents the boundary honestly: a well-formed but unknown code (`TAMPERED`)
  **is** carried, because existence is a server question that `resolveReferrerUserId`
  answers.

---

## Files touched

Implementation (1):
- `Backend/src/services/gameCost/costShareMath.ts` — `detectOverriddenUserIds` rewritten

Tests (7):
- `Backend/src/services/gameCost/costShareMath.test.ts`
- `Frontend/src/features/cost/costViewModel.test.ts`
- `Frontend/src/features/attendance/AttendanceCard.test.tsx`
- `Frontend/src/utils/appAttributionReferral.test.ts`
- `Frontend/src/components/pairs/PairLeaderboard.test.tsx`
- `Frontend/src/components/pairs/PairSheet.test.tsx`
- `Frontend/src/components/pairs/PairSortChips.test.tsx`

No schema, migration, `package.json`, CI, or off-limits file was touched. No heavy
command was run.

## Unresolved / for the orchestrator

- Nothing else in the tree quotes the old `1167/1166/1167` numbers (checked
  `Backend/src`, `Frontend/src` and the PRD-348 report / UI-test-plan / domain deltas).
- Worth adding to `docs/product/constraints.md`: **the cost split's rounding remainder
  goes entirely to the payer** (`splitCostShares`), and `detectOverriddenUserIds` must
  stay the inverse of it — the two functions are a matched pair and "simplifying" either
  one silently corrupts stored ledgers on the next roster change.
