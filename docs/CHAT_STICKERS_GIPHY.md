# Chat stickers & Giphy

Design for first-class stickers and Giphy URL → GIF conversion in game / DM / group / bug chat.

## Goals

- Stickers: dedicated `MessageType.STICKER`, catalog by id (Telegram-style), less pack friction.
- Giphy: paste URL → re-hosted animated media as `IMAGE` (not plain text, not stickers).
- Fit existing stack: createMessage, media upload, outbox, sync (`MESSAGE_CREATED` full row), `MessageBubble`, list preview.

## Stickers vs Giphy

| | Stickers | Giphy |
|---|---|---|
| `MessageType` | `STICKER` | `IMAGE` |
| Canonical payload | `stickerId` | Re-hosted file in `mediaUrls` |
| Source | Official packs (+ personal later) | Pasted Giphy URL (search UI later) |
| Bubble | Transparent sticker layout | Existing `MessageMediaGrid` |
| List preview | Emoji or “Sticker” | “[Media]” / optional “GIF” later |
| Send UX | Tray, tap-to-send | Auto-convert on create when text is Giphy URL |
| Bytes per send | None (reference) | Download once → S3 once |
| Message delete / S3 | **Must not** delete shared catalog objects | Safe to delete message-owned keys |

Do **not** implement stickers as a flag on `IMAGE`.

---

## Locked decisions

| Topic | Decision |
|---|---|
| Stickers type | First-class `STICKER` |
| Giphy allowed | Yes — URL paste → re-host as GIF/`IMAGE` |
| Giphy convert scope | **URL-only** messages (trimmed content matches a single Giphy URL). URL + other text stays text. |
| Giphy fail | Soft fail → keep as normal `TEXT` with the original URL |
| Sticker caption (v1) | No |
| Sticker contexts | All chat contexts that already allow media: `GAME`, `USER`, `GROUP`, `BUG` |
| Pack ownership (v1) | Admin / seed official (`isOfficial`). Personal packs via `#306` (`ownerUserId`, not listed to others). |
| Giphy resolve | Server-side on create (authoritative). Client may pre-detect for UX only. |
| Sticker URL on row | Denormalize `mediaUrls[0]` for sync/old UI, but **identity is `stickerId`** |
| Hotlink Giphy | Never persist Giphy CDN URLs in `mediaUrls` |

---

## Codebase constraints (must respect)

Today (`MessageType`: `TEXT | IMAGE | VOICE | VIDEO | POLL`):

1. **`resolveOutgoingChatMessageType`**: poll → VOICE → VIDEO → any `mediaUrls` ⇒ IMAGE → TEXT. Stickers and Giphy must be inserted into this order explicitly.
2. **Controller strips client `messageType`** except `VOICE` / `VIDEO`. `STICKER` needs the same allowlist treatment as voice/video (or a dedicated create field `stickerId` that implies type).
3. **IMAGE has no media URL allowlist**; voice/video do. Giphy must re-host so we never store arbitrary remote URLs. After re-host, prefer validating chat-media host like voice/video.
4. **Chat image upload**: multer ~32MB; MIME jpeg/png/gif/webp/heic. FE draft gate often **10MB** — align Giphy max with FE or show a clear “too large” path.
5. **Thumbs**: `generateThumbnailUrls` / sharp JPEG thumbs — fine for Giphy still; stickers may skip thumbs or use static frame.
6. **Message delete cleans S3 keys in `mediaUrls` / `thumbnailUrls`**. Shared sticker CDN URLs **must not** live in those arrays if delete would remove the catalog object — see [Storage & delete safety](#storage--delete-safety).
7. **Sync**: `MESSAGE_CREATED` carries full `ChatMessage` (`messageType`, `mediaUrls`, …). Contract package only names event types; FE IndexedDB must learn `STICKER` + `stickerId`.
8. **Outbox**: images = upload blobs then create. Stickers = no upload. Giphy = server work on create (client may show pending text→media transition).
9. **Postgres enum**: split migration — add `STICKER` value, then use it.
10. **No remote fetch / SSRF guards** in chat today — Giphy ingest introduces that surface; must be designed (below).

---

## Stickers

### Data model

```
StickerPack {
  id, slug, title, sport? (Sport enum or null = all),
  locale?, isOfficial, isActive, coverStickerId?, sortOrder,
  createdAt, updatedAt
}

Sticker {
  id, packId, emoji, title?,
  staticUrl, animatedUrl?,  // catalog CDN, not chat uploads/
  width, height, contentHash, sortOrder, isActive
}

UserStickerPrefs {
  userId (PK),
  favorites String[],  // sticker ids, capped e.g. 100
  recent String[],     // sticker ids, capped e.g. 40, MRU
  updatedAt
}
```

**`ChatMessage` additions**

| Field | Notes |
|---|---|
| `stickerId String?` | FK → `Sticker`, set iff `messageType = STICKER` |
| `mediaUrls` | v1: **empty for stickers** (see storage safety). Clients resolve URL from catalog cache or `GET /stickers/:id`. |
| Fallback for dumb clients | Optional denorm `stickerEmoji` on message for list preview without join |

If denormalized URL is required for a release that cannot fetch catalog: store URL in a **non-deleted** field (e.g. `stickerStaticUrl` / Json metadata) that message-delete S3 cleanup **ignores**. Do not put catalog URLs into `mediaUrls`.

### Create API

Preferred shape (mirrors voice/video explicitness):

```json
{
  "chatContextType": "GAME",
  "contextId": "...",
  "messageType": "STICKER",
  "stickerId": "clx...",
  "replyToId": null,
  "clientMutationId": "..."
}
```

Rules:

- `content` empty / ignored for stickers (v1).
- No `mediaUrls` from client for stickers.
- Server loads sticker (+ pack `isActive`), checks sender can write context, writes row.
- Idempotency: same `clientMutationId` as other creates.

**Type resolution precedence** (create):

1. Poll  
2. Explicit `STICKER` + valid `stickerId`  
3. Explicit `VOICE` / `VIDEO` (existing)  
4. Giphy URL-only text → re-host → `IMAGE`  
5. Non-empty `mediaUrls` → `IMAGE`  
6. Else `TEXT`

Conflict: `stickerId` + `mediaUrls` → `400`.

### Formats

| Format | Role |
|---|---|
| WebP static | Default catalog |
| Animated WebP | Motion stickers |
| GIF/PNG | Ingest only → normalize to WebP |
| Lottie | Phase 3+ |

Display size: CSS max ~160–256px; asset intrinsic ~512px max.

### UX

1. Tray: **Recent · Favorites · Packs · Search** (search = local pack index first).
2. Official packs: no install gate.
3. Game chat: sort packs with matching `sport` first, then general.
4. Tap = send; long-press = favorite / pack info.
5. Reduced motion: prefer `staticUrl` when OS/user prefers reduced motion.
6. Reactions / reply / forward: same as other messages; reply preview shows emoji or tiny sticker thumb.

### Storage & delete safety

**Critical:** catalog assets live under a dedicated prefix (e.g. `stickers/packs/...`), never `uploads/chat/originals/`.

On message delete, existing code deletes S3 objects listed in `mediaUrls` / `thumbnailUrls`. Therefore for `STICKER`:

- Keep those arrays **empty**, **or**
- Teach delete path: skip keys under `stickers/` / skip when `messageType === STICKER`.

Prefer empty `mediaUrls` + client catalog cache keyed by `stickerId` (invalidate on pack version if needed).

### Outbox / optimistic

- Optimistic row: `messageType: STICKER`, `stickerId`, local catalog URL for immediate paint.
- No `pendingImageBlob`.
- On ack: replace with server row (`serverSyncSeq`, etc.).
- Offline: can enqueue create with `stickerId` only (no upload); fails only if network/create fails.

### Catalog API

- `GET /stickers/packs?sport=` — list active packs (light: id, title, cover, sport, stickerCount).
- `GET /stickers/packs/:id` — stickers in pack.
- `GET /stickers/me/prefs` / `PUT` — favorites + recent (or update recent on send server-side).
- Optional: `GET /stickers/:id` — single sticker for deep link / old message hydration.

Cache aggressively on FE (IndexedDB or memory + TTL). Pack list is small.

### Stickers — non-goals (v1)

- User-created multi-pack catalogs / Lottie (personal single pack shipped in #306)
- Lottie  
- Paid / gated packs  
- Caption on sticker  
- Treating Giphy results as stickers  

---

## Giphy URL → GIF

### Behavior

When create body is **URL-only** and matches Giphy host patterns → server converts to `IMAGE` with re-hosted bytes.

**Detect (after trim)**

- Entire `content` is one URL (optional wrapping `<>`).
- Host allowlist: `giphy.com`, `www.giphy.com`, `media.giphy.com`, `mediaN.giphy.com`, `i.giphy.com`, `i1.giphy.com`, …

**Not converted**

- URL embedded in a longer sentence  
- Multiple URLs  
- Non-allowlisted GIF hosts (Tenor etc. = out of scope unless added later)

### Server pipeline

```
detect URL-only Giphy
  → resolve media URL (API or path rewrite to media.giphy.com …/giphy.gif)
  → SSRF-safe fetch (below)
  → validate magic bytes + size + dimensions
  → ImageProcessor / chat image path → S3 originals (+ JPEG thumb)
  → create IMAGE message, content = null (or empty)
  → sync as normal IMAGE
```

Client optional: if paste looks like Giphy, show “Sending GIF…” pending state; still rely on server for authority.

### SSRF & abuse controls (new surface)

| Control | Rule |
|---|---|
| Host allowlist | Only Giphy hosts after redirect resolution |
| Redirects | Max 3; each hop must stay on allowlist |
| Protocols | `https` only |
| Timeout | e.g. 5–8s |
| Max bytes | Align with chat image (prefer FE 10MB UX; hard cap ≤ multer limit) |
| Content-type / magic | `image/gif`, `image/webp`, `image/png`, `image/jpeg` only |
| Rate limit | Per-user Giphy ingest (e.g. N/min) separate from normal send |
| No private IPs | Block link-local / RFC1918 if DNS resolves there |

Do **not** fetch arbitrary user URLs — only allowlisted Giphy patterns.

### Failure & UX

| Case | Result |
|---|---|
| Resolve/fetch/validate fail | `TEXT` message with original URL (200 create) |
| Oversize | Prefer soft fail to text; optional `400` with code if client preflighted |
| Offline client | Outbox sends text URL; if server later converts, sync updates type/urls — **or** client waits online and server converts on create (preferred: convert only at create time; no rewrite of old text) |

**Idempotency:** conversion happens inside create; same `clientMutationId` returns same message (converted or text).

### Thumbs & animation

- Store original animated file in originals.
- Thumb = static JPEG first frame (existing sharp path) — acceptable for list/grid.
- Bubble: existing grid already shows `<img>`; browsers animate GIF/WebP. Verify WebP animation on iOS WKWebView / Capacitor before preferring WebP storage.

### Giphy search UI (later)

Attach-menu search via Giphy API → user picks → client uploads returned file through **existing** `uploadChatImage` → normal `IMAGE` create (no paste detector needed). Paste path remains for shared links.

**Shipped (#304):** Composer attach → GIF sheet. Backend proxies `GET /giphy/search|trending` (API key server-side). Pick calls `POST /giphy/import` (SSRF-safe re-host into chat media) then normal `IMAGE` outbox create. Without `GIPHY_API_KEY`, attach entry is hidden; paste path unchanged.

---

## Client surfaces checklist

| Surface | Sticker | Giphy→IMAGE |
|---|---|---|
| `MessageBubble` | New branch; not `MessageMediaGrid` / gallery | Existing media grid |
| Fullscreen gallery | Exclude stickers | Include |
| List / `[TYPE:MEDIA]` preview | New `[TYPE:STICKER]` or emoji | Existing media (optional GIF tag) |
| Push / local notifications | “Sticker” / emoji | Media |
| Search messages | Match pack title / emoji if indexed | Media placeholder |
| Auto-translate | Skip (no text) | Skip if no caption |
| Report message | Allowed | Allowed |
| Forward (if any) | Forward `stickerId`, not bytes | Forward media urls |

---

## Phased delivery

### P0 — Giphy paste (smallest user-visible win)

- Server URL-only detector + SSRF-safe fetch + re-host + `IMAGE`
- Soft fail → text
- Rate limit + size cap
- UI test plan: URL-only GIF; URL+text stays text; fail keeps link
- No schema enum change

### P1 — Stickers foundation

- Split migration: `MessageType.STICKER` + `stickerId` + pack tables
- Seed 1–2 official packs (static WebP)
- Create allowlist + resolver precedence
- Delete path safe (empty `mediaUrls`)
- FE tray (recent/favorites/packs) + bubble + preview + outbox
- Prefs API
- UI test plan: send, favorite, reply-to-sticker, delete message (catalog intact)

### P2 — Polish

- Animated WebP stickers
- Sport-prioritized packs
- Reduced-motion static fallback
- Tray search
- Align FE/BE image size limits documentation

### P3 — Expansion

- Personal “Save as sticker” — **shipped (#306)**
  - `StickerPack.ownerUserId` + `isOfficial=false` private pack (`personal-{userId}`)
  - `POST /stickers/me/from-message` from eligible chat `IMAGE` (PNG/WebP/GIF + alpha → normalize WebP ≤512)
  - Catalog list/detail owner-scoped for personal packs; `assertSendableSticker` owner-only for personal
  - Storage under `uploads/stickers/packs/personal-…`; message delete never removes catalog objects (same as official)
  - Soft-deactivate (`DELETE /stickers/me/:stickerId`) keeps row/S3 for historical hydrate
- Giphy search sheet
- Tenor (same ingest pattern, new allowlist)
- Lottie (only with renderer budget)

---

## Official pack seed (#305) — locked (AFK)

Issue: https://github.com/RelicDragon/bandeja/issues/305 (AFK, not HITL).

| Decision | Choice |
|---|---|
| Ownership | AFK agent ships placeholders — no designer gate |
| Asset source | Repo-bundled under `Backend/assets/stickers/{packSlug}/` |
| Art style | Emoji on transparent/simple canvas ~512² WebP |
| Packs | `reactions` (general, 16) + `padel` (`sport=PADEL`, 16); Fluent UI Emoji 3D (MIT) |
| Animated | Mix: ~1–2 animated in `reactions`, ~1–2 in `padel`; rest static |
| Generate vs seed | `npm run generate:sticker-assets` writes/commits binaries; `npm run seed:sticker-packs` upserts only |
| Upload | Upload when AWS works; `--skip-upload` for CI/local |
| S3 keys | `uploads/stickers/packs/{packSlug}/{stickerSlug}.webp` (catalog prefix; never chat originals) |
| Sticker identity | Add `Sticker.slug` + `@@unique([packId, slug])` |
| Re-seed | Upsert by slug; re-upload on `contentHash` change; removed → `isActive=false` |
| Catalog reads | No auto-ensure on list/get — seed script only |
| Inactive hydrate | `GET` by id returns inactive with `isActive: false`; tray active-only |
| Legacy code | Remove runtime Sharp SVG generation from seed path once assets committed |

---

## Migration order

1. **P0 Giphy** — no enum change; ship independently.  
2. Migration A: `ALTER TYPE … ADD VALUE 'STICKER'`.  
3. Migration B: `StickerPack` / `Sticker` / `UserStickerPrefs` + `ChatMessage.stickerId`.  
4. Deploy API that accepts `STICKER` before old mobile clients need it (unknown type: show emoji/placeholder, not crash).  
5. FE release with picker + bubble.

Old clients that ignore unknown `messageType`: show empty or fallback from `stickerEmoji` / generic “Sticker” if we denorm emoji on the row.

---

## Testing

### Backend

- Resolver unit tests: sticker / giphy / image / text precedence and conflicts  
- Giphy: allowlist, redirect escape attempts, oversize, non-image body, timeout  
- Sticker create: inactive pack, missing id, + mediaUrls conflict  
- Message delete does not remove `stickers/` objects  

### FE

- Optimistic sticker send / offline retry  
- Bubble layout + reduced motion  
- Giphy pending → IMAGE; fail → text  

### UI test plan (`docs/UI_TEST_PLAN.md`)

Add `CH-` rows when shipping each phase (happy path + fail/edge).

---

## Open decisions (remaining)

| Topic | Options | Recommendation |
|---|---|---|
| Giphy API key vs CDN rewrite only | API more reliable for page URLs; CDN rewrite for `media.giphy.com` direct | API when key available; rewrite for direct media links |
| Persist converted format | Keep GIF vs transcode animated WebP | Keep GIF if Capacitor animates reliably; else WebP after device QA |
| Sticker denorm emoji on message | Yes / no | **Yes** — cheap preview for old clients & list without join |
| Recent list write | Client PUT vs server bump on send | **Server bump on send** + client optimistic reorder |
| Max stickers per pack / packs total | Product caps | Start small (e.g. ≤80 stickers/pack, ≤20 packs) |

---

## Touch points (code)

| Area | Change |
|---|---|
| `schema.prisma` | Enum + sticker models + `stickerId` |
| `resolveOutgoingChatMessageType.ts` | Precedence |
| `chat.controller.ts` `createMessage` | Allow `STICKER` / `stickerId` |
| `message.service.ts` | Giphy ingest; sticker create; delete skip catalog |
| New `services/stickers/*`, `services/giphyIngest/*` | Catalog + SSRF fetch |
| `media.controller` / ImageProcessor | Reuse for Giphy bytes (internal, not public URL upload) |
| `lastMessagePreview.service.ts` + FE `messagePreview.ts` | Sticker tag |
| `MessageBubble.tsx` | STICKER branch |
| `MessageInput` + outbox / `chatSendService` | Sticker send; no blob |
| FE `MessageType` + IndexedDB putMessage | New fields |
| `docs/UI_TEST_PLAN.md` | CH- rows |

---

## Non-goals

- Hotlinking Giphy in `mediaUrls`
- Stickers as `IMAGE` + convention
- Fetching arbitrary non-Giphy URLs on paste
- Discord-style paid sticker walls
- Telegram required “install pack” for official packs
- Rewriting historical text messages that contain Giphy links
