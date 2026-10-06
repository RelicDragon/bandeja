---
id: book-court
audience: [player, organizer, trainer, tournament_creator, admin]
requires: []
related: [create-game, create-training, split-costs, roles, ui-map]
verified_against: [docs/domains/booking.md, docs/domains/create.md, docs/domains/agent.md, Frontend/shared/clubIntegration.ts, Frontend/shared/gameBooking/supportsClubBookingFlow.ts, Frontend/shared/gameBooking/providerCapabilities.ts, Frontend/src/components/createGame/courtPlan/CourtPlanAtClub.tsx, Frontend/src/components/createGame/courtPlan/courtPlanModel.ts, Frontend/src/components/createGame/BooktimeCreateGameConfirmModal.tsx, Frontend/src/components/GameDetails/courts/GameCourtsSection.tsx, Frontend/src/features/court-reservations/courtReservationsModel.ts, Frontend/src/components/booktime/BooktimeBookingRow.tsx, Frontend/src/components/booktime/ClubAvailabilitySheet.tsx, Frontend/src/components/ClubDetailPanel.tsx, Frontend/src/components/ClubBookingBadge.tsx, Frontend/src/pages/Profile.tsx, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/i18n/locales/en/courtReservation.json, Frontend/src/i18n/locales/en/createGame.json, Frontend/src/i18n/locales/en/club.json, Frontend/src/i18n/locales/en/gameDetails.json, Frontend/src/i18n/locales/en/weltner.json, Backend/src/shared/gameBooking/bookingLinkAuthorization.ts, Backend/src/services/agent/tools/slots.tools.ts, Backend/src/services/agent/tools/bookings.tools.ts, Backend/src/services/agent/tools/bookCourt.tools.ts, Backend/src/services/agent/tools/bookingLinks.tools.ts, Backend/src/services/agent/tools/cancelBooking.tools.ts, Backend/src/services/agent/tools/createGameWithBooking.tools.ts]
---
# Book a court

## Goal

Find a free court at a club and reserve it from the app, usually together with a game, so the game shows its courts as reserved. Also: see your reservations, attach one you already have to a game, detach it, or cancel it. Bandeja never charges for courts: you pay the club under its own rules.

## Who can do this

- **Which clubs**: only clubs connected to an online booking system (Booktime, Padeloo, Klikteren, NS Padel or Weltner). They show a "Book in app"{club.bookInApp} badge, and their club page has a "Court availability" section. Each court must also be set up for online booking by the platform. At any other club you reserve by phone or at the desk and only mark the court as reserved in the app.
- **Your club account**: to reserve you need your own account at that club connected in the app. Booktime: phone and code. Padeloo: email and code. Klikteren: email and password. Weltner: save a phone number for that club. NS Padel: no connection, it books under your profile name and phone (both must be filled in).
- **Reserving while creating**: anyone creating a game, training or tournament at a connected club. Bar events, events and league seasons have no court booking.
- **Courts on an existing game** (reserve, link, unlink, mark reserved, change the number of courts): the game's owner and game admins, and for a league fixture the season's owner and admins. Everyone else sees the courts read-only.
- **Cancelling a reservation**: only the person whose club account holds it, and only for Booktime, Padeloo and Klikteren. NS Padel and Weltner reservations can only be cancelled by contacting the club.

To manage a game's courts, create the game yourself or ask its owner to make you a game admin.

## Steps in the UI

### Connect your club account
1. Profile → "Club bookings"{club.booktime.connectedClubsCardTitle} card → "Bookings" → "Integrations" tab, and connect the club. Or open the club page and tap "Connect account".
2. Follow the club's sign-in (code, password or saved phone).

### Reserve a court while creating a game
1. Tap the create button → "Game"{games.entityTypes.GAME} (or Training / Tournament).
2. In "Location & time"{createGame.steps.location} pick the club and the date.
3. Under "Courts"{createGame.courtPlan.courts}, use − / + to set how many courts you need (at most what the player count needs: one court for a 4-player match). Each court starts as "Any court"{createGame.courtPlan.anyCourt}; tap one to pick a specific court and see which are free.
4. Under "At the club?" choose:
   - "Reserve now"{createGame.courtPlan.atClub.reserveNow}: the app reserves the courts when you create the game (only at connected clubs; sign in first if asked).
   - "Already reserved": pick your existing reservations for that day from the list; courts without one are just marked as reserved. If a reservation's time differs, the app asks whether to use the reservation's time.
   - "Not yet": the game is planned with no court reserved. You can reserve later.
5. Pick the start time. Times when a needed court is booked at the club, held by the club or taken by another reserved game cannot be chosen.
6. Tap the main button (it says how many courts it will reserve) and confirm on the review screen. The app reserves each court, then creates the game.

### Start from the club page
Open the club page and use "Court availability": pick a duration and a day, then tap a free slot. It opens game creation with that club, court and time filled in. The app has no button to reserve a court without a game; to reserve now and create the game later, ask the assistant.

### Reserve or fix courts on an existing game (organizer)
1. Open the game. The "Courts"{courtReservation.card.title} card shows each court as "Planned"{courtReservation.slot.planned}, reserved (booked in the club's system, green), "Marked as reserved"{courtReservation.slot.reported} (the organizer says they booked it by phone or at the desk; nothing in the club's system proves it), or reserved with a gap, and a summary such as "All courts reserved".
2. Tap a court:
   - Not reserved yet: "Reserve now"{courtReservation.sheet.action.reserve}, "Link my reservation" (one you already made in your club account) or "Mark as reserved" (you booked by phone).
   - Marked reserved: "Link reservation" or "Mark not reserved".
   - Linked to a reservation: "Verify"{courtReservation.sheet.action.verify} (check it still exists at the club), "Unlink"{courtReservation.sheet.action.unlink}, and for Booktime / Padeloo / Klikteren reservations in your own account "Cancel at the club".
3. If a reservation doesn't cover the whole game, use the card's fill-the-gap button to book the missing time.
4. Use − / + on the card to change the number of courts.

### Change the time of a game with reservations
Tap the game's time or "Change time"{courtReservation.move.title}. For a game with linked reservations or more than one court, a planner shows what happens to each court ("Keep reservation", "Move reservation", "Extend reservation", "Switch court", "Ask the club") and runs the steps. Anything left for you to do appears under "To do at the club".

### See your reservations
Profile → "Club bookings"{club.booktime.connectedClubsCardTitle} card → "Bookings" → "Bookings" tab. Unlinked ones also show on the My tab under "Booked courts". On a reservation:
- "Link to game": attach it to one of your upcoming games (if the times differ the app offers "Update & link", which moves the game).
- "Create"{club.booktime.createGameHere}: create a game on it.
- "Cancel"{club.booktime.cancelBooking} → "Cancel booking?" → "Cancel booking"{club.booktime.cancelConfirmCta}. Not shown for Weltner.

## Settings that matter

- **Number of courts**: the organizer decides, from one up to what the player count needs (one court per 4 players, per 2 for singles); it starts there. Each court is reserved, marked reserved, or planned.
- **"Any court"{createGame.courtPlan.anyCourt}**: with "Reserve now"{createGame.courtPlan.atClub.reserveNow} the app picks a free court for each Any-court slot when it books.
- **Durations**: set by the club's system, usually 60, 90 or 120 minutes (Weltner also 180, up to 30 days ahead).
- **Several courts at once**: if one court fails, Booktime, Padeloo and Klikteren release the ones already booked. NS Padel and Weltner keep what was booked; contact the club to cancel.
- **Unlink vs cancel**: unlinking only detaches the reservation from the game; it stays booked at the club. Cancelling a reservation keeps the game. Deleting a game never cancels its reservations.
- **One reservation, several games**: allowed; the app notes when a reservation is also used by another game.
- **Changes made at the club**: if the club moves or drops a reservation, the game page shows a banner with "Move game" / "Keep game time" or "Reserve again" / "Unlink"{courtReservation.drift.unlink}.
- **Price and payment**: paid to the club, never through Bandeja. Weltner and NS Padel show no price; contact the club.

## Common mistakes

- **No "Reserve now"{createGame.courtPlan.atClub.reserveNow} option**: the club has no online booking, the court isn't set up for it ("No courts set up for online booking yet."), the club's sync is down, or it's a bar event, event or league season.
- **Asked to sign in**: your club account isn't connected, or the sign-in expired ("Booking sign-in expired"); reconnect it.
- **"This court is taken at the club" when saving a new time**: the club's system shows that court booked, usually by someone else. Pick another time or court. Only choose "I booked it myself — save"{gameDetails.courts.clubBusySaveConfirm} if you really reserved it by phone or at the desk: the court is then shown as "Marked as reserved", not as booked. If your club account is connected, the app checks it for you: when the booking is yours it offers to use your own booking and links it (shown as booked); when it isn't in your account it says someone else booked it.
- **A time can't be picked**: a court you need is booked at the club, held by the club, or taken by another reserved game, or not enough courts are free. A time with only a planned (unreserved) game is still allowed.
- **"This slot was just taken—pick another time."**: someone booked it a moment earlier; choose another time or court.
- **No "Courts"{courtReservation.card.title} card or no actions on it**: you are not the owner or a game admin, the game has no club, results have started, or it's a bar event or event.
- **Can't link a reservation**: it's at a different club, not confirmed, booked by someone else's account, or you can't edit the game.
- **No cancel button**: Weltner and NS Padel reservations are cancelled only by the club; the reservation isn't in your account; it's too close to the start ("Cancel at least {{hours}} h before start"); or it is shared with another game.
- **"Another change is in progress"**: a time change for this game is still running; finish it ("Finish it") or wait a few minutes.
- **Club or court can't be changed in "Edit details"**: linked reservations lock them; unlink on the game page first.

## What the assistant can do

- `find_available_slots`: free courts at one club or up to 8 clubs in a city (1 to 4 courts at once). For Booktime / Padeloo / Klikteren clubs it only knows the last synced state, so it never promises a slot is free.
- `book_court`: reserve a found slot, with or without an existing game. NS Padel and Weltner are booked by the server; Booktime, Padeloo and Klikteren are booked by the app on the user's phone when they confirm. Always asks for confirmation.
- `create_game_with_booking`: reserve a slot and create a game, training or tournament on it in one step.
- `list_my_bookings`: upcoming or past reservations; some may only be visible in the app.
- `link_booking_to_game` / `unlink_booking`: attach or detach one of the user's reservations to a game they organize. Unlinking never cancels.
- `cancel_booking`: cancel the user's own Booktime / Padeloo / Klikteren reservation (done by the app). Refuses NS Padel and Weltner and gives the club's phone.
- `cancel_game`: can also cancel the game's reservations if the user asks.

Only in the app: connecting a club account, marking courts as reserved, changing the number of courts or picking courts on a game, verifying a reservation, filling gaps, handling club-side changes, and moving a game's time together with its reservations.
