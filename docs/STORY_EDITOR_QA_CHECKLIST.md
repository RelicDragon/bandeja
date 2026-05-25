# Story Editor QA Checklist

Run on **iPhone Safari**, **Android Chrome**, and **desktop**. Every fix should map to a row here.

| Area | Actions to test | iOS | Android | Desktop |
|------|-----------------|-----|---------|---------|
| Open/close | Pick photo, pick video, multi-select, cancel with/without edits | ☐ | ☐ | ☐ |
| Canvas | Pinch zoom, pan, double-tap reset, rotate | ☐ | ☐ | ☐ |
| Slides | Swipe between slides, add slide, switch via thumbnails | ☐ | ☐ | ☐ |
| Text | Add, move, scale corners, rotate, double-tap edit, style presets, align, delete empty layer | ☐ | ☐ | ☐ |
| Stickers | Add, move, select/deselect, overlap with text | ☐ | ☐ | ☐ |
| Adjust | Sliders + presets, undo after adjust | ☐ | ☐ | ☐ |
| Crop | Enter/exit, confirm/cancel, re-enter after confirm | ☐ | ☐ | ☐ |
| Trim | Wait for duration load, set range, preview loop | ☐ | ☐ | ☐ |
| Publish | Image with overlays, video with trim + overlays | ☐ | ☐ | ☐ |
| Edge | Keyboard open during text edit, safe areas, landscape | ☐ | ☐ | ☐ |

## Notes

- **Publish parity:** Compare editor preview vs published story for text position, sticker size, and filter presets.
- **Publishing UX:** All controls disabled during publish; step-specific error toasts on failure.
- **Accessibility:** Trash visible on selected layers; Escape cancels crop/trim; focus trapped in crop mode.
