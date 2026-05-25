import type { StoryEditorMode, StoryEditorTool } from '../types/storyEditor.types';

export function resolveEditorMode(
  activeTool: StoryEditorTool,
  selectedLayerId: string | null,
  editingLayerId: string | null
): StoryEditorMode {
  if (activeTool === 'crop') return 'CROP';
  if (activeTool === 'trim') return 'TRIM';
  if (editingLayerId) return 'EDITING_TEXT';
  if (activeTool) return 'TOOL_ACTIVE';
  if (selectedLayerId) return 'LAYER_SELECTED';
  return 'IDLE';
}
