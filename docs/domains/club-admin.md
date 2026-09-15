# Club admin

Users with `clubAdminClubs`. FAB entry. Shell: `Frontend/src/clubAdmin/ClubManagementApp.tsx` under `/my-clubs/*`.

| Route | Page |
|-------|------|
| `/my-clubs` | Club picker (`MyClubsPage`, search, infinite) |
| `/my-clubs/:clubId` | Dashboard — today stats, conflicts |
| `/my-clubs/:clubId/schedule` | Grid: block slot (hold + reason), edit hold, cancel game on slot (optional DM preview), clear court. External sync status when integrated |
| `/my-clubs/:clubId/reservations` | Reservations infinite list |
| `/my-clubs/:clubId/courts` | Courts CRUD |
| `/my-clubs/:clubId/settings` | Cancellation notice hours, integration flags |

Holds are occupancy `kind: 'hold'` (`CourtOccupancyService` + `clubAdminSchedule.service.ts`). View-as-player modal. First-time admin coach marks.

BE: `/club-admin`.
