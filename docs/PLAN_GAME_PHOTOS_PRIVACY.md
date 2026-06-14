# Plan: Game photos privacy refactor

Replace scattered photo visibility rules (ANNOUNCED gate, owner hide during scoring, participant-only API) with one game field and shared permission helpers used on FE and BE.

---

## Migration policy

**Migrations must be created strictly via Prisma CLI** — do not hand-write custom migration SQL files.

```bash
cd Backend
npx prisma migrate dev --name add_forbid_others_photos_view
```

Use `npx prisma migrate dev` (or `npx prisma db push` only for local throwaway dev if the team explicitly allows it). Never add ad-hoc migration files under `prisma/migrations/` without running the CLI.

---

## 1. New game field

**Prisma** (`Game` model):

```prisma
forbidOthersPhotosView Boolean @default(false)
```

- **Default:** `false` (open visibility once other rules pass)
- **UI label:** “Only participants can see photos”
- **Update allowlist:** add to `GAME_UNCHECKED_SCALAR_KEYS` in `Backend/src/services/game/update.service.ts`
- **Who can change:** game OWNER/ADMIN or parent OWNER/ADMIN (`hasParentGamePermission`), not regular participants
- **Types:** `Frontend/src/types/index.ts`; optional on create payload in `CreateGame` (default false is sufficient)

---

## 2. View rule (simple)

**If `resultsStatus === 'FINAL'` and `forbidOthersPhotosView === false` → allow.**  
Anyone who hits list/get/download for that game’s photos gets them. No login, no link, no participant check, no public/private check, no `canUserSeeGame`.

**If `forbidOthersPhotosView === true` → allow only:** direct participant, game admin/owner, parent admin/owner, global admin.

**If `resultsStatus !== 'FINAL'` → deny view** (everyone, including owner).

---

## 3. Permission helpers (shared)

Add `shared/gamePhotos/permissions.ts` (mirrored in `Backend/src/shared/` + `Frontend/shared/`).

```ts
canViewGamePhotos(game, viewer?): boolean
canManageGamePhotos(game, viewer): boolean
canConfigureGamePhotosPrivacy(game, viewer): boolean
```

### `canViewGamePhotos`

```ts
if (game.resultsStatus !== 'FINAL') return false;

if (!game.forbidOthersPhotosView) return true;

if (!viewer?.id) return false;
return (
  viewer.isAdmin === true ||
  isDirectGameParticipant(game, viewer.id) ||
  isUserGameAdminOrOwner(game, viewer.id)
);
```

`viewer` is only needed when `forbidOthersPhotosView === true`.

### `canManageGamePhotos`

```ts
if (!viewer) return false;
return (
  viewer.isAdmin === true ||
  isUserGameAdminOrOwner(game, viewer.id) ||
  isDirectGameParticipant(game, viewer.id)
);
```

Same set as AI results photo generation (`canAccessResultsTelegramActions`).

### `canConfigureGamePhotosPrivacy`

```ts
viewer && (viewer.isAdmin || isUserGameAdminOrOwner(game, viewer.id))
```

**Remove old rules:**

- `GameDetailsShell`: `!(canEdit && resultsStatus !== 'FINAL')` wrapper
- `PhotosSection`: `!user`, `ANNOUNCED` early returns
- `GameCard`: login / `ANNOUNCED` guards on photo preview
- BE: participant-only gate on `GET /games/:id/photos` when open mode

---

## 4. Backend implementation

| Area | Change |
|------|--------|
| `gamePhoto.permissions.ts` | `canRead`: FINAL + !forbidOthers → allow; else participant/admin path. No auth required in open mode |
| `gamePhoto.read.service.ts` | List/get: open mode = serve photos to any request. Restricted mode = 403 unless privileged viewer |
| `gamePhoto.routes.ts` | `GET /` → `optionalAuth` (viewer may be null). POST/PATCH/DELETE stay `authenticate` |
| `read.service.ts` → `projectGamePhotoPayload` | Include `mainPhoto` / `photosCount` when open mode + FINAL; strip when restricted and viewer not allowed |
| `update.service.ts` | Allow patch of `forbidOthersPhotosView`; validate with `canConfigureGamePhotosPrivacy` |
| `prepareResultsArtifactPhoto` | Add `canManageGamePhotos` check |
| `scripts/tests/game-photos.ts` | Open: anonymous list succeeds when FINAL. Restricted: anonymous 403, participant 200 |

**BE upload/delete/set-main:** `canManageGamePhotos` only (drop PLAYING-only and old participant gate on read).

---

## 5. Frontend implementation

### Shared util

`Frontend/shared/gamePhotos/permissions.ts` — same logic as BE.

### `GameDetailsShell.tsx`

```tsx
{canViewGamePhotos(game, user) && (
  <PhotosSection game={game} onGameUpdate={setGame} />
)}
```

Open mode: section renders without login. Upload controls still require `canManageGamePhotos`.

### `PhotosSection.tsx`

| File | Role |
|------|------|
| `PhotosSection.tsx` | Gallery + empty state |
| `PhotosPrivacyToggle.tsx` | Toggle atop section; `canConfigureGamePhotosPrivacy`; PATCH on change |
| `usePhotosSectionUpload.ts` | Gate upload with `canManageGamePhotos` |

- Load photos only when `canViewGamePhotos`
- Upload / set-main only when `canManageGamePhotos`
- When `resultsStatus !== 'FINAL'`, section hidden for everyone — also expose toggle in **`EditGameInfoModal`** so owners can configure before finalize

### `GameCard.tsx`

```tsx
const showPhotoPreview =
  canViewGamePhotos(game, user) &&
  (game.photosCount ?? 0) > 0 &&
  !!getGameMainPhotoId(game) &&
  !!game.mainPhoto?.thumbnailUrl;
```

Same guard on camera count badge (~lines 434–444).

### Other surfaces

| Surface | Action |
|---------|--------|
| Story segments using `game.mainPhoto` | Respect permissions or rely on BE-redacted payload |
| `GameResultsEntryEmbedded` | Use `canManageGamePhotos` for generation eligibility |
| `gamePhotosStore.loadGamePhotos` | Handle 403 silently when section not mounted |

### i18n

`gameDetails.photosPrivacy.*` (en + ru).

### UI test plan (`docs/UI_TEST_PLAN.md`)

| ID | Case |
|----|------|
| GD-06a | FINAL + forbid off → anonymous `GET /photos` returns list |
| GD-06b | FINAL + forbid off → PhotosSection + GameCard thumb without login |
| GD-06c | FINAL + forbid on → anonymous/stranger denied; participant sees gallery |
| GD-06d | not FINAL → nobody sees photos (any viewer) |
| GD-06e | Owner toggles forbid setting |
| GD-06f | Upload/set-main: participant/admin only |

---

## 6. Permission matrix

| | FINAL + forbid off | FINAL + forbid on | not FINAL |
|--|-------------------|-------------------|-----------|
| Anyone (no auth) | **allow** | deny | deny |
| Participant | allow | allow | deny |
| Admin/owner (game or parent) | allow | allow | deny |

Upload / set main / AI photo: `canManageGamePhotos` only (auth required).

Toggle `forbidOthersPhotosView`: owner/admin of game or parent only.

---

## 7. Implementation order

1. Schema (Prisma CLI migrate) + types + shared permissions module + unit tests
2. BE permissions + read redaction + optionalAuth on GET photos
3. BE update endpoint + `game-photos.ts` test script
4. FE shared util + GameCard + GameDetailsShell + PhotosSection
5. PhotosPrivacyToggle + EditGameInfo fallback
6. UI test plan rows + manual QA (league child games: parent admin vs parent participant)

---

## 8. Open decisions

1. **Upload before `FINAL`?** View is FINAL-only; recommended: participants can still upload during the game (gallery hidden until finalize).
2. **Toggle when `!FINAL`:** EditGameInfo only, or always-visible admin strip above future gallery slot?
3. **Parent regular participants excluded when forbid on** — intentional for league round games?

---

## 9. Files checklist

**Backend:** `schema.prisma`, `gamePhoto.permissions.ts`, `gamePhoto.read/create/update/delete.service.ts`, `gamePhoto.routes.ts`, `read.service.ts`, `update.service.ts`, `game.controller.ts`, `scripts/tests/game-photos.ts`

**Shared:** `shared/gamePhotos/permissions.ts` (+ tests)

**Frontend:** `types/index.ts`, `GameDetailsShell.tsx`, `PhotosSection.tsx`, `PhotosPrivacyToggle.tsx`, `GameCard.tsx`, `gameResultsArtifacts.util.ts`, `EditGameInfoModal.tsx`, i18n, `docs/UI_TEST_PLAN.md`
