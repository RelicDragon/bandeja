# Plan: Booking UX refactor for create/edit game

Verified against codebase context on 2026-07-09.

Companion docs:

- `PLAN_CLUB_BOOKING_UX.md`
- `PLAN_BOOKTIME_CREATE_GAME.md`
- `PLAN_GAME_BOOKING_MULTI_LINK.md`

This plan supersedes the exposed "time slots / bookings list / skip real court" mental model in the player-facing create and edit flows. It does not change the many-to-many game-booking data model.

The core implementation rule is: **reservation intent is the user-facing source of truth**. Existing technical state such as selected booking IDs, `skipRealCourtBooking`, `hasBookedCourt`, confirmation modals, and CTA labels must be derived from that intent. The UI should not infer the user's intent from selected booking IDs.

## Problem Statement

Players do not understand whether they are creating only a game, reserving a real club court, marking a manual booking, or linking an existing Booktime reservation. The current UI exposes implementation state:

- The mode is inferred from selected booking IDs.
- Existing reservations can appear as a list even when the user did not ask to link one.
- A negative toggle, "Don't book real court", carries an important consequence.
- Multi-court games ask users to select loose courts and times, even though they need a compatible set of courts.
- Create and edit share booking concepts but present them differently.

The practical result is anger and distrust: users cannot tell what will happen when they press Create or Save.

## UX Principles

Use an intent-first flow with progressive disclosure:

1. Ask what the user wants to do with the real court reservation.
2. Show only fields relevant to that choice.
3. Keep the consequence visible in a summary.
4. Validate inline before submit.
5. Treat multiple courts as a bundle, not loose independent choices.
6. Display court attributes (indoor/outdoor, surface) explicitly in bundles.
7. Warn users about club cancellation windows and rules before unlinking/removing reservations.

Reference points:

- NN/g: progressive disclosure reduces complexity by deferring advanced or rarely used features.
- NN/g: good form UX reduces cognitive load through structure, transparency, clarity, and support.
- Baymard: inline validation helps users avoid late, expensive submit-time errors.
- Material Design date/time pickers: date and time controls should support clear, constrained selection.

## Target Mental Model

Introduce one explicit user-facing concept:

### Court reservation

Available choices depend on club, integration, edit state, and entity type.

| Choice | Meaning | Show when |
| --- | --- | --- |
| Reserve court now | The app reserves the required court or courts when creating/saving. | Integrated club/court, connected or connectable |
| Use existing reservation | Link reservation(s) already in the user's club account. | Integrated club with user auth path |
| Game only | Create or update the game without making a real club reservation. | Always, except flows where a court reservation is mandatory |
| Already booked manually | Mark the game as having a real court, but do not use the integration. | Non-integrated or degraded integration |
| Keep current reservation | Preserve linked reservations and schedule. | Edit only, when existing linked reservations exist |

Existing reservations are hidden unless the user chooses **Use existing reservation**.

## Source Of Truth

The refactor should introduce an explicit reservation intent state and use it to drive the old technical state.

Current problem:

- `locationTimeMode` is inferred from `selectedBookingIds`.
- `ReservationsStrip` can render because reservation data exists.
- `skipRealCourtBooking` is a visible negative toggle.
- `hasBookedCourt` leaks into player-facing integrated booking contexts.

Target:

- The user chooses an intent first.
- Components render from that intent.
- Technical state is a projection, not the primary model.

| Intent | Visible UI | Internal projection |
| --- | --- | --- |
| `reserveNow` | Auth gate if needed, then compatible court bundles or single-court slots. | Clear selected booking IDs, use time-slot mode, `skipRealCourtBooking = false`, confirm real booking before create/save. |
| `useExisting` | Reservation picker and selection counter. | Use booking-link mode, require selected booking records, derive schedule from snapshots unless overridden. |
| `gameOnly` | Standard date/time and optional court. | Clear selected booking IDs, no real booking confirm, `hasBookedCourt = false`. |
| `manualBooked` | Standard date/time and court, with manual booked summary. | Clear selected booking IDs, no integration call, `hasBookedCourt = true`. |
| `keepCurrent` | Current reservation summary only. | Edit only; preserve existing linked booking IDs unless user changes action. |

Compatibility note:

- Deep links or existing games may initialize intent from booking IDs.
- After initialization, intent should not be continuously re-derived from booking IDs.
- `deriveLocationTimeMode(selectedBookingIds)` can remain temporarily as a bridge, but it should not decide what the user sees.

## Target Create Flow

Default shape:

1. Club
2. Court reservation intent
3. Date and duration
4. Available court bundle or existing reservation picker
5. Summary
6. Create CTA

Default intent rules:

- Integrated club with bookable courts and connected user: default to `Reserve court now`.
- Integrated club with bookable courts and unconnected user: default to `Reserve court now`, but show the auth gate in that intent.
- Deep link from existing reservation: default to `Use existing reservation` and preselect the linked booking IDs.
- Non-integrated club: default to `Game only`, with `Already booked manually` available.
- If the user explicitly changes intent, do not auto-switch it back because data appears or disappears.

### Reserve court now

For single-court games:

- Show available options as bundles of one court/time.
- Selecting a bundle chooses court, date, time, and duration.

For multi-court games:

- Show required court count: "This game needs 2 courts."
- Show compatible bundles:
  - `18:00-19:30 - Court 1 + Court 2`
  - `19:30-21:00 - Court 3 + Court 4`
- Selecting a bundle writes selected court IDs and selected time.
- Do not ask the user to preselect loose courts and then mentally compare availability.

The CTA should be explicit:

- `Reserve court and create game`
- `Reserve 2 courts and create game`

### Use existing reservation

Before this choice is selected:

- Do not show reservation rows.
- Do not display a booking list as primary UI.
- Optional silent prefetch is acceptable for speed, but visible loading/empty/list states belong inside this intent only.

When selected:

- If not authorized, show a collapsed or expanded `Connect to {club}` section.
- If authorized and reservations exist, show the picker.
- If authorized and none exist, show an empty state:
  - "No reservations found for this date."
  - Offer `Reserve court now` and `Game only`.

For multi-court games:

- The picker should show the required selection count.
- Adjacent bookings can be grouped, but the user-facing copy should explain the bundle:
  - "Select 2 reservations for this game."
  - "Selected reservations cover 18:00-19:30."

The CTA should be:

- `Link reservation and create game`
- `Link 2 reservations and create game`

### Game only

Show standard date/time selection and optional court selection, but no integration reservation list.

The summary must say:

- "No real court reservation will be made."

CTA:

- `Create game only`

### Already booked manually

This replaces naked `hasBookedCourt` usage in integrated-looking contexts.

The summary must say:

- "Game will be marked as booked. No online reservation will be created."

CTA:

- `Create game`

## Target Edit Flow

Edit is not the same as create. Start with the current state and ask what should change.

If the game has linked reservations, default to:

- `Keep current reservation`

This default should be stored as edit action state. It should not be recalculated from `selectedBookingIds` on every render.

Other actions:

- `Change game time only`
- `Use existing reservation`
- `Reserve a new court`
- `Unlink reservation`
- `Game only`

Before save, show a "What will happen" summary:

- Game time changes.
- Reservation links added.
- Reservation links removed.
- Real club reservations are not cancelled automatically.
- New real court reservations will be created, if applicable.
- Manual booked status changes, if applicable.

The save CTA should remain simple, but the summary must carry the consequence.

Policy warning:

- If unlinking or switching to Game Only, explain that this only removes the reservation link from the game.
- The real club reservation remains active unless the user cancels it through the club/provider.
- If the club has `cancellationNoticeHours` or `policyText`, show that policy near the warning so the user understands any cancellation timing rules before leaving the edit flow.

Important edit copy:

- `Unlink reservation` means "remove the link from this game," not "cancel the club reservation."
- `Reserve a new court` means the app will create a new real club reservation on save.
- `Game only` means the game remains scheduled, but no real club reservation is made by the app.

## Multiple Courts

The UI should stop asking users to mentally assemble court availability.

Use `computeBookingSelectionLimits(maxParticipants, playersPerMatch)` as the source of required reservation count.

This should also replace UI decisions based only on `maxParticipants > 4`. A 1v1 format with 4 participants needs 2 reservations/courts, while a 2v2 format with 4 participants needs 1.

For live booking:

- Compute available court bundles from availability rows.
- Each bundle contains:
  - start time
  - end time
  - court IDs
  - court display names
  - optional per-court price quotes
  - total price when all quotes share currency

### Court Bundle Attributes

Include useful metadata on bundle cards using existing fields (`Court.isIndoor`, `Court.surfaceType`, `Court.courtType`) to help players select.

Keep bundle cards compact:

- Always show indoor/outdoor when it helps distinguish courts.
- Show surface or court type only when present or when courts in the bundle differ.
- Do not let metadata compete with the primary decision: time, court names, price, and reservation consequence.

### Smart Fallback Recommendations

If no simultaneous court bundles are available for the requested count and duration:

MVP:

- Show a clean empty state with recommendation actions.
- Suggest alternative times where the required court count is available (e.g. *"Unavailable at 18:00. Try 19:30 instead"*).
- Offer `Game only`, another date, or another duration.

Phase 2:

- Suggest staggered starting times.
- Suggest reducing participant count or required court count.
- Suggest nearby clubs if the app has enough reliable availability data.

For link-existing:

- Use selection limits for minimum and maximum reservation count.
- Derive the game window from selected reservation snapshots.
- Allow override only after a selection exists.

## Information Architecture Changes

### Hide existing bookings unless requested

Current issue: `ReservationsStrip` can appear inside the location/time panel as a list because the app has data. This should become intent-driven.

Target:

- No reservation list in default create flow.
- No reservation list in edit unless the action is `Use existing reservation`.
- Show auth only inside `Reserve court now` or `Use existing reservation`.
- Hide the entire existing-reservation affordance if there are no reservations and the user has not requested it.

### Auth Gate Rules

Inline club authorization can appear inside `Reserve court now` or `Use existing reservation`.

Rules:

- Transitioning `needsBooktimeAuth` to `false` after OTP connection must not clear selected date, duration, time, court, bundle, or selected reservation state.
- Auth loading, success, and failure states belong inside the chosen reservation intent, not as a global modal surprise.
- If auth expires during confirm/save, return the user to the same reservation intent with their in-progress selections preserved where possible.
- If the user chooses `Game only`, do not show the auth gate.

### Replace negative toggle

Current copy:

- "Don't book real court"

Target:

- Positive intent choices.
- If an opt-out preference remains internally, it should not be the primary visible model.

### Replace "Don't select court"

Current copy:

- "Don't select court"

Target:

- "No court yet"
- "Choose later"
- "Game only, no court selected"

## Technical Plan

### New or refined domain types

Add a user-facing reservation intent type:

```ts
type ReservationIntent =
  | 'reserveNow'
  | 'useExisting'
  | 'gameOnly'
  | 'manualBooked'
  | 'keepCurrent';
```

This should live near the shared game booking helpers if it affects create/edit behavior.

Add a projection type so create/edit can convert intent into existing payload/state fields without spreading conditionals through the UI:

```ts
type ReservationIntentProjection = {
  locationTimeMode: 'timeSlots' | 'bookings';
  selectedBookingIds: string[];
  skipRealCourtBooking: boolean;
  hasBookedCourt: boolean;
  requiresBooktimeAuth: boolean;
  opensBooktimeConfirm: boolean;
};
```

Add an internal edit action type if it keeps edit clearer:

```ts
type EditReservationAction =
  | 'keepCurrent'
  | 'changeGameOnly'
  | 'useExisting'
  | 'reserveNew'
  | 'unlink';
```

### New pure helpers

Add or extend helpers with tests:

- `computeRequiredReservationCount(maxParticipants, playersPerMatch)` or an alias around `computeBookingSelectionLimits(maxParticipants, playersPerMatch).min`
- `computeAvailableCourtBundles(availabilityRows, requiredCount, durationMinutes)`
- `resolveInitialReservationIntent(context)`
- `resolveReservationIntentOptions(context)`
- `projectReservationIntentToState(context)`
- `resolveReservationCtaLabel(context)`
- `buildReservationSummary(context)`
- `resolveReservationValidation(context)`

### Availability rows and bundles

Current `useBooktimeTimeOptions` returns time strings. That is not enough for a friendly multi-court picker.

Change the hook or create a sibling hook to expose:

- availability rows per court
- aggregate starts
- available bundles
- loading/error state
- reload

Keep the existing time-string API temporarily for compatibility.

Bundle rules:

- A bundle is valid only when every required court is available for the same start/end window.
- Prefer deterministic ordering by start time, then court display names.
- A single-court booking is still represented as a bundle with one court.
- If no compatible bundle exists, show a clear empty state and offer `Game only` or another date/duration.

### Components

Create small components that can be reused in create and edit:

- `ReservationIntentPicker`
- `ReservationSummaryCard`
- `AvailableCourtBundlePicker`
- `ExistingReservationPicker`
- `ReservationAuthGate`
- `EditReservationActionPicker`
- `EditReservationConsequenceSummary`

Avoid a single giant booking panel that knows everything.

Component ownership:

- Intent picker decides what branch is visible.
- Bundle picker selects court IDs and time.
- Existing reservation picker selects booking IDs and records.
- Summary card explains consequences from resolver output.
- Save/create handlers consume projected state.

## Tiny Commit Plan

Each commit should leave the app working.

1. Add `ReservationIntent`, `EditReservationAction`, and option resolver tests.
2. Add `resolveInitialReservationIntent()` for create deep links, connected clubs, non-integrated clubs, and edit linked games.
3. Add `projectReservationIntentToState()` so intent drives `locationTimeMode`, selected booking IDs, `skipRealCourtBooking`, `hasBookedCourt`, auth, and confirm behavior.
4. Add CTA, validation, and summary resolvers from intent.
5. Add required reservation count helper using `playersPerMatch`, or standardize on `computeBookingSelectionLimits(maxParticipants, playersPerMatch).min`.
6. Replace multi-court UI decisions based only on `maxParticipants > 4` with the shared required-count helper.
7. Add court-bundle computation helper with tests for one-court, two-court, insufficient-court, 1v1 multi-court, and differently available courts.
8. Extend availability code to expose rows without changing existing consumers.
9. Add bundle output to the Booktime time-options hook or a sibling hook.
10. Add i18n copy for reservation intents, summary states, explicit CTAs, empty states, and edit consequences.
11. Replace "Don't book real court" copy with positive intent/summary copy while keeping old behavior.
12. Replace "Don't select court" with "No court yet" copy.
13. Add `ReservationSummaryCard` with static props.
14. Add `ReservationIntentPicker` with static props.
15. Add create-flow intent state, initialized once from current conditions.
16. Keep old selected-booking-derived behavior only as initialization/compatibility bridge.
17. Hide `ReservationsStrip` unless intent is `useExisting`.
18. Move Booktime auth gate under `reserveNow` or `useExisting` intent.
19. Add empty state for `useExisting` when no reservations are found.
20. Add bundle picker for `reserveNow`, initially behind existing court/time selection.
21. Wire bundle selection to selected court IDs and selected time.
22. Make create CTA derive from reservation intent and selected bundle/reservation count.
23. Update create validation to focus the relevant intent section.
24. Feed bundle courts explicitly into the existing confirm modal.
25. Add multi-court create tests for confirmation inputs.
26. Add create behavior tests for hidden reservation list, auth gate visibility, and CTA labels.
27. Add edit reservation action state with `keepCurrent` default.
28. Stop continuously deriving edit action from selected booking IDs.
29. Hide edit reservation picker unless action is `useExisting`.
30. Add edit consequence summary before save.
31. Wire `reserveNew` edit action to existing Booktime confirm flow.
32. Wire `unlink` edit action to existing unlink warning flow.
33. Add edit behavior tests for keep, unlink, use existing, reserve new, and game-only.
34. Remove direct UI dependency on `skipRealCourtBooking` naming.
35. Keep manual opt-out preference migration internally for one release.
36. Remove obsolete visible tabs/list/toggle copy.
37. Update companion docs to mark old exposed bookings list behavior superseded.

## Testing Decisions

Good tests should assert user-visible behavior and payload outcomes, not component internals.

Existing useful coverage:

- `createGameBookingFlow.test.ts`
- `useSaveGameLocationTime.test.ts`
- `syncFormScheduleFromBookings.test.ts`
- `computeBookingSelectionLimits.test.ts`
- `availability.test.ts`
- `timeSlotCellStyles.test.ts`

New tests:

- Court bundle helper tests.
- Reservation intent resolver tests.
- Intent projection tests:
  - `reserveNow` clears selected booking IDs and opens booking confirmation.
  - `useExisting` requires selected booking records and does not open booking confirmation.
  - `gameOnly` clears booking links and keeps `hasBookedCourt` false.
  - `manualBooked` sets `hasBookedCourt` true without integration calls.
  - `keepCurrent` preserves existing linked booking IDs.
- Create flow behavior:
  - existing reservations hidden by default
  - auth gate hidden until relevant intent
  - reserve-now multi-court bundle selects courts/time
  - 1v1 with 4 participants requires 2 court reservations
  - CTA matches consequence
- Edit flow behavior:
  - keep current reservation does not show picker
  - use existing shows picker
  - unlink shows consequence summary
  - reserve new opens confirm with selected bundle

Manual QA:

- Single court integrated, connected.
- Single court integrated, not connected.
- Multi-court integrated, connected.
- Multi-court with no compatible bundle.
- Existing reservations none.
- Existing reservations fewer than required.
- Edit linked game, keep current.
- Edit linked game, unlink.
- Edit linked game, reserve new.
- Non-integrated court manual booked flow.

## Out of Scope

- Backend schema changes.
- A standalone "book a court" product.
- Showing normal users a default global booking management list.
- Cancelling old club reservations automatically when unlinking from a game.
- Reworking club admin schedule UI.
- Changing game-booking many-to-many rules.

## Decisions

- Reservation intent is the source of truth for player-facing booking UI.
- Selected booking IDs may initialize intent, but must not continuously define it.
- Existing reservations are an explicit user-requested mode, not default content.
- Multiple courts are selected as compatible court bundles in reserve-now mode.
- Required court/reservation count comes from `playersPerMatch`, not only participant count.
- Game-only and manual-booked states must be explicit in the summary.
- Edit starts from current reservation state, not a blank create-like flow.
- The final CTA and the summary must always describe the real consequence.
- Court bundles display indoor/outdoor and surface attributes (`Court` fields).
- Unlinking or switching to Game Only warns that the real club reservation remains active and surfaces club cancellation policy copy when available.
- Stale/empty bundle searches show MVP alternate recommendations first; staggered starts and participant-count suggestions are phase 2.
- OTP auth gate connection preserves in-progress selections without reload for both reserve-now and use-existing flows.

## References

- NN/g progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- NN/g cognitive load in forms: https://www.nngroup.com/articles/4-principles-reduce-cognitive-load/
- Baymard inline validation: https://baymard.com/blog/inline-form-validation
- Material Design date pickers: https://m3.material.io/components/date-pickers
- Material Design time pickers: https://m3.material.io/components/time-pickers
