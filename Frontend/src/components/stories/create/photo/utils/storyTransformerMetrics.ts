import type Konva from 'konva';

export const TRANSFORMER_ANCHOR_SCREEN_PX = 22;
export const TRANSFORMER_ROTATE_OFFSET_SCREEN_PX = 40;
export const TRANSFORMER_HIT_SCREEN_PX = 44;
export const TRANSFORMER_BORDER_SCREEN_PX = 2;
export const TRANSFORMER_CORNER_RADIUS_SCREEN_PX = 4;

/** Stage scale from canvas (1080) space to screen pixels. */
export function stageVisualScale(stage: Konva.Stage | null | undefined, fallbackStageScale: number): number {
  if (!stage) return Math.max(fallbackStageScale, 1e-6);
  const abs = stage.getAbsoluteScale();
  return Math.max(Math.abs(abs.x), Math.abs(abs.y), 1e-6);
}

/** Sizes in story canvas (1080) space so handles stay constant on screen. */
export function screenFixedTransformerMetrics(visualStageScale: number) {
  const denom = Math.max(visualStageScale, 1e-6);
  return {
    anchorSize: TRANSFORMER_ANCHOR_SCREEN_PX / denom,
    rotateOffset: TRANSFORMER_ROTATE_OFFSET_SCREEN_PX / denom,
    hitStrokeWidth: TRANSFORMER_HIT_SCREEN_PX / denom,
    borderStrokeWidth: TRANSFORMER_BORDER_SCREEN_PX / denom,
    cornerRadius: TRANSFORMER_CORNER_RADIUS_SCREEN_PX / denom,
  };
}
