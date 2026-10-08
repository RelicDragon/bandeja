# Premium appearance — themes, name styles

Premium members (`User.isPremium`) get three cosmetic levers. Classic users never see a member's theme *applied to their app*; they do see it as a public showcase (profile backdrop, share art) and a member's *name style* (public identity), unless `showPremiumStatus` is off.

| Lever | Field | Who sees it |
|-------|-------|-------------|
| App theme (app-wide) | `User.mainTheme` (`MainTheme`) | The member only |
| Theme showcase (profile backdrop, share art) | `mainTheme` via `publicMemberTheme` | Everyone, gated by `showsPremiumStatus(user)` |
| Name style | `User.premiumNameStyle` (`PremiumNameStyle`) | Everyone, gated by `showsPremiumStatus(user)` |
| Animated avatar | `User.avatarAnimated` (+ derived tiny) | Everyone, gated by `showsPremiumStatus(user)` |
| Status visibility | `User.showPremiumStatus` | — |

Old store builds ignore unknown values: a `mainTheme` they do not know renders Classic, a missing `premiumNameStyle` renders `gold`. Never remove or rename enum values.

## Themes (`MainTheme`)

`classic` is the non-member look. Every other value is a **member theme** and requires `isPremium` (backend 403 otherwise).

| id | Name | Chrome (light app / dark app) | Mood |
|----|------|-------------------------------|------|
| `premium` | Obsidian Gold | dark / dark | The original: obsidian stone, gold leaf |
| `spring` | Spring Meadow | light / dark (dusk) | Pale sky, blossom, swallows gliding across the header |
| `cyberpunk` | Neon District | dark / dark | Night city, magenta + cyan neon, scanlines, perspective grid |
| `steampunk` | Brass Works | dark / dark | Riveted brass and copper, slow meshing gears, sepia paper |
| `woodstone` | Wood & Stone | dark / dark | Walnut grain header, slate neutrals, moss accent |
| `ocean` | Deep Tide | dark / dark | Abyss navy, bioluminescent teal, slow wave caustics |
| `nordic` | Nordic Frost | light / dark (polar night) | Snow, pine silhouettes, faint aurora |
| `alpine` | Alpine Valley | light / dark (alpenglow dusk) | Mountains, meadows, forests, lakes; warm |
| `summer` | Summer Coast | light / dark (summer night) | Sea, sand, beach; hot |

### DOM contract

All member themes share the existing Premium structure, so layout code is written once:

- `html.premium-theme` + `html[data-member-theme="<id>"]` while a member theme is active.
- `html.premium-navigation` only while the header chrome is **dark** (drives the light status-bar text). Light chromes leave it off.
- Shell/header/tab-bar/chat classes are unchanged: `.premium-shell`, `.premium-header`, `.premium-header-stone` (art backdrop, contains `.premium-header-stone-edges` and `.member-theme-art` with four empty `<i>` slots for theme sprites), `.premium-brand`, `.premium-tab-bar`, `.premium-tab`, `.premium-chat`.
- Crest (`MemberCrest`): Obsidian Gold renders `img.member-crest`; every other theme renders `span.member-crest.member-crest--mask` (`::before` = silhouette mask filled `--mt-brand-plate`, `::after` = line mask filled `--mt-brand-fill`). The header lock-up is `.premium-brand > .member-crest + .premium-brand-type > (.premium-brand-name, .premium-brand-tier > .premium-brand-dash ×2)`.
- Loader (`MemberLoading`, also written by the `index.html` boot script so cold start never flashes Classic): `.member-loading.member-loading--screen|--inline > .member-loading-backdrop + .member-loading-art (4 empty <i>) + .member-loading-mark.animate-splash-logo > (.member-crest.member-loading-crest + span.member-loading-glint)`, then an optional `p.member-loading-label`. `--screen` is the full-screen cold-start loader (backdrop + art visible); `--inline` (in-page `Loading` fallbacks) shows only the crest and label. Themes style `[data-member-theme='<id>'] .member-loading …`; the default motion is the classic logo wobble, which a theme may replace on `.member-loading-mark`.
- Arrival gate (`utils/memberThemeArrival.ts`): `html.member-theme-arrival` is added when a member theme is first applied in a session (cold start, theme change, foreground after > 10 min in background) and removed 1600 ms after a member header is on screen (the countdown waits for the header, so a long cold-start loader does not eat it). One-shot header "arrival" animations must be scoped `html.member-theme-arrival[data-member-theme='<id>'] …` and finish within 1600 ms; header remounts (e.g. leaving a full-screen thread) never replay them.
- Theme art lives in `Frontend/src/styles/themes/<id>.css`. Tokens are scoped to the attribute, not to `html`, so the theme picker can preview any theme on a small element: `[data-member-theme='<id>'] { … }` and `.dark[data-member-theme='<id>'], .dark [data-member-theme='<id>'] { … }`. Art rules: `[data-member-theme='<id>'] .premium-header-stone …`. `premium-gold.css` (Obsidian Gold) is written the same way. Shared rules (`premium-navigation.css`, `premium-chat.css`) only read variables, with Obsidian Gold values as `var()` fallbacks.

### Variables a theme sets

Palette (on `html[data-member-theme=id]`, and `.dark` variant):
`--ui-page-background`, `--ui-background`, `--ui-surface`, `--color-gray-50…950`, `--member-primary-default`, `--member-primary-50…950`.

Chrome (header, tab bar, chat thread header):
`--mt-chrome-bg` (background shorthand), `--mt-chrome-text`, `--mt-chrome-muted`, `--mt-chrome-border`, `--mt-chrome-accent` (selected tab, focus ring, icons), `--mt-chrome-accent-soft` (selected tab fill), `--mt-chrome-hairline` (header bottom edge gradient), `--mt-chrome-shadow`, `--mt-chrome-button-bg`, `--mt-chrome-edges` (side fade colour over the art), `--mt-cta-bg`, `--mt-cta-text`, `--mt-cta-border`, `--mt-badge-bg`, `--mt-badge-text`.

Brand (header lock-up):
`--mt-brand-fill` (gradient painted through the crest line mask and the wordmark), `--mt-brand-font`, `--mt-brand-tier-text`, `--mt-brand-shadow`. Obsidian Gold keeps its raster crest; other themes paint `/premium/bandeja-crest-lines.webp` (alpha = ink) through `--mt-brand-fill`, optionally over `/premium/bandeja-crest-silhouette.webp` tinted `--mt-brand-plate`.

Chat:
`--color-blue-50…950` (inside `.premium-chat`), `--chat-paper`, `--chat-panel`, `--chat-line`, `--chat-selection`, `--chat-selection-edge`, `--mt-bubble-own`, `--mt-bubble-own-dark`, `--mt-chat-backdrop` (thread wallpaper layer).

Loading: `--mt-loading-bg` (multi-layer backdrop shorthand of the `--screen` loader — a stylised scene of the theme in both appearances, never a flat white/black; unset falls back to `--mt-chrome-bg`), `--mt-loading-crest-fill` (replaces `--mt-brand-fill` inside the loader), optional `--mt-loading-text` (label colour).

Optional fine-tuning (shared rules derive these from the tokens above when unset; Obsidian Gold sets them all for its exact original look): `--mt-chrome-button-text`, `--mt-chrome-button-hover` (colour), `--mt-chrome-focus`, `--mt-chrome-focus-halo`, `--mt-chrome-tab-text`, `--mt-chrome-tab-active`, `--mt-chrome-tab-ring` (box-shadow), `--mt-chrome-profile`, `--mt-chrome-profile-ring`, `--mt-chrome-controls-bg|border|shadow` (header tab row), `--mt-cta-shadow`, `--mt-tabbar-border|shadow|hover|icon-glow|active-bg|active-shadow`, `--mt-badge-ring`, `--mt-brand-dash`, `--mt-brand-bg` (lock-up button fill), `--mt-chat-header-bg|shadow|text|muted|subtle|hover|focus|hairline`, `--mt-chat-cta-bg|shadow`, `--mt-chat-meta`, `--mt-chat-meta-dark`, `--mt-chat-input-shadow`, `--mt-chat-scroll-ring`. `--mt-chrome-button-bg` and `--mt-chrome-button-hover` are colours (`background-color`); `--mt-chrome-accent-soft` may be a colour or a gradient.

Picker preview (`MainThemeSelector`): `--mt-preview-bg` (a small still of the header art; no animation) — the tile renders a mini header, content rows and tab pill from the tokens above.

JS registry: `Frontend/src/utils/mainTheme.ts` `MEMBER_THEMES` — per id: chrome tone per appearance, `theme-color` meta per appearance, page background per appearance, native WebView background. Status bar, `meta[name=theme-color]` and the native background read only this registry. The native bridge receives `premium` (any member theme; shipped shells paint the Obsidian Gold backing) plus `memberTheme`, `lightBackground`, `darkBackground` for shells that read them. Each appearance also has `loadingBackground`, a solid colour sampled from that theme's loader scene: `persistMemberBootBackground` caches it in localStorage and the `index.html` boot script paints it on html/body and the boot splash before any CSS or JS, so the first frame lines up with the loader. The boot script keeps its own copy of the id list (`MEMBER_THEME_IDS`).

### Common surfaces

`styles/premium-surfaces.css` (imported last from `themes/index.css`) makes shared UI follow the active theme from the tokens above only — no per-theme rules, everything under `html.premium-theme`, so Classic is untouched:

- `--ui-foreground|border|muted|muted-foreground|scrollbar-thumb*` (Tailwind `text-foreground`, `border-border`, `bg-muted`, …) derive from the theme gray ramp (Classic's values are exactly gray-900/200/100/500 light, 50/700/800/400 dark).
- **Accent hooks.** A component whose brand accent is a hard-coded Tailwind palette carries `data-member-accent="<palette …>"` (`emerald`, `green`, `sky`, `cyan`, `lime`, `teal`, `blue`); inside a member theme those palettes resolve to `--member-primary-*` for that subtree. Tagged: My-tab "I want to play" hero, play-intent looking strip / sheet / idle CTA / shared dialogs / cluster progress, novice progress card, game-card join + queue hint, Profile "view original avatar". Never tag semantic colours (success/error/warning, team, level, sport, entity-type chips).
- `::selection`, caret, `accent-color`, UA focus outline and leftover `focus:ring-blue|sky-*` / `focus:border-blue|sky-*` use the primary.
- Skeletons: `shimmerBlock` carries `.skeleton-shimmer`; the sweep gets a faint primary sheen (blocks already sit on the gray ramp).
- Toasts: `ToastProvider` adds `.app-toast--neutral|success|error|loading`; neutral → `--ui-surface` + gray ramp + 3 px primary inline-start edge; loading → primary fill; success/error keep semantic fills.
- Sheets/dialogs: Vaul drawers and `[role=dialog]` swap `bg-white` for `--ui-surface` (light); bottom drawers and `.dialog-content-animate` get a primary top hairline; grabbers (`[data-vaul-handle]`, inline `h-1 rounded-full` first-level bars) are primary-tinted.
- Chat thread header (`premium-chat.css`): the bottom border is transparent with `background-clip: padding-box` (the chrome art used to show through it as a bright seam) and the edge is drawn by `::after` with `--mt-chat-header-hairline` (optional, new) → `--mt-chrome-hairline` → gold fallback.

### App icon

An active member theme owns the native launcher icon: `theme_<id>` (iOS alternate icon, Android `activity-alias`). With no member theme the tiger/racket × primary-sport choice applies unchanged and is kept as the saved preference. `resolveNativeAppIconName` / `MEMBER_THEME_NATIVE_ICON` in `Frontend/src/config/appIcons.ts`; the sync key in `appIcon.service.ts` includes the theme, so switching theme or losing Premium re-syncs. Profile's icon picker shows the theme icon with a note while a theme is active. Art is generated by `scripts/generate-theme-app-icons.mjs` (re-runnable; writes the iOS appiconsets, Android drawables and `public/premium/app-icons/theme_<id>.webp` previews). A new member theme needs its icon there and in every native alias list (see `docs/domains/native.md`).

### Design rules

- Art moves slowly (≥ 8 s loops), sits in the header backdrop and never behind text it would hurt. Everything stops under `prefers-reduced-motion`.
- Animate `transform`/`opacity` only; no `backdrop-filter`, no layout properties. The header is fixed and repaints on scroll.
- Content contrast is WCAG AA in both appearances; theme personality lives in the chrome, accents and chat paper, not in body text.

### Themed motion

`Frontend/src/features/memberEffects/` swaps a few generic effects for themed ones while `activeMemberTheme(user)` is non-null (`useMemberTheme()`). Classic users and lapsed members keep the old effect unchanged. Per-theme recipes are in `memberEffectsConfig.ts` (`MEMBER_CELEBRATIONS`, `MEMBER_SPINNERS`). A new member theme needs an entry in both, and the mapping test fails until it has them.

| id | Celebration burst | Spinner / pull-to-refresh |
|----|-------------------|---------------------------|
| `premium` | gold dust + glints | gold ring with a glint |
| `spring` | blossom petals | a swallow circling |
| `summer` | sun halo + droplets | sun with turning rays |
| `alpine` | wildflower petals + one leaf | sun rising over a peak |
| `nordic` | snowflakes | spinning snowflake |
| `ocean` | rising bubbles + bioluminescent specks | bubble ring |
| `woodstone` | autumn leaves + wood shavings | turning wood rings |
| `steampunk` | little cogs + steam puffs | turning gear |
| `cyberpunk` | neon sparks + glitch slivers | neon dashed rings |

- **Celebrations** (`MemberCelebrationBurst`) replace the trophy unlock sparks (`TrophyCelebrationSheet`) and the novice rank-up burst (`NoviceCelebrationBurst`). Limits: ≤ 40 particles, finished within 1.8 s, CSS keyframes on transform/opacity only, unmounted afterwards. Each theme has two palettes, one for light surfaces and one for dark: the sheet follows `html.dark`, and the rank-up scrim is always dark. Under reduced motion it shows a single static themed glyph beside the hero art that fades in and out.
- **Spinners** (`MemberSpinner`) are inline 24-unit SVGs drawn in `--member-primary-default`, with an optional second colour `--mfx-alt` for the glint, sun or inner ring. They take the size of the spinner they replace, so nothing reflows. Wired into the shared `RefreshIndicator`, `ChatListPullIndicator` and `BlockingLoadingOverlay` only. Individual `Loader2` call sites are unchanged. While a pull is in progress the glyph poses to the pull progress (a number, or the inbox's `var(--chat-pull-progress)`); while refreshing it turns. Under reduced motion it pulses opacity instead.

## Theme showcase

The member's theme is also a public showcase, like name styles. Same gate everywhere: `isPremium` and `showPremiumStatus !== false`; `classic`/unknown → nothing. Backend `publicMemberTheme` (`Backend/src/services/user/publicMemberTheme.ts`), Frontend `publicMemberTheme` (`utils/memberShowcase.ts`).

- **Where `mainTheme` travels.** Only single-user payloads: `GET /users/:id/stats` (`USER_STATS_TARGET_SELECT` + the controller nulls it through `publicMemberTheme`) and the owner's recap (`payload.owner.memberTheme`, overlaid on read and before rendering share images by `withOwnerShowcaseTheme`, never stored, so the *current* theme applies to old months). List/roster selects (`USER_SELECT_FIELDS`) never carry it.
- **Profile backdrop** (`MemberProfileBackdrop`, in `PlayerCardProfileBody`, so the player card sheet and `/user-profile/:id` both get it). A `.member-profile-backdrop.dark[data-member-theme=<member>]` layer fills the hero card: `--mt-preview-bg` (the picker still), a black scrim for the white hero type, `--mt-chrome-border` edge and `--mt-chrome-hairline` along the bottom. Always the theme's dark palette (light themes show their dusk/night still), in both appearances, so contrast does not depend on the viewer. Static. A blocked member keeps the red card. The member's own profile is `/profile`, which does not use this hero.
- **Why tokens only.** Showcase elements read custom properties and never reuse `.premium-header-stone` art rules: those are written `[data-member-theme='<id>'] .premium-header-stone`, which the *viewer's* `html[data-member-theme]` would also match.
- **Share art.** The recap is the share surface with a premium variant (gold cover), generalised to the sharer's theme. Client reel (`RecapStorySlide`, share-sheet swatches; `components/premium/MemberShareArt.tsx`): cover and outro paint `--mt-loading-bg` under `.dark[data-member-theme]`, every slide gets a thin themed double frame with corner diamonds, the cover a themed crest; the middle slides keep their accent. Server images (`Backend/src/services/recap/recapThemeArt.ts`, SVG primitives → sharp, export-safe: no CSS masks, no animation, no remote fetches): the same rule for the 1080×1920 slides, and the 1080×1350 recap card gets the theme scene, frame and crest (top, end side of the title block; mirrored in `ar`). Each theme has a dark palette and a scene in the bottom band (hills, sea + moon, peaks, pines + aurora, waves, wood grain + slate, gears, skyline + neon grid); the middle text band stays calm. The crest bitmaps are 360 px PNG copies in `Backend/assets/premium/share-crest-*.png`. Classic members (or hidden status) keep the original accents, Premium-on-Classic keeps the gold cover. Results share cards and bracket exports have no premium variant and are unchanged.

## Name styles (`PremiumNameStyle`)

`gold` (default, the original glow), `platinum`, `rose`, `ember`, `aurora`, `neon`, `holo`, `frost`.

- Rendered only by `PremiumName` (`Frontend/src/components/PremiumName.tsx`), CSS in `Frontend/src/styles/premium-name.css`, classes `premium-name premium-name--<style>`. Unknown value → `gold`.
- Static in lists, rosters, chat rows. Only `PremiumName animated` (profile hero, own preview) runs the slow sheen. Reduced motion → static.
- Text treatment only: no size, weight, padding or letter-spacing changes, so rows never reflow; must survive `truncate`/ellipsis and both appearances.
- Premium style always beats a bought collection name colour (PRD 355).
- Chosen in Profile → Premium section, beside the theme picker; backend validates against the enum and requires `isPremium`.

## Animated avatar (`User.avatarAnimated`)

Members can make their avatar move. `avatar` always stays a still JPEG (push, Telegram, old store builds, non-members' view of a lapsed or hidden member); `avatarAnimated` is an extra URL beside it.

**Sources (Profile → avatar).** For members the picker accepts `image/*,video/*` (Capacitor uses the system picker via `pickVideo({ accept })`, because the camera plugin flattens GIFs and cannot return videos).
- **Video (primary).** `AvatarVideoEditor`: round crop over the playing clip (react-easy-crop, pan/pinch, no rotation) and a filmstrip trim window, 1–3 s, default the first 3 s, handles ≥ 44 px, the window loops live. *Use* cuts frames client-side (`trimFrameTimes`: 12 fps, ≤ 36 frames, 256×256 WebP or JPEG via canvas, `seeked` + `requestVideoFrameCallback`) with a progress ring, then `POST /media/upload/avatar/frames` (`frames[]` + `fps`). The raw video never leaves the device. A clip the WebView cannot decode shows a friendly "choose another" state.
- **GIF / animated WebP (secondary).** Sniffed client-side (`isAnimatedImageFile`: GIF frame count, WebP VP8X animation flag / `ANIM`). Same crop modal as stills with rotation off and the "Animated · plays wherever you appear" pill; `POST /media/upload/avatar/animated` (`animated` file ≤ 8 MB + `x,y,size` square in source pixels).
- Non-members picking an animated GIF get the normal still flow plus one quiet hint line in the crop modal. Videos are not offered.

**Backend** (`Backend/src/utils/animatedAvatar.ts`, `media.controller.ts`). Both routes are `isPremium`-only (403 `media.animatedAvatarPremiumOnly`); validation errors are 400 `media.animatedAvatar.<code>`.
- GIF route: GIF/WebP magic bytes, ≥ 2 frames, ≤ 150 frames, ≤ 4096 px side, ≤ 100 MP total, ≤ 60 s; sub-20 ms frame delays become 100 ms. sharp `animated: true` crops/resizes each page.
- Frames route: 2–48 frames, each JPEG/WebP exactly 256×256, ≤ 4 MB total, `fps` 8–15; joined with `sharp(frames, { join: { animated: true } })`.
- Encoder check: a regression test (`animatedAvatar.test.ts`) races a high-contrast square across a gradient through the frames route and bounds the per-pixel error where the square just was (no ghost of the previous frame, measured ≤ 8/255) and on the background. Faint rectangles seen once in a browser-recorded test clip were not reproducible through the pipeline; client-extracted frames and server output both measured clean, so libwebp defaults are kept.
- Output: `uploads/avatars/animated/<uuid>_avatar.anim.webp` (256 px, loop 0, quality 75/70 stepping down, ≤ 1.5 MB) and `<uuid>_avatar.anim.tiny.webp` (96 px, ≤ 12 fps by folding frames so the loop length is unchanged, quality 60 stepping down, aims ≤ 150 KB). The tiny URL is derived, never stored: `animatedAvatarTinyUrlFromStandard` (Backend `utils/userAvatarTiny.ts`) / `animatedAvatarTinyUrl` (Frontend `utils/animatedAvatar.ts`).
- The first frame goes through the normal still pipeline (`_avatar.jpg`, `_avatar.tiny.jpg`, original), so `avatar` matches the animation.
- Lifecycle: an animated upload replaces the previous animation (both files deleted via `ImageProcessor.deleteAnimatedAvatar`). A still upload, avatar removal or any `avatar` change through `PUT /users/profile` sets `avatarAnimated = null` and deletes its files. Account deletion nulls it; `MediaCleanupService` deletes it on user cleanup and counts both files as referenced.

**Rendering** (`Frontend/src/utils/animatedAvatar.ts`: `animatedAvatarSrc(user, { tiny?, own? })`, `userFaceSrc` for large `<img>` faces, `userFaceTinySrc` for the `tinyUrl` slot of `PlayerAvatarFace`/`TeamAvatar`, `fallbackToStillAvatar` as `onError`). Animates at every size: `PlayerAvatar` small faces (`superTiny`, `extrasmall`, `smallLayout`, `inlineFace`), seat stacks, mention suggestions, pair/club-regular/court-lobby faces, referral avatars, attendance rail and story bubbles use the 96 px variant; larger faces (default `PlayerAvatar`, player card hero, level card, comparison, insights, series pages) the 256 px one. Any new surface that draws a user's face itself must go through these helpers. Story *slides* (rendered for sharing/export) and push/Telegram/metatags stay still. Others see it only while `showsPremiumStatus(user)`; the member's own previews (`own: true`: Profile avatar, header button, own level card) need only `isPremium`. `prefers-reduced-motion` → still. Any load error falls back to the still once. Offscreen pausing is left to the browser. Push notifications, Telegram and metatags keep `avatar`. `PlayerAvatar` still owns the ring/frame layer; animated faces add no borders.

