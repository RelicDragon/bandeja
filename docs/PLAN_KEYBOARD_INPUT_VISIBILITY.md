# PLAN: Reliable Keyboard Input Visibility (iOS/Android Capacitor)

## Goal

Ensure focused controls (`input`, `textarea`, `contenteditable`) are always fully visible above the software keyboard across page forms and modal dialogs in Capacitor apps, while preserving the exact current layout when keyboard is hidden.

## Non-Goals

- Do not change desktop/web behavior outside Capacitor.
- Do not alter existing GameChat behavior unless needed for shared utilities later.
- Do not redesign page layouts; only add keyboard-aware adjustments when keyboard is visible.

## Current Baseline

- Global keyboard state exists in `setupCapacitor`:
  - toggles `body.keyboard-visible`
  - updates `--keyboard-height`
  - tracks focused `input/textarea`
- GameChat works because it uses explicit keyboard-height offset and dedicated CSS.
- CreateGame/GameDetails and many modal forms still rely on generic scrolling and can be covered by keyboard.

## Reliability Strategy

1. Introduce a shared keyboard-awareness layer that works with explicit scroll containers.
2. Compute visibility using `visualViewport` + focused element rect and scroll only the target container.
3. Apply keyboard-only bottom inset/padding on affected containers.
4. Keep all default (keyboard-hidden) layout values unchanged.
5. Roll out first to high-impact pages (`CreateGame`, `GameDetails`) and dialog content.

## Implementation Design

### 1) Shared hook: `useKeyboardAwareFocus`

- Purpose:
  - Track active editable control inside a container.
  - Ensure focused control remains above keyboard edge.
  - Re-run on keyboard show/resize and focus changes.
- Inputs:
  - `containerRef`
  - `enabled` (default true)
  - `extraGapPx` (default 12-20)
  - optional `onlyInCapacitor` guard
- Internal behavior:
  - Listen to `focusin` / `focusout` on document.
  - Treat as editable:
    - `INPUT`
    - `TEXTAREA`
    - `[contenteditable="true"]`
  - Use `window.visualViewport?.height` as primary visible bottom boundary.
  - Determine overlap:
    - if `activeRect.bottom + extraGap > visibleBottom`, scroll container by delta.
  - Re-evaluate on:
    - `keyboardWillShow`
    - `keyboardDidShow`
    - `visualViewport.resize`
    - `visualViewport.scroll`
  - On hide:
    - clear temporary state.

### 2) Shared wrapper: `KeyboardAwareScrollArea`

- Purpose:
  - Centralized keyboard-visible padding/inset behavior for scrollable containers.
- Props:
  - `className`
  - `containerRef` (optional external ref)
  - `baseBottomInset` (default `env(safe-area-inset-bottom)`)
  - `extraKeyboardGapPx`
  - `enabled`
- Behavior:
  - Keyboard hidden: render exactly current layout.
  - Keyboard visible: increase bottom padding:
    - `calc(baseBottomInset + var(--keyboard-height) + extraGap)`
  - Attach `useKeyboardAwareFocus` to same container.

### 3) Modal support

- Add a keyboard-aware class/prop path in shared `Dialog` content.
- For modal bodies with inputs:
  - ensure inner scroll region exists:
    - `flex-1 min-h-0 overflow-y-auto`
  - attach keyboard-aware behavior to modal body container.
- Keep centered look when keyboard hidden.
- Switch to keyboard-anchored layout only while keyboard is visible (mobile/capacitor).

## File-by-File Checklist

### New files

- [ ] `Frontend/src/hooks/useKeyboardAwareFocus.ts`
  - [ ] Implement focused-editable tracking.
  - [ ] Add viewport-overlap scroll correction logic.
  - [ ] Add listeners and cleanup (`focusin/out`, `visualViewport`).
  - [ ] Type-safe guards for HTMLElement and container ownership.

- [ ] `Frontend/src/components/keyboard/KeyboardAwareScrollArea.tsx`
  - [ ] Wrap scroll area and preserve existing className behavior.
  - [ ] Apply keyboard-visible bottom padding style.
  - [ ] Wire `useKeyboardAwareFocus`.
  - [ ] Keep behavior gated to Capacitor/mobile.

### Existing files to update

- [ ] `Frontend/src/utils/capacitorSetup.ts`
  - [ ] Expand focus target support to `contenteditable` (not only input/textarea).
  - [ ] Keep `--keyboard-height` and `keyboard-visible` logic as source of truth.
  - [ ] Ensure no layout changes are applied when keyboard hidden.

- [ ] `Frontend/src/pages/CreateGame.tsx`
  - [ ] Replace main `overflow-y-auto` block with `KeyboardAwareScrollArea` (or wrap it).
  - [ ] Preserve all current spacing and section order.
  - [ ] Validate comments textarea stays visible while typing long text.

- [ ] `Frontend/src/pages/GameDetailsPage.tsx`
  - [ ] Apply keyboard-aware wrapper on the primary `overflow-y-auto` container path.
  - [ ] Cover both table-view and non-table-view mobile scroll paths.
  - [ ] Keep split/desktop behavior unchanged.

- [ ] `Frontend/src/components/ui/Dialog.tsx`
  - [ ] Add keyboard-aware class hooks for dialog content/body.
  - [ ] Provide optional prop to enable keyboard-aware body scrolling for forms.
  - [ ] Ensure unchanged appearance while keyboard hidden.

- [ ] `Frontend/src/index.css`
  - [ ] Add minimal scoped styles for keyboard-aware containers (avoid broad global side-effects).
  - [ ] Add keyboard-visible variants only under Capacitor classes.
  - [ ] Do not alter GameChat-specific rules.

### Candidate modal/form components to verify (and opt-in if needed)

- [ ] `Frontend/src/components/GameDetails/EditGameInfoModal.tsx`
- [ ] `Frontend/src/components/SetResultModal.tsx`
- [ ] `Frontend/src/components/createGame/*` modal-like selectors (club/court/setup)
- [ ] `Frontend/src/components/GameDetails/UserGameNoteModal.tsx`
- [ ] `Frontend/src/components/marketplace/MarketItemEditForm.tsx`
- [ ] `Frontend/src/components/bugs/BugModal.tsx`

(Apply keyboard-aware modal-body pattern only where inputs exist and overlap is reproducible.)

## Rollout Order

1. Shared primitives (`useKeyboardAwareFocus`, `KeyboardAwareScrollArea`).
2. `CreateGame` page integration.
3. `GameDetailsPage` integration.
4. Shared `Dialog` keyboard-aware body support.
5. Targeted modal opt-ins.
6. Device QA and regressions.

## Device QA Matrix

### iOS (Capacitor)

- [ ] CreateGame: top/middle/bottom inputs + comments textarea.
- [ ] GameDetails edit flows with text fields and textareas.
- [ ] Dialog with bottom input near keyboard edge.
- [ ] Orientation change while keyboard is open.
- [ ] Keyboard hide restores original layout exactly.

### Android (Capacitor)

- [ ] Same scenarios as iOS.
- [ ] Back-button keyboard dismissal.
- [ ] No jitter on repeated focus changes.

## Acceptance Criteria

- Focused control is never obscured by keyboard on iOS/Android Capacitor.
- Hidden-keyboard layout is pixel-equivalent to current behavior.
- No regressions in GameChat composer behavior.
- Desktop and regular web behavior remain unchanged.
