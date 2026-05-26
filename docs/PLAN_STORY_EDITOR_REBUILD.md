# Story create: photo editor rebuild + video publish (as-is)

Plan for stories in `Frontend/src/components/stories/create/`. **Videos** upload unchanged with preview + optional description only. **Photos** use a **brand-new editor** — not a reskin of the deleted `StoryEditor`.

**Policy: no backward compatibility.** No overlay v1/v2, no `overlayStyle` on create, no composition viewer. **No reuse of deleted editor UI shell.**

---

## 0. Product split (primary decision)

| | **Video story** | **Photo story** |
|---|-----------------|-----------------|
| **Intent** | Share a clip as captured | Compose: crop, filters, text, stickers |
| **After pick** | Preview modal → optional description → Share | Full-screen **`StoryPhotoEditor`** (v3) |
| **Upload** | File as captured (chat prep) | **Baked** 1080×1920 JPEG |
| **Server** | `messageType: VIDEO`, `caption?` only | `messageType: IMAGE`, `caption?` — **no `overlayStyle`** |
| **Viewer** | `<video>` + poster | `<img src={mediaUrl}>` only |

**Caption** = story description field — not overlay text baked into the image (overlay text is pixels in JPEG).

---

## 1. No backward compatibility

Same as before: no overlay readers, no feature flags, no `overlayStyle` on new creates. Old DB overlay JSON is ignored in the viewer.

---

## 2. What was deleted (legacy)

- `StoryEditor.tsx`, `StoryCanvasStage*`, `useCanvasStageGestures`, overlay v1/v2, composition viewer components, video trim in story flow, `useStoryExport`.

---

## 3. Absolutely new photo editor (mandatory)

### 3.1 Hard rule — do **not** import into `create/photo/`

The following are **legacy editor UI** and **forbidden** in the photo editor tree:

| Forbidden | Reason |
|-----------|--------|
| `StoryEditorialCanvas` | Old stage chrome |
| `StoryToolRail` | Old bottom tools |
| `StoryCropMode` | Old crop shell |
| `StoryAdjustPanel` | Old adjust UI |
| `StoryStickerPicker` / `StoryTextStyleSheet` | Old sheets |
| `StorySlideThumbnails` | Old pager |
| `StoryCaptionField` | Old caption bar |
| `storyEditor.types` **`StorySlide`** bridge | Old document model |
| `storyCompositionDraw` / `storyCanvasExport` | Old bake path |
| `useStoryGestures`, `useLayerPinchGesture`, `useEditorTransaction` from `create/hooks` | Old interaction |

**Allowed outside `photo/`:** `StoryCreateSheet` (picker only), `prepareChatVideoForSend`, shared app UI (`FullScreenDialog`, `Button`), `getCroppedImg` / `react-easy-crop` as **libraries** (wrap in new `PhotoStoryCropScreen`, do not import `StoryCropMode`).

### 3.2 New code layout (`create/photo/` only)

```
photo/
  StoryPhotoEditor.tsx          # entry — wires v3 editor only
  types.ts                      # StoryDocument v3 — sole model
  constants.ts
  editor/                       # NEW UI — all components here
    PhotoStoryStage.tsx
    PhotoStoryKonvaCanvas.tsx
    PhotoStoryToolbar.tsx
    PhotoStoryCropScreen.tsx
    PhotoStoryAdjustSheet.tsx
    PhotoStoryStickerSheet.tsx
    PhotoStoryTextSheet.tsx
    PhotoStoryPager.tsx
    PhotoStoryCaption.tsx
  hooks/
    usePhotoStoryState.ts
    useStoryPhotoPublish.ts
  utils/
    document.ts
    transform.ts
    canvasText.ts
    renderDocument.ts            # preview === export
    drawScene.ts
    storyPhotoFilters.ts
    downscaleStoryImageFile.ts
    useFilteredMediaImage.ts
```

### 3.3 Single render pipeline

`StoryDocument` → **Konva preview** (filtered bitmap + nodes) and **`renderDocument` → JPEG** must use the **same** adjust/LUT/text/sticker math (`mediaAdjustToCanvasFilter`, `canvasText.ts`).

### 3.4 UX (new — not legacy wireframe)

```
┌──────────────────────────────────┐
│  ✕          Edit story      Share │  ← Share in header
├──────────────────────────────────┤
│         9:16 stage               │  ← undo/redo inside frame
│                                  │
├──────────────────────────────────┤
│           ● ○ ○                  │
│  [ caption … ]                   │
│  Aa   😀   ✨   ✂   ＋           │  ← new toolbar row
└──────────────────────────────────┘
```

Collage: **deferred** (`GroupNode` type only).

---

## 4. Video flow

Unchanged: `StoryVideoPublishModal` + `useStoryVideoPublish` under `create/video/`. No trim, no overlay fields.

---

## 5. Phased delivery

### Phase 1 — Video + viewer — **done**

### Phase 2 — True photo editor v3 — **done (2026-05-26)**

- [x] Publish: baked JPEG, no `overlayStyle`
- [x] Delete `StoryEditor` and overlay stack
- [x] **All** UI under `photo/editor/*` (no legacy imports)
- [x] `renderDocument` + Konva share one visual path (`mediaAdjustToCanvasFilter`)
- [x] `StoryDocument` only in photo tree (no `StorySlide` bridge)

### Phase 3 — Quality

- [x] Undo/redo, LUT, downscale 2160px, haptics
- [ ] Collage

---

## 6. Testing

| Area | File |
|------|------|
| Video publish | `create/video/useStoryVideoPublish.test.ts` |
| Photo publish | `create/photo/hooks/useStoryPhotoPublish.test.ts` |
| Viewer | `slides/MediaStorySlide.test.tsx` |
| Export size | `create/utils/storyExportDimensions.test.ts` |

Run: `cd Frontend && npm run test:stories`

---

## 7. Bottom line

- **Video:** thin publish modal; viewer plays file as-is.
- **Photo:** **new editor codebase** under `photo/` — **not** the old rails/canvas/sheets with Konva bolted on.
- **No** `overlayStyle` on create; viewer shows `mediaUrl` only.
