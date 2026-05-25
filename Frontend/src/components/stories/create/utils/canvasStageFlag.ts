export function isCanvasStageEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const params = new URLSearchParams(window.location.search);
  if (params.get('canvasStage') === '0') return false;
  if (params.get('canvasStage') === '1') return true;
  return import.meta.env.VITE_STORY_CANVAS_STAGE !== '0';
}
