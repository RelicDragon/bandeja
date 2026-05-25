# Story editor undo scope

Each undo step restores **slides[]** and **activeSlideIndex** from a snapshot taken before the edit.

| Action | Undo behavior |
|--------|----------------|
| Media pinch/pan/rotate | One step per gesture (`beginTransaction` → live updates → `commitTransaction`) |
| Media double-tap reset | One step (`resetMediaTransform` with history) |
| Layer move/scale/rotate | One step per gesture (same transaction pattern) |
| Adjust sliders | Live preview; one step on slider release (`onChangeComplete`) |
| Adjust preset tap | One step immediately |
| Trim range | Live preview; one step on slider release |
| Add/delete layer, crop confirm, text style preset | One step immediately |
| Slide switch | Does not push history; per-slide state preserved in `slides[]` |
| Selection / active tool | Not restored by undo (UI-only) |

Crop replace media is a single undo step via `replaceSlideMedia`.
