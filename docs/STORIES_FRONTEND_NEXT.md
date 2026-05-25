# Stories frontend — next to implement

Instagram-like stories: backend/feed/playback are largely done per [PLAN_STORIES.md](./PLAN_STORIES.md). **This doc is the prioritized frontend work queue** — layout, gestures, and rail/composer polish.

---

## P0 — Viewer shell & layout

### 1. Fullscreen viewport chain

`StoriesViewer` uses `min-h-full` inside `FullScreenDialog`’s scrollable body (`overflow-y-auto`), while slides use `absolute inset-0` on `flex-1 min-h-0`. On mobile this often causes letterboxed media, a collapsed gesture area, or scroll.

**Do:** Refactor to a single `fixed inset-0 flex flex-col bg-black` root (or `h-dvh`), `overflow-hidden`, safe-area on the shell — mirror `FullscreenImageViewer` / `FullscreenVideoViewer`.

**Files:** `Frontend/src/components/stories/StoriesViewer.tsx`, optionally `Frontend/src/components/ui/FullScreenDialog.tsx` (stories-specific overlay).

### 2. Opaque backdrop

Default dialog overlay is `bg-black/80`. If content doesn’t fill the viewport, a dim frame shows through.

**Do:** Solid black overlay for stories (`overlayClassName` or dedicated prop).

### 3. Chrome stacking (progress + header)

Progress bars are in normal flow; `StoriesViewerHeader` is `absolute top-0` — they overlap.

**Do:** Instagram order — progress under status bar, avatar row below bars (`top: calc(safe-area + progressHeight)` or one stacked overlay column).

**Files:** `StoriesProgressBars.tsx`, `StoriesViewerHeader.tsx`, `StoriesViewer.tsx`.

### 4. Media fill (`object-cover`)

`MediaStorySlide` uses `object-contain` → letterboxing.

**Do:** `w-full h-full object-cover` on image/video; optional blurred cover background for aspect mismatch.

**Files:** `Frontend/src/components/stories/slides/MediaStorySlide.tsx`.

---

## P1 — Gestures & progress

### 5. Video progress bar sync

`useStoriesPlayback` only advances video progress on `videoEnded`; bar stays at 0 during playback.

**Do:** Drive `progress` from `video.currentTime / duration` via `timeupdate` in `MediaStorySlide` (or `onVideoProgress` into the hook).

**Files:** `useStoriesPlayback.ts`, `MediaStorySlide.tsx`, `StoriesViewer.tsx`.

### 6. Long-press release must not tap-advance

`StoriesGestureLayer` clears `longPressActive` before the guard, so pointer-up after hold can fire `onTapLeft` / `onTapRight`.

**Do:** Track `didLongPress` and skip tap/swipe for that gesture.

**Files:** `StoriesGestureLayer.tsx`.

### 7. Interactive controls vs gesture layer

Game CTAs and mute only `stopPropagation` on `click`; pointer-up on the layer still advances.

**Do:** `stopPropagation` on `pointerdown`/`pointerup` for `button, a, input`, or ignore non-slide targets in the layer.

**Files:** `StoriesGestureLayer.tsx`, `GamePromoStorySlide.tsx`, `GameResultStorySlide.tsx`, `MediaStorySlide.tsx`.

### 8. Swipe between users — segment index (optional)

Swipe left/right always `setSegmentIndex(0)`. Going back to a previous user could resume last segment (Instagram-ish).

**Files:** `StoriesViewer.tsx`.

---

## P2 — Rail (Instagram parity)

Plan allows **`+` create bubble + server self bubble**; Instagram uses one avatar with a + badge.

**Do (choose one):**
- Merge create into self bubble (tap ring = view, tap + = create), or
- Keep two bubbles but IG-style + on avatar corner.

Also: create bubble hardcodes `hasUnseen={false}` — own unseen ring never shows on rail.

**Files:** `StoriesRail.tsx`, `StoriesRailBubble.tsx`.

---

## P3 — Composer

`StoryComposer` is form layout (`min-h-[40vh]`, controls below), not full-bleed. Overlay preview is always centered while publish uses `position` top/center/bottom.

**Do:** Full-screen preview; overlay positions must match `MediaStorySlide` (`top` / `center` / `bottom`).

**Files:** `StoryComposer.tsx`, `StoryOverlayTextEditor.tsx` (if needed).

---

## P4 — Phase E polish ([PLAN_STORIES.md](./PLAN_STORIES.md) § phased rollout)

- Swipe-down dismiss animation (reference `FullscreenVideoViewer` translateY/opacity)
- Horizontal transition between users
- Haptics
- Preload tuning (basic preload exists in `StoriesViewer`)

---

## Implementation order

| Step | Item | Priority |
|------|------|----------|
| 1 | Viewer shell (fixed viewport, opaque black, no scroll) | P0 |
| 2 | Progress + header stack | P0 |
| 3 | `object-cover` on media | P0 |
| 4 | Gesture fixes (long-press, interactive controls) | P1 |
| 5 | Video progress sync | P1 |
| 6 | Composer preview layout + overlay positions | P3 |
| 7 | Rail self/create merge (if product agrees) | P2 |
| 8 | Phase E animations & haptics | P4 |

---

## Already aligned (no change needed for “next”)

- Feed API, segment types, durations (5s / 7s / video)
- Tap zones (left ⅓ / right ⅔) in `StoriesGestureLayer`
- Long-press pause, keyboard, mark viewed ≥ 800ms
- Rail on My + Find, feature flag, profile share toggles
- Game promo/result slides + CTAs

---

## QA after implementation

```bash
cd Frontend && npm run lint
```

Manual: open story from rail, hold to pause (no skip on release), tap CTA without advancing, video progress bar moves, full-bleed media, safe area on notch devices, create story with overlay at top/bottom.
