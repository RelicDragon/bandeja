import type Konva from 'konva';

/** Instagram-like selection chrome — soft white border + circular corner anchors. */

export const TRANSFORMER_ANCHOR_SCREEN_PX = 12;
export const TRANSFORMER_ROTATE_OFFSET_SCREEN_PX = 28;
export const TRANSFORMER_HIT_SCREEN_PX = 44;
export const TRANSFORMER_BORDER_SCREEN_PX = 1.25;
export const TRANSFORMER_CORNER_RADIUS_SCREEN_PX = 6;
export const TRANSFORMER_ANCHOR_STROKE_SCREEN_PX = 1.5;

export const TRANSFORMER_BORDER_COLOR = 'rgba(255, 255, 255, 0.92)';
export const TRANSFORMER_ANCHOR_FILL = '#ffffff';
export const TRANSFORMER_ANCHOR_STROKE = 'rgba(0, 0, 0, 0.18)';

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
    anchorStrokeWidth: TRANSFORMER_ANCHOR_STROKE_SCREEN_PX / denom,
  };
}
