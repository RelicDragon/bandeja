# Critic: UX, accessibility, mobile

Scope reviewed: `Frontend/src/features/{game-series,attendance,spot-opened,cost,recap,weather-alerts,live,referral,collection}/`,
`Frontend/src/components/{onboarding,clubPage,pairs,live,referral,weather,shop,recap,wallet,GameDetails/cost,stories/slides,ui/{StatTile,StatTileRow,CountUpNumber}}`,
`Frontend/src/pages/{OnboardingPage,ClubPage,ShopPage,SeriesPage}.tsx`, `Frontend/src/styles/{collection.css,tokens.css}`,
and the diffs to `GameDetailsShell.tsx`, `GameCard.tsx`, `gameCard/`, `GameParticipants.tsx`, `PlayersCarousel.tsx`,
`GameSettings.tsx`, `WalletModal.tsx`, `Profile.tsx`, `ProfileLeaderboard.tsx`.

## Verdict

This is a surprisingly disciplined body of work for thirteen parallel PRDs, and on a phone it would mostly feel like one
product. RTL discipline is near-perfect — the team used `ms-`/`me-`/`ps-`/`pe-`/`start`/`end`/`marginInlineStart`
throughout, and I found essentially no physical-property bugs in the new code (the only four `left-`/`right-` hits in the
whole scope are in comments or pre-existing files). Reduced motion is gated in almost every Framer path, including the
shared-element `layoutId` in the live rail and the count-up primitive. Dark-mode pairs are present on nearly every colour
class. There are **no BLOCKERs**: nothing I found makes a surface unusable or unreachable for a whole class of user.

The worst offender is a cluster of *composite widgets that claim an ARIA role and then don't implement its interaction
model* — a `role="radiogroup"` with no arrow keys (PRD 345's own accessibility line demands them), a `role="tablist"`
whose arrow keys are stolen by a global handler, and two hand-rolled `role="menu"` popovers that cannot be dismissed by
tapping outside or pressing Escape. Close behind it is a set of three places where an `aria-label` silently *removes*
information from the accessibility tree rather than adding it: the shop card hides its own price from screen readers, and
the per-head price pill puts the game total in an `aria-label` on a role-less `<span>`, where it is ignored. Both of those
are in the two flows where money is at stake.

## Findings

### [MAJOR] a11y / PRD 355 — Shop card's `aria-label` erases the price from the accessibility tree
- **Where:** `Frontend/src/components/shop/ShopItemCard.tsx:40` (and the `ShopPricePill` at line 68)
- **Defect:** The whole card is a `<button aria-label={`${item.name}. ${stateLabel}.`}>`, and an `aria-label` on a button
  replaces its entire subtree as the accessible name, so the rendered `ShopPricePill` ("120 coins") is never announced —
  despite the file's own doc comment claiming "its accessible name carries name, price and state".
- **User-visible consequence:** A VoiceOver/TalkBack user browsing the shop grid hears "Neon Frame. Buy." for every item
  and cannot compare prices without opening each item's sheet one at a time.
- **Standard violated:** PRD 355 "Accessibility — price pills read '120 coins'"; CONTRACT §7.1 "explicit roles and labels
  on every control".

### [MAJOR] a11y / PRD 348 — Per-head price puts the game total in an `aria-label` on a role-less `<span>`
- **Where:** `Frontend/src/components/gameCard/GameCardPerHeadPrice.tsx:70-75`
- **Defect:** `aria-label` is applied to a plain `<span>` with no `role`; ARIA name-from-author does not apply to a
  generic/`none`-role element, so the label is dropped and only the visible per-head text is read. The sibling
  `WeatherRiskPill.tsx:113` in the same programme does this correctly with `role="img"`.
- **User-visible consequence:** A screen-reader user hears "10 € per player" but never the total or the player count, and
  the file's stated fallback ("always in the accessible name so it is never touch-only information") does not hold.
- **Standard violated:** CONTRACT §7.1 accessibility; PRD 348 "amounts read with currency".

### [MAJOR] mobile / PRD 348 — Long-pressing the per-head price navigates into the game instead of revealing the total
- **Where:** `Frontend/src/components/gameCard/GameCardPerHeadPrice.tsx:16,58-68` with `Frontend/src/components/GameCard.tsx:350`
- **Defect:** The reveal is a 400 ms `onTouchStart` timer with no `onTouchMove` cancel and no `stopPropagation`; the
  enclosing `Card` has `onClick={handleCardClick}` which navigates to `/games/:id`, so the touch-end after a successful
  long-press still fires the card's click.
- **User-visible consequence:** On a phone the total flashes for a frame and the app immediately routes to game details —
  the "total in a tooltip/long-press" affordance the PRD specifies is unreachable on the primary platform.
- **Standard violated:** PRD 348 "the price row … with the total in a tooltip/long-press".

### [MAJOR] UX / PRD 355 — Selecting a category with no items removes the category filter, stranding the user
- **Where:** `Frontend/src/pages/ShopPage.tsx:100-144`
- **Defect:** The empty branch (`items.length === 0`) renders only `EmptyStateCard`; the `SegmentedSwitch` category chips
  live inside the success branch at line 126 and therefore unmount.
- **User-visible consequence:** Tap "Name colours" while that category is empty and the page becomes "The shop opens
  soon" with no chips — there is no control to return to "All". The only escape is navigating away from `/shop` and back.
- **Standard violated:** CONTRACT §7.2 "`EmptyStateCard` for empties with **one clear next action**".

### [MAJOR] a11y / PRD 346 — The attendance-dot legend is reachable only via `contextmenu`
- **Where:** `Frontend/src/features/attendance/AttendanceDot.tsx:32-46`, wired at `Frontend/src/pages/GameDetailsShell.tsx:1698`
- **Defect:** `onRequestLegend` is bound to `onContextMenu` only — no `onClick`, no `onTouchStart` timer, and the dot is a
  non-focusable `<span>`. WebKit does not dispatch `contextmenu` for touch, and `.capacitor-app` already sets
  `-webkit-touch-callout: none` / `user-select: none` (`Frontend/src/styles/keyboard/capacitor-shell.css:39-45`).
- **User-visible consequence:** On iOS (and for any keyboard-only user on web) the legend explaining what the green /
  amber / hollow / grey dots mean can never be opened. The dots each carry sr-only text, so this is a comprehension gap
  rather than a data gap — but the affordance the code advertises does not exist on the primary platform.
- **Standard violated:** CONTRACT §7.1 "explicit roles and labels on every control"; PRD 346 UX.

### [MAJOR] a11y / PRD 345 — `role="radiogroup"` with no arrow-key support and no roving tabindex
- **Where:** `Frontend/src/features/game-series/SeriesScopeSheet.tsx:99-123`
- **Defect:** Four `role="radio"` buttons inside a `role="radiogroup"`, each independently tabbable, with no `onKeyDown`.
  `Frontend/src/components/pairs/PairSortChips.tsx:44-62` in the same programme implements the correct roving-focus
  pattern, so the house precedent exists and was not followed.
- **User-visible consequence:** A screen-reader user is told this is a radio group, presses Arrow Down as the role
  promises, and nothing happens; they must Tab through every option, and every option is announced as a separate tab stop.
- **Standard violated:** PRD 345 "Cadence and scope switches support arrow keys"; CONTRACT §7.1.

### [MAJOR] a11y — Hand-rolled popover menus cannot be dismissed by tapping outside or pressing Escape
- **Where:** `Frontend/src/features/attendance/AttendanceRosterActions.tsx:45-75`; `Frontend/src/components/live/SpectatorTopBar.tsx:92-133`
- **Defect:** Both render an absolutely-positioned panel behind a boolean, with no outside-click listener, no `keydown`
  Escape handler, no focus management, and (in `SpectatorTopBar`) a `role="menu"`/`role="menuitem"` pair with no arrow-key
  navigation. `AttendanceRosterActions` additionally sets `aria-expanded` without `aria-haspopup`.
- **User-visible consequence:** On a phone, opening the roster "⋮" menu and then tapping a player row leaves the menu
  floating over the roster until you find the trigger again; a keyboard user has no Escape route and is dropped into a
  menu whose advertised arrow-key model does not work.
- **Standard violated:** CONTRACT §7.1 accessibility; CONTRACT §7.2 (the app has `Drawer`/`Dialog` primitives for exactly
  this).

### [MAJOR] mobile — Cost share rows collapse the player name at 375 px
- **Where:** `Frontend/src/components/GameDetails/cost/GameCostCard.tsx:243-286`
- **Defect:** One flex row holds avatar + `flex-1 truncate` name + amount + `CostStateChip` (`whitespace-nowrap`) + a
  44 px checkbox + a 44 px edit button. On a 375 px viewport the card's inner width is ≈319 px; the fixed-width children
  alone consume ≈240 px in English and more in German ("Als bezahlt markiert").
- **User-visible consequence:** For the organizer — the only role that sees both the checkbox *and* the pencil — names
  truncate to two or three characters, so they cannot tell whose share they are about to edit or mark received.
- **Standard violated:** CONTRACT §7.1 "Mobile first"; §7.1 type and density.

### [MAJOR] states / PRD 348 — Cost card has no loading and no error state
- **Where:** `Frontend/src/components/GameDetails/cost/GameCostCard.tsx:137-139`
- **Defect:** `if (!enabled || isPending || isCostLedgerHidden(summary) || !summary || !summary.currency) return null;`
  collapses "still loading", "request failed" and "deliberately hidden" into the same silent `null`.
- **User-visible consequence:** On a cold open the game page reflows as the Cost card pops in mid-scroll; if the request
  fails (flaky mobile connection) the ledger is silently absent with no retry, and the user has no way to tell "this game
  has no cost split" from "we couldn't load it".
- **Standard violated:** CONTRACT §7.1 "`shimmerBlock` skeletons for loading"; CONTRACT §13 "every element of the UX / UI
  Design section exists: … empty/loading/error states".

### [MINOR] states / PRD 354 — A failed club fetch renders "Club not found"
- **Where:** `Frontend/src/pages/ClubPage.tsx:167-190`
- **Defect:** The only two branches are `isLoading && !club` → skeleton, and `!club` → the not-found `EmptyStateCard`.
  `clubQuery.isError` is never distinguished.
- **User-visible consequence:** A rider on the metro who loses signal opening a shared club link is told the club does not
  exist and offered "Browse other clubs", instead of a retry — and this is the page most likely to be a guest's first
  impression of the app.
- **Standard violated:** CONTRACT §13 error states.

### [MINOR] theme / PRD 355 — Premium badge gold fails contrast in Light theme
- **Where:** `Frontend/src/components/shop/ShopItemCard.tsx:62`; `Frontend/src/components/shop/ShopItemSheet.tsx:143`
- **Defect:** `text-[#b8860b]` at `text-[10px]`/`text-[11px]` on the card's `bg-white` surface measures ≈3.3:1. (The
  `dark:text-[#e5c76b]` counterpart is fine at ≈9.8:1.) These are also raw hex rather than tokens from `tokens.css`.
- **User-visible consequence:** In Light and Classic themes the "Premium" lock badge on gated items is hard to read for
  low-vision users at the exact moment they need to know why the item is unbuyable.
- **Standard violated:** CONTRACT §7.1 "4.5:1 text contrast"; "neutral surfaces from `Frontend/src/styles/tokens.css`".

### [MINOR] a11y / PRD 353 — Recap sport tabs are a `tablist` whose arrow keys are consumed by the viewer
- **Where:** `Frontend/src/components/recap/RecapStoryViewer.tsx:217-241` with the global handler at lines 130-143
- **Defect:** `role="tablist"` / `role="tab"` with no `aria-controls`, no tabpanel and no key handling; meanwhile a
  `window` `keydown` listener maps ArrowLeft/ArrowRight to previous/next slide regardless of focus.
- **User-visible consequence:** A keyboard user who Tabs to the "Padel / Tennis" tab strip and presses Arrow Right
  advances the recap slide instead of moving to the next sport tab.
- **Standard violated:** CONTRACT §7.1 "arrow-key support on segmented controls".

### [MINOR] a11y / PRD 353 — Space is swallowed inside the recap viewer, so buttons can't be activated with it
- **Where:** `Frontend/src/components/recap/RecapStoryViewer.tsx:138-141`
- **Defect:** The global `keydown` handler calls `e.preventDefault()` on `' '` to toggle pause, which suppresses the
  default Space activation of whatever button currently has focus.
- **User-visible consequence:** With focus on "Share recap" or "Save image", pressing Space pauses the reel instead of
  pressing the button. Enter still works, so this is a papercut rather than a lockout.
- **Standard violated:** CONTRACT §7.1 accessibility.

### [MINOR] reduced motion / PRD 352 — Pair row "scroll to my pair" flash uses an ungated `animate-pulse`
- **Where:** `Frontend/src/components/pairs/PairRow.tsx:64`
- **Defect:** `flashing ? 'animate-pulse bg-sky-100 …'` is applied with no `usePrefersReducedMotion()` check, and there is
  no global `@media (prefers-reduced-motion: reduce)` reset in the frontend CSS (the twelve existing blocks are all
  component-scoped).
- **User-visible consequence:** A user who has asked for reduced motion and taps "find my pair" gets an infinitely
  repeating opacity pulse on the highlighted row.
- **Standard violated:** CONTRACT §7.1 "Every motion path must be gated on `usePrefersReducedMotion()`".

### [MINOR] a11y / PRD 347 — "Spot opened" pill is a `role="status"` live region on every card
- **Where:** `Frontend/src/features/spot-opened/SpotOpenedPill.tsx:53-56`
- **Defect:** `role="status"` makes each pill a polite live region. On Find/Home the pill appears on every card whose
  seat opened in the last two hours, and the list is re-rendered on filter changes and socket updates.
- **User-visible consequence:** A screen-reader user scrolling a busy Find list gets "A spot opened 4 minutes ago"
  announced repeatedly out of context. `role="img"` (the pattern `WeatherRiskPill` uses) would give the same name with no
  live-region behaviour.
- **Standard violated:** CONTRACT §7.1 accessibility.

### [MINOR] a11y / PRD 354 — Court tiles rely on `aria-label` on a `<li>` with every child `aria-hidden`
- **Where:** `Frontend/src/components/clubPage/ClubCourtsGrid.tsx:44-70`
- **Defect:** The full label ("Court 3, indoor, artificial grass") is an `aria-label` on a non-interactive `listitem`,
  and all four visible spans are `aria-hidden`. `listitem` naming is author-allowed but NVDA in browse mode reads the
  item's *contents*, not its label.
- **User-visible consequence:** On NVDA the courts section can read as a list of empty items rather than as the court
  descriptions. An `sr-only` span carrying `fullLabel` would be robust across all readers.
- **Standard violated:** PRD 354 "court tiles have full labels".

### [MINOR] RTL — Decorative sweeps and the cloned toggle thumb use physical `translateX`
- **Where:** `Frontend/src/styles/tokens.css` `@keyframes spot-shimmer` (`translateX(-100%) → translateX(100%)`), used by
  `Frontend/src/components/gameCard/GameCardJoinButton.tsx:70`; `Frontend/src/features/game-series/SeriesRepeatSheet.tsx:68`
  (`translate-x-6`/`translate-x-1` in a hand-copied `ToggleSwitch`)
- **Defect:** Neither mirrors under `dir="rtl"`. The shimmer is `aria-hidden` decoration; the toggle is a byte-for-byte
  copy of the existing house `ToggleSwitch` (`Frontend/src/components/ToggleSwitch.tsx:20-27`), so it inherits a
  pre-existing flaw rather than introducing one.
- **User-visible consequence:** In Arabic the join-button sweep runs against the reading direction, and the "keep as
  regular" toggle thumb travels toward the track's trailing edge instead of its leading edge (same as every other toggle
  in the app today, so it is at least internally consistent).
- **Standard violated:** CONTRACT §8.1 logical properties.

### [MINOR] mobile / PRD 354 — Four-up club action row truncates labels at 375 px
- **Where:** `Frontend/src/pages/ClubPage.tsx:481-501` with `ActionButton` at line 517
- **Defect:** `grid grid-flow-col auto-cols-fr` with up to four equal columns and a `truncate` label; at 375 px each
  column is ≈84 px.
- **User-visible consequence:** For a club admin at a bookable club (all four buttons visible), German
  "Wegbeschreibung" renders as "Wegbe…" and "Verwalten"/"Buchen" crowd; the icons carry the meaning, which the PRD's own
  accessibility line says they must not.
- **Standard violated:** CONTRACT §7.1 "Mobile first"; type and density.

### [MINOR] reduced motion — CSS `active:scale-*` press feedback is ungated while Framer `whileTap` is gated
- **Where:** `Frontend/src/components/onboarding/OnboardingFrame.tsx:179`; `Frontend/src/components/onboarding/SportStep.tsx:141`;
  `Frontend/src/components/onboarding/NotificationsStep.tsx:158`; `Frontend/src/components/clubPage/ClubRegularsRow.tsx:45`;
  `Frontend/src/components/recap/ProfileRecapsRow.tsx:81`; `Frontend/src/features/attendance/AttendanceCard.tsx:116,130`;
  `Frontend/src/pages/ClubPage.tsx:392`
- **Defect:** Eight transform-on-press animations written as Tailwind `active:scale-…` with no `motion-reduce:` variant,
  in the same codebase where every `whileTap` (`FollowStep.tsx:191`, `WeatherDayChart.tsx:178,196,257,294`) *is* gated on
  `usePrefersReducedMotion()`.
- **User-visible consequence:** A reduced-motion user still gets scale-jumps on every tap through the whole onboarding
  flow and the club page — including `active:scale-90` on the club hero buttons, which is a 10 % jump.
- **Standard violated:** CONTRACT §7.1.

### [MINOR] a11y / PRD 345 — Per-player "keep as regular" toggle is a 28 px tap target
- **Where:** `Frontend/src/features/game-series/SeriesRepeatSheet.tsx:56-72`
- **Defect:** The `<button role="switch">` is `h-7 w-12` (28 × 48 px) with no padding, despite the comment above it
  asserting "Same visuals, 44 px hit area". The `<li>` around it is 44 px tall but is not the target.
- **User-visible consequence:** In the Repeat sheet's regulars list, the toggle is 16 px short of the minimum on its
  vertical axis, which in a dense list of rows makes mis-taps on the adjacent row likely.
- **Standard violated:** CONTRACT §7.1 "44 px minimum tap targets".

## Systemic patterns

1. **ARIA roles without their interaction model (4 places).** `SeriesScopeSheet` (`radiogroup`, no arrow keys),
   `RecapStoryViewer` (`tablist`, arrow keys stolen), `SpectatorTopBar` (`menu`, no arrow keys, no dismiss),
   `AttendanceRosterActions` (`aria-expanded` popover, no dismiss). A single pass that either (a) adopts the roving-focus
   helper already written in `Frontend/src/components/pairs/PairSortChips.tsx:44-62`, or (b) drops the composite role in
   favour of plain buttons, fixes all four.
   **Related pre-existing gap the PRDs leaned on:** `Frontend/src/components/SegmentedSwitch.tsx:93-112` is the
   contract-mandated segmented control (§7.2) and it renders `role="tablist"`/`role="tab"` with **no** `onKeyDown` and no
   `aria-controls`. It is unmodified by this programme, but PRDs 345, 350, 352 and 355 all claim "arrow-key support on
   segmented controls" and inherit this. It also runs an ungated `whileTap={{scale:0.95}}` and a `layoutId` shared-element
   slide. Worth fixing once in the primitive rather than thirteen times in the features.

2. **`aria-label` used where it removes rather than adds information (2 places).** `ShopItemCard.tsx:40` (button label
   overrides the price pill) and `GameCardPerHeadPrice.tsx:73` (label on a role-less `<span>` is dropped). The correct
   local precedents are `WeatherRiskPill.tsx:111-113` and `AttendanceRailSummary.tsx:36-40`, both of which use
   `role="img"` + `aria-label`.

3. **CSS press-scale not gated on reduced motion (8 places).** Listed above. Adding `motion-reduce:transform-none
   motion-reduce:transition-none` (or a shared `pressScale` class string next to `shimmerBlock`) closes all eight.

4. **Silent `return null` in place of a loading/error state (2 places).** `GameCostCard.tsx:137` and `ClubPage.tsx:171`
   both fold "loading", "failed" and "nothing to show" into one branch. Elsewhere the programme does this well —
   `ShopPage`, `SeriesPage`, `PairLeaderboard`, `InviteFriendsCard`, `LiveNowRail` and `CollectionSection` all carry
   distinct skeleton / empty / error branches.

## Verified good

- **RTL.** Genuinely excellent. `PairAvatars` overlaps with `marginInlineStart`; `AttendanceDot` and
  `AttendanceRailSummary` position with `insetInlineEnd`; `OnboardingProgressBar` fills with
  `origin-[left_center] rtl:origin-[right_center]`; `AttendanceOrganizerStrip` fills from `start-0`; `ClubHeroGallery`
  handles negative RTL `scrollLeft` and pages *logically* on arrow keys; chevrons carry `rtl:rotate-180`;
  `OnboardingFrame` flips both its slide axis and its back-arrow glyph on `i18n.dir()`. Only the four minor items above.
- **Reduced motion.** `CountUpNumber` settles instantly; `LiveScoreCard` drops its `layoutId` entirely; `LiveDot`,
  `LiveScoreDigits`, `ShopRotatingPreview` (hides the pause control, because there is nothing to pause),
  `OnboardingFinishOverlay`, `RecapStoryViewer` (and it adds an explicit **Next** button in reduced motion),
  `ClubHeroGallery` (`behavior: 'auto'`), `SpotOpenedPill`, `WeatherRiskBanner`, `CostStateChip` and `styles/collection.css`
  (`animation: none; display: none`) all have real reduced-motion paths.
- **Colour-plus-text.** The two highest-risk surfaces in the brief are both correct: PRD 346's roster dots carry an
  `sr-only` label *and* differ in shape (check / "?" / hollow ring / filled grey), and PRD 348's payment chips render
  their own visible text label with the icons `aria-hidden`. `ShowsUpTile` exposes the ring gauge as both visible
  percentage text and an `sr-only` value, exactly as PRD 346 requires.
- **Keyboard contract (§7.3).** Every overlay containing an input honours it: `CostShareEditSheet`, `CostSettleSheet`,
  `SeriesRepeatSheet`, `SeriesScopeSheet`, `ShopGiftPickerSheet`, `ShopItemSheet`, `PairSheet`, `RecapShareSheet` all use
  `DrawerContent` (which carries `cap-keyboard-aware-sheet`), `OverlayKeyboardBody` for the scroll body, and a footer
  pinned with `var(--overlay-bottom-inset, 0px)`. No hard-coded insets, and nothing outside
  `Frontend/src/utils/keyboardState.ts` writes `--keyboard-height` or `body.keyboard-visible`. The numeric keypad sheet
  (PRD 348) keeps a real `inputMode="decimal"` input alongside the keypad, so hardware keyboards and screen readers work.
- **`OnboardingFrame`'s footer lift is sound** despite not being an "overlay": `--overlay-bottom-inset` is defined on
  `:root` (`styles/keyboard/variables.css:7`), and because the scroll body is `flex-1` (basis 0) the root stays exactly
  `100dvh`, so the footer's `padding-bottom` genuinely lifts the primary button above the keyboard rather than growing
  the page. See "Not verifiable" below for the caveat.
- **Back button / overlay hygiene.** Every new `Drawer` calls `useBackButtonModal` with a unique id; `Dialog` does it
  internally (`components/ui/Dialog.tsx:29`), so the Radix confirms are covered too.
- **Feature-flag degradation.** `ShopPage` returns `null` before issuing a query; `GameCostCard`, the series pill in
  `GameCardHeaderTags` and `SeriesGameSection` all check their flag before rendering or fetching.
- **Story slides** correctly have no `dark:` variants — they sit on a fixed dark base by PRD 353's design.
- **`SeriesPage`** is the most complete of the new pages: skeleton, error `EmptyStateCard` with retry, ended ribbon,
  dimmed skipped rows with Undo, and three separate section empty states — all four PRD 345 states present.

## Not verifiable without a device

- **`OnboardingFrame` keyboard lift on real Capacitor.** The reasoning above says it works, but it is the only
  `--overlay-bottom-inset` consumer in the app that is *not* inside a `position: fixed`, `cap-keyboard-aware-*` sheet, and
  `.capacitor-app html` is `position: fixed; overflow: hidden` — so if any future step body forces the root past `100dvh`,
  the Continue button goes under the keyboard with no way to scroll to it. Worth one manual pass on the name step on
  iOS and Android.
- **`contextmenu` on iOS WKWebView.** My claim that the attendance-dot legend and the `WeatherRiskPill` tooltip are
  unreachable by long-press rests on WebKit not dispatching `contextmenu` for touch; confirm on a device.
  (`WeatherRiskPill` degrades gracefully — its `role="img"` label already carries everything; `AttendanceDot` does not
  have an alternative path.)
- **Hero text contrast over club photos** (`ClubPage.tsx:244`): white `h1` + `drop-shadow` over a
  `from-black/75 via-black/25` scrim. The scrim is probably sufficient but depends on the operator's uploaded photo.
- **Podium height overflow** (`PairPodium.tsx:18` fixed `HEIGHTS = [124, 108, 96]`): `line-clamp-2` should contain long
  German/Arabic partner names inside the fixed-height cards, but this needs a visual check at 375 px with real names.
