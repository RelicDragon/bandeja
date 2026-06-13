# Booking link authorization (FE reference)

`PATCH /games/:id/bookings` and `PUT /games/:id/booking-snapshots` require the caller to be **owner or admin** on the target game, or on its **direct parent** game.

## League round games

Round match games use `entityType: LEAGUE` and `parentId` pointing at the season hub (`entityType: LEAGUE_SEASON`). The hub owner/admin may link or unlink bookings on round games without joining each round as a participant.

Backend implementation: `canMutateGameBookings` → `hasParentGamePermission` with roles `[OWNER, ADMIN]` (one parent hop only).

## Global admin

Users with `isAdmin` bypass participant checks (same as other game mutations).
