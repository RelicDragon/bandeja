import type { StoryMediaAdjust } from '../types';

export type StoryFilterPreset = {
  id: string;
  labelKey: string;
  adjust: Partial<Pick<StoryMediaAdjust, 'brightness' | 'contrast' | 'saturation'>> & { filterId?: string };
};

export const STORY_FILTER_PRESETS: StoryFilterPreset[] = [
  { id: 'none', labelKey: 'stories.editor.filterNone', adjust: {} },
  { id: 'warm', labelKey: 'stories.editor.filterWarm', adjust: { brightness: 108, contrast: 105, saturation: 118, filterId: 'warm' } },
  { id: 'cool', labelKey: 'stories.editor.filterCool', adjust: { brightness: 102, contrast: 110, saturation: 90, filterId: 'cool' } },
  { id: 'vivid', labelKey: 'stories.editor.filterVivid', adjust: { brightness: 105, contrast: 115, saturation: 140, filterId: 'vivid' } },
  { id: 'fade', labelKey: 'stories.editor.filterFade', adjust: { brightness: 112, contrast: 88, saturation: 85, filterId: 'fade' } },
  { id: 'mono', labelKey: 'stories.editor.filterMono', adjust: { brightness: 100, contrast: 110, saturation: 0, filterId: 'mono' } },
  { id: 'dramatic', labelKey: 'stories.editor.filterDramatic', adjust: { brightness: 92, contrast: 125, saturation: 105, filterId: 'dramatic' } },
];

const LUT_CANVAS: Record<string, string> = {
  warm: 'sepia(0.15) hue-rotate(-8deg)',
  cool: 'hue-rotate(12deg) saturate(0.9)',
  vivid: 'saturate(1.35) contrast(1.08)',
  fade: 'contrast(0.92) brightness(1.06)',
  mono: 'grayscale(1)',
  dramatic: 'contrast(1.2) brightness(0.92) saturate(1.05)',
};

function mediaAdjustFilterParts(adjust: StoryMediaAdjust): string[] {
  const parts: string[] = [];
  const b = adjust.brightness / 100;
  const c = adjust.contrast / 100;
  const s = adjust.saturation / 100;
  if (b !== 1) parts.push(`brightness(${b})`);
  if (c !== 1) parts.push(`contrast(${c})`);
  if (s !== 1) parts.push(`saturate(${s})`);
  if (adjust.filterId && LUT_CANVAS[adjust.filterId]) {
    parts.push(LUT_CANVAS[adjust.filterId]);
  }
  return parts;
}

/** Canvas 2D / Konva export filter string (single path — no DOM CSS duplicate). */
export function mediaAdjustToCanvasFilter(adjust: StoryMediaAdjust): string {
  const parts = mediaAdjustFilterParts(adjust);
  return parts.length ? parts.join(' ') : 'none';
}
