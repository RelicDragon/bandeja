# Padel Spot Android research

Updated 2026-09-21: the user supplied the Android XAPK, and decompilation is now complete. The earlier download blocker is resolved.

- [Full findings and implementation design](/Users/relic/Projects/ThePadel/Decomp/PadelSpot/FINDINGS.md)
- [Recovered API contracts](/Users/relic/Projects/ThePadel/Decomp/PadelSpot/api.json)
- [Authentication analysis](/Users/relic/Projects/ThePadel/Decomp/PadelSpot/AUTH-FINDINGS.md)
- [Booking UI and rule analysis](/Users/relic/Projects/ThePadel/Decomp/PadelSpot/UI-BOOKING-FINDINGS.md)
- [Existing BookTime/Weltner implementation seams](./padelpotvrda-existing-integration-analysis.md)
- [Module index](/Users/relic/Projects/ThePadel/Decomp/PadelSpot/module-index.json)

## Decision

Add a distinct `PADELPOTVRDA` provider. Reuse BookTime's real-account connection and live booking-list experience, Weltner's exact availability and durable submission handling, and a narrow backend-only Supabase adapter. Do not copy either provider wholesale.

The supplied package is `com.lukaspideras.padelspot`, version 1.0.4 (26), Expo SDK 54 / React Native with Hermes v96. Its signature validates and matches the package/certificate association on [the official domain](https://padelpotvrda.com/.well-known/assetlinks.json). Recovered 24,719 Hermes functions and split the pseudocode into 2,573 indexed modules. JADX completed with 56 errors; affected native methods remain partial. Generated pseudocode is not original or runnable source.

## Verified from player code

- Email/password account login and email verification; player Supabase access/refresh session, not a saved-phone guest flow.
- Active courts query and duration-specific `list_availability` returning start strings.
- Player `create_reservation`, `cancel_reservation`, `list_reservations_mine`, and `list_my_user_discounts` operations.
- Player duration constants `[60,120]`; staff constants also include 90. Do not use shared staff error wording as player capability evidence.
- Same-day confirmation opens a call modal rather than sending a reservation create in this build.
- My reservations combines owned bookings with joined-party reservations. Visibility alone is not booking ownership.
- Some upstream failures become empty/undefined data in their client; our connector must retain error states.
- Creation is followed by metadata lookup; retain a successful booking ID before any enrichment failure can trigger a duplicate.

## Implementation slices

1. Capture sanitized authenticated read fixtures and verify current rules/court IDs.
2. Build encrypted player connections, refresh handling and exact availability browsing.
3. Add durable create attempts, authoritative game links and recovery after a failed game save.
4. Add owned booking lists and explicit cancellation with uncertainty handling; support rebooking after verified cancellation.
5. Add the named migration, Admin mapping, focused serialized checks, updated booking/UI docs and designated live validation before enabling writes.

No application code, database, production configuration or booking state was changed. No app was installed or run. These are static findings from build 26; current backend permissions, pricing and same-day request behavior still need verification with a legitimate player account.

## Preserved earlier website evidence

Public Next.js HTML/JS/CSS, originating URLs and hashes remain in `/Users/relic/Downloads/padelpotvrda-research-2026-09-21/manifest.json`. The supplied `/app/` page is a store landing page; `/` redirects to the staff console. Anonymous read-only checks found public club branding, an empty active-court list, and permission denial on `get_club_config`. An empty anonymous list does not mean there are no courts. No privilege escalation or staff RPC write was attempted. The current website includes same-day call-request staff functions not established by the older Android player's contract.
