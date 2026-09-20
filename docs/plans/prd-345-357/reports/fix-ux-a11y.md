# Fix: UX, accessibility, mobile

Closes `docs/plans/prd-345-357/reports/critic-ux-a11y.md` — all 9 MAJOR and all 10 MINOR findings.

One filed item turned out to rest on a wrong premise and is documented at the bottom (**Findings corrected**), together
with a defect the audit's own suggested remedy would have introduced.

---

## The two systemic passes — approach chosen

### 1. Roving focus, once, in a shared module

New: **`Frontend/src/utils/rovingFocus.ts`** — `isRovingNavKey` / `nextRovingIndex` / `rovingTabIndex` /
`isDocumentRtl`. Pure index arithmetic: wraps, skips disabled items, `Home`/`End` land on the first/last *enabled*
item, and `ArrowLeft`/`ArrowRight` mirror under `dir="rtl"`. It is the model
`Frontend/src/components/pairs/PairSortChips.tsx` already implemented by hand (automatic activation: arrow moves focus
**and** selection), lifted out so the four sites that declared a composite role can share one implementation instead of
four.

It now backs **four** widgets:

| Widget | Role | What it gained |
|---|---|---|
| `Frontend/src/components/SegmentedSwitch.tsx` | `tablist` | roving tabindex + Arrow/Home/End, RTL-aware |
| `Frontend/src/features/game-series/SeriesScopeSheet.tsx` | `radiogroup` | roving tabindex + Arrow/Home/End, `aria-orientation="vertical"`, visible focus ring |
| `Frontend/src/components/recap/RecapStoryViewer.tsx` | `tablist` | roving tabindex + arrow keys, `aria-controls` → a real `tabpanel` |
| `Frontend/src/components/live/SpectatorTopBar.tsx` | `menu` | Arrow/Home/End over the menu items, disabled items skipped |

I chose (a) "adopt the roving-focus helper" over (b) "drop the composite role", because all four are genuinely composite
widgets and PRD 345 explicitly promises arrow keys.

**`SegmentedSwitch` compatibility.** I read `LeaderboardModeSwitch`, `PlayerCardProfileBody`, `Header`,
`GameResultsTabs`, `ShopPage`, `SeriesRepeatRow`, `ClubAdminCourtForm` and the e2e page objects before touching it.

- `toggleIds` mode is untouched: it renders `role="group"` with independent `aria-pressed` buttons, so it keeps every
  button in the tab order and gets **no** `onKeyDown` — it is not a tab list and has no arrow model to honour.
- `allowDeselect` with `activeId === null` would otherwise leave no tab stop at all; `rovingTabIndex` falls back to the
  first enabled tab so the control is never unreachable by Tab. Arrow keys select, never deselect.
- Disabled tabs keep `tabIndex={-1}` and are skipped by arrow navigation.
- `aria-orientation` was already correct and is preserved (`vertical` for the vertical variant, and omitted in `group`
  mode where it is not a valid attribute).
- Every e2e selector (`getByRole('tab')` + `.click()`) and every existing unit test uses clicks, which `tabindex="-1"`
  does not affect.

While in the primitive I also closed the two motion gaps the audit noted in passing: `whileTap={{scale:0.95}}`, the
`layoutId` shared-element slide and the label-width tween are now all gated on `usePrefersReducedMotion()`.

### 2. Reduced-motion guard for CSS press feedback

New: **`Frontend/src/components/motion/pressScale.ts`** — a single exported class string `pressScaleGuard`, imported
next to the `active:scale-*` each control already owns. Same role `shimmerBlock` plays for skeletons; one shared
constant rather than eight one-off conditionals, and no JS hook added to eight leaf components.

**Important: the guard the audit suggested does not work.** The report proposed
`motion-reduce:transform-none motion-reduce:transition-none`. In Tailwind v4 (this repo is on `tailwindcss@4.3.0`)
`scale-*` compiles to the standalone **`scale`** property, not to `transform`:

```css
.active\:scale-95        { &:active { --tw-scale-x: 95%; …; scale: var(--tw-scale-x) var(--tw-scale-y) } }
.motion-reduce\:transform-none { @media (prefers-reduced-motion: reduce) { transform: none } }
```

`transform: none` never touches `scale`, so that pair is a silent no-op. The override has to be another `scale`
utility, and it has to match the target's specificity — `.active\:scale-95:active` is (0,2,0) while
`.enabled\:active\:scale-*` is (0,3,0). `pressScaleGuard` therefore carries both variants:

```
motion-reduce:active:scale-100 motion-reduce:enabled:active:scale-100 motion-reduce:transition-none
```

Verified against the real compiler output: Tailwind emits `motion-reduce:` (a media variant) *after* the plain
pseudo-class rules, so the later, equally-specific rule wins.

Applied to the eight sites the report lists (seven files — `AttendanceCard` has two), **except**
`components/onboarding/NotificationsStep.tsx`, which is owned by the conformance agent this wave. See
**Handover** below.

While there, the same broken guard was already in two pre-existing chat files; they are now on the shared constant so
the codebase has one answer: `components/MessageItem/linkPreview/LinkPreviewChip.tsx`,
`components/MessageItem/linkPreview/LinkPreviewCard.tsx`.

---

## MAJOR

### Shop card's `aria-label` erased the price
`Frontend/src/components/shop/ShopItemCard.tsx`

An `aria-label` on a `<button>` replaces the entire subtree as the accessible name, so the rendered `ShopPricePill`
("120 coins") never reached a screen reader. The label now spells out name → price → premium gate → state, using the
existing `coinsPhrase()` helper so the phrase is correctly pluralised per locale. Doc comment corrected.

Tests: `ShopItemCard.test.tsx` — four existing assertions updated to the new name, plus a new
`carries the price in the card label, which overrides the rendered pill` case asserting the price is in the accessible
name.

### Per-head price put the total in an `aria-label` on a role-less `<span>`
`Frontend/src/components/gameCard/GameCardPerHeadPrice.tsx`

ARIA name-from-author does not apply to a generic element, so the label was dropped outright. The pill is now a real
`<button type="button">` — the name is honoured, and the reveal is reachable with Enter/Space.

Tests: `GameCardPerHeadPrice.test.tsx` — the existing accessible-name test now also asserts the **per-head** figure is
present, plus a new `carries the label on a real button, where name-from-author applies`.

### Long-pressing the per-head price navigated into the game
Same file, with `Frontend/src/components/GameCard.tsx:350` as the culprit's host.

The reveal had no `stopPropagation`, so the enclosing `Card`'s `onClick` routed to `/games/:id` on touch-end. Now:
`onClick`, `onContextMenu` and the press handlers all `stopPropagation`, a plain tap toggles the total (second tap
hides it), and `onTouchMove` cancels the long-press timer past a 10 px slop so scrolling the card does not trigger it.
The total is now obtainable three ways on a phone: tap, long-press, and the accessible name.

Test: new `reveals the total on tap without letting the card click through`, rendered inside a parent with an `onClick`
that mirrors `GameCard`.

### Selecting an empty category removed the category filter
`Frontend/src/pages/ShopPage.tsx`

The whole-shop empty branch is now gated on `category === 'all'`. When a *specific* category is empty, the chips stay
mounted and an `EmptyStateCard` renders inside the grid slot with a **Show all** action that resets the filter —
CONTRACT §7.2 "one clear next action".

New copy (11 locales): `shop.emptyCategoryTitle`, `shop.emptyCategoryDescription`, `shop.showAll`.

### The attendance-dot legend was reachable only via `contextmenu`
`Frontend/src/features/attendance/AttendanceDot.tsx`, new
`Frontend/src/features/attendance/AttendanceLegendButton.tsx`,
`Frontend/src/components/GameDetails/GameParticipants.tsx`

Two paths, because the dot is a 14–16 px glyph pinned to an avatar corner and cannot honestly be a 44 px target:

1. When `onRequestLegend` is passed, the dot is now a `<button>` (press + long-press, `stopPropagation` so the avatar
   behind it does not open a player card), with an `after:-inset-1.5` pseudo-element widening the touch region without
   moving any layout, and an accessible name of "<state>. What the dots mean". Without the handler it stays exactly as
   before: an inert `pointer-events-none` span with its `sr-only` label.
2. `AttendanceLegendButton` — a 44 px, keyboard-reachable, labelled "What the dots mean" control rendered under the
   participants section header whenever attendance dots are present. This is the compliant control; the dot is the
   shortcut.

No new copy: both reuse the existing `attendance.legend.title`.

Tests: `attendanceRoster.test.tsx` — `becomes a pressable button when a legend handler is passed` and
`stays inert when no legend handler is passed`.

### `role="radiogroup"` with no arrow keys
`Frontend/src/features/game-series/SeriesScopeSheet.tsx` — covered by systemic pass 1. Also added a visible
`focus-visible` ring, since roving focus is only usable if you can see where it is.

### Popover menus could not be dismissed
`Frontend/src/features/attendance/AttendanceRosterActions.tsx`, `Frontend/src/components/live/SpectatorTopBar.tsx`,
new `Frontend/src/hooks/usePopoverDismiss.ts`

The house pattern (`Select.tsx`, `GameTypeDropdown.tsx`, `MessageInputAttachMenu.tsx`, `AvailabilityCopyMenu.tsx`) is a
document listener scoped by a container ref plus an Escape `keydown`. `usePopoverDismiss` packages exactly that so a
popover cannot ship with only half of it. Two deliberate deviations from the copies:

- **`pointerdown`, not `mousedown`.** On iOS WKWebView the synthetic `mousedown` only arrives after `touchend` and is
  suppressed when the touch is consumed elsewhere — which is how the roster menu ended up impossible to dismiss on a
  phone in the first place. Registered in the capture phase so a child that stops propagation cannot strand it either.
- **The callback is told *why*.** Escape returns focus to the trigger (the keyboard user is still there); an outside
  press does not (the pointer user has moved on, and yanking focus back re-opens soft keyboards).

`AttendanceRosterActions` also gained the missing `aria-haspopup="menu"`, a real `role="menu"`/`role="menuitem"` pair,
and focus-on-open. `SpectatorTopBar` gained the arrow-key model its `role="menu"` was already advertising.

### Cost share rows collapsed the player name at 375 px
`Frontend/src/components/GameDetails/cost/GameCostCard.tsx`

When either organizer control is present (`canConfirm`, or `canManage && !frozen`) the amount and the `CostStateChip`
move onto their own line and the name gets the full inline width. Computed once per card so every row keeps the same
height. Players who see neither control keep the original single-line row.

At 375 px the card's inner width is ≈319 px; the fixed children are now avatar + two 44 px controls + gaps ≈ 136 px,
leaving ≈183 px for the name instead of ≈80 px.

### Cost card had no loading and no error state
Same file, plus `Frontend/src/pages/GameDetailsShell.tsx`

`if (!enabled || isPending || isCostLedgerHidden(summary) || …) return null` is split into four:

| State | Treatment |
|---|---|
| flag off | `null` |
| pending | `shimmerBlock` skeleton (card header + three rows), `aria-busy`, `sr-only` "Loading the cost split…" |
| error | inline `role="alert"` message + a **Retry** button |
| hidden (no price / zero total / not in the ledger) | `null` — the only case that stays silent |

One refinement over the literal ask: a skeleton that *always* resolves to nothing would just move the reflow rather
than remove it, so `GameCostCard` takes a new `expectCost` prop (default `true`) and `GameDetailsShell` passes
`(game.priceTotal ?? 0) > 0`. A game with no price renders nothing at any point, exactly as the PRD's "never an empty
shell" requires; a game with a price gets a placeholder that holds its space.

New copy (11 locales): `cost.loading`, `cost.loadFailed`. Retry reuses `common.retry`.

---

## MINOR

| Finding | Fix | Files |
|---|---|---|
| Failed club fetch rendered "Club not found" | New `clubQuery.isError && !club` branch before the not-found branch: own title/description + Retry | `pages/ClubPage.tsx`; copy `clubPage.error.title` / `clubPage.error.description` × 11 |
| Premium badge gold fails contrast in Light | New `.shop-premium-badge` class in `styles/collection.css`; `#b8860b` (≈3.3:1) → `#8a6508` (≈5.3:1), dark gold unchanged (≈9.8:1). Also removes the raw hex from both `.tsx` files | `styles/collection.css`, `components/shop/ShopItemCard.tsx`, `components/shop/ShopItemSheet.tsx` |
| Recap `tablist` arrow keys stolen by the global handler | The window handler now bails when the event target is inside a `[role="tablist"]`; the strip got its own roving model, `aria-controls` and a real `tabpanel` | `components/recap/RecapStoryViewer.tsx`; copy `recap.viewer.sportTabs` × 11 |
| Space swallowed inside the recap viewer | The handler only repurposes Space when focus is not on a `button`/`a`/`input`/`textarea`/`select`/contenteditable | same file |
| Pair row flash uses an ungated `animate-pulse` | `usePrefersReducedMotion()` keeps the sky tint (which is what identifies the row) and drops the infinite opacity pulse | `components/pairs/PairRow.tsx` |
| "Spot opened" pill is a live region on every card | `role="status"` → `role="img"`, matching `WeatherRiskPill`; identical accessible name, no announcements | `features/spot-opened/SpotOpenedPill.tsx` + its test |
| Court tiles rely on `aria-label` on a `<li>` | Replaced with a real `sr-only` span carrying `fullLabel`, robust in NVDA browse mode | `components/clubPage/ClubCourtsGrid.tsx` |
| RTL: decorative sweep + cloned toggle thumb | `@keyframes spot-shimmer` now scales its travel by `--shimmer-sweep-direction` (`1` on `:root`, `-1` on `[dir='rtl']`). Both toggles move the thumb with `margin-inline-start` instead of `translateX` | `styles/tokens.css`, `features/game-series/SeriesRepeatSheet.tsx`, `components/ToggleSwitch.tsx` |
| Four-up club action row truncates at 375 px | 4 buttons → 2 × 2 on a phone, four across from `sm`; the label is `line-clamp-2 text-pretty` instead of `truncate`, so the icon never carries the meaning alone | `pages/ClubPage.tsx` |
| Ungated CSS `active:scale-*` (8 places) | Systemic pass 2 | 7 of 8 files — see Handover |
| "Keep as regular" toggle is a 28 px target | The button is now `h-11` with the extra height as transparent padding; the visible 28 × 48 track is unchanged and moved into an `aria-hidden` inner span | `features/game-series/SeriesRepeatSheet.tsx` |

`components/ToggleSwitch.tsx` is strictly beyond the finding (the audit scoped it as pre-existing) but carries the same
defect the copy did, and the fix is visually identical in LTR. Noted so it is not a surprise in review.

---

## New shared modules

| File | Why it is a `.ts`, not a `.tsx` |
|---|---|
| `Frontend/src/utils/rovingFocus.ts` | pure functions; `react-refresh/only-export-components` |
| `Frontend/src/components/motion/pressScale.ts` | class string, next to `shimmerBlock.ts` |
| `Frontend/src/hooks/usePopoverDismiss.ts` | hook + `PopoverDismissReason` type |
| `Frontend/src/features/attendance/AttendanceLegendButton.tsx` | exports exactly one component |

---

## Tests

| File | Status |
|---|---|
| `Frontend/src/components/SegmentedSwitch.keyboard.test.tsx` | **new** — 9 cases: single tab stop, `allowDeselect` fallback, ArrowRight/Left/Up wrap, Home/End, disabled skipped, RTL mirroring, unrelated keys untouched, `aria-orientation="vertical"`, toggle mode stays a plain `group` |
| `Frontend/src/components/shop/ShopItemCard.test.tsx` | 4 assertions updated to the price-carrying name; **+2** cases (price in accessible name, `.shop-premium-badge` present) |
| `Frontend/src/components/gameCard/GameCardPerHeadPrice.test.tsx` | 1 assertion extended; **+2** cases (real `<button>`, tap does not click through to the card) |
| `Frontend/src/features/attendance/attendanceRoster.test.tsx` | **+2** cases (dot is pressable with a handler, inert without) |
| `Frontend/src/features/spot-opened/SpotOpenedPill.test.tsx` | `role` assertion updated `status` → `img` |

`SegmentedSwitch.keyboard.test.tsx` is a **new file and is not in any `Frontend/package.json` test script** — I cannot
edit `package.json`. Orchestrator: add it to a suite (it fits `test:pairs` or a new `test:kit`), or it will not run in CI.

---

## i18n

9 new keys, all in namespaces `localeParity.test.ts` already guards (`shop`, `cost`, `recap`, `clubPage`), each written
out in all 11 locales with real translations — no placeholders, no value identical to English, so family parity,
placeholder parity and the non-identical rule all hold.

`shop.emptyCategoryTitle` · `shop.emptyCategoryDescription` · `shop.showAll` · `cost.loading` · `cost.loadFailed` ·
`recap.viewer.sportTabs` · `clubPage.error.title` · `clubPage.error.description`

---

## Findings corrected

**1. The report's own proposed remedy for the press-scale finding is a no-op.** "Adding `motion-reduce:transform-none
motion-reduce:transition-none` … closes all eight" is wrong on Tailwind v4: `scale-*` compiles to `scale`, not
`transform`. Verified directly against `tailwindcss@4.3.0`'s compiler. Two pre-existing files in the codebase
(`LinkPreviewChip.tsx`, `LinkPreviewCard.tsx`) were already shipping that non-working pair and are now on the working
guard. Full derivation in the doc comment of `pressScale.ts`.

**2. `SeriesScopeSheet` has two radio options, not four.** The finding says "Four `role="radio"` buttons inside a
`role="radiogroup"`"; `SeriesScopeSheet.tsx` renders exactly two (`This game`, `This and future games`), matching PRD
345's "Apply to · This game · This and future games". The defect itself — a `radiogroup` with no arrow keys and no
roving tabindex — was real and is fixed; only the count was wrong.

Everything else in the report checked out against the source as written, including the two claims that were easy to
doubt: `ShopItemCard`'s doc comment really did assert an accessible name it did not produce, and `ClubCourtsGrid` really
did mark all four visible spans `aria-hidden`.

---

## Handover to the orchestrator

1. **`Frontend/src/components/onboarding/NotificationsStep.tsx:158`** is the eighth press-scale site and is owned by the
   conformance agent this wave, so I did not touch it. The change is one line — add the import and append the guard:

   ```tsx
   import { pressScaleGuard } from '@/components/motion/pressScale';
   // …
   className={`… active:scale-[0.99] dark:border-gray-700 dark:bg-gray-800 dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard}`}
   ```

2. **Register `SegmentedSwitch.keyboard.test.tsx`** in a `Frontend/package.json` test script (see Tests above).

3. I touched `Frontend/src/pages/ClubPage.tsx` in three places — the error branch, `ClubActionRow`'s grid and
   `ActionButton`'s label — none of which overlap the reviews-gating region the conformance agent owns. Worth a glance
   when the two sets of edits land together.

## Not verified here

Nothing was run: no `tsc`, no lint, no vitest, no build. Everything above is a source-level change reviewed by reading.
The Tailwind specificity/ordering claim is the one exception — it was checked by invoking the installed compiler's
public API on five class names, which is not a build.
