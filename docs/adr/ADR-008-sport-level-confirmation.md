# Sport Level Confirmation (per-sport + PADEL user mirror)

Competitive level confirmation is per sport on `UserSportProfile` (`approvedLevel`, `approvedById`, `approvedWhen`). Training confirmation writes only that game’s sport. Legacy `User.approved*` columns remain as a denormalized **PADEL-only** mirror so older clients that only read top-level user fields still show padel confirmation correctly; non-padel sports are not mirrored there.

Existing `User.approvedLevel = true` rows migrate onto the PADEL sport profile. Sport-scoped API projections put that sport’s confirmation on top-level `approved*` the same way they already project level. Badge/avatar checkmarks use the same sport as the level shown. Undo training and other level-change paths keep today’s confirmation rules (no clear on undo / self-edit); behavior is only sport-separated, not redesigned.

## Considered Options

- Drop `User.approved*` in the same release and rely on JSON projection only — rejected while old FE may still talk to new BE.
- Project top-level `approved*` from primarySport always — rejected; padel mirror matches historical clients and migrated data.
- Clear confirmation on undo or self-serve level edits — rejected; keep current rules, sport-scoped only.

## Consequences

- Slim Prisma selects that load `sportProfiles` without confirmation columns must not treat missing `approvedLevel` as `false` for PADEL — fall back to `User.approved*`.
- Find cards and other projected game payloads must select confirmation fields on sport profiles so non-padel sports project correctly.
- Unprojected `USER_SELECT_FIELDS` payloads keep returning the PADEL mirror on top-level `approvedLevel` for older clients.
