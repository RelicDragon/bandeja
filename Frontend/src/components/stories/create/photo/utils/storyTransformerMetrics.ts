import type Konva from 'konva';

export const TRANSFORMER_ANCHOR_SCREEN_PX = 22;
export const TRANSFORMER_ROTATE_OFFSET_SCREEN_PX = 40;
export const TRANSFORMER_HIT_SCREEN_PX = 44;
export const TRANSFORMER_BORDER_SCREEN_PX = 2;
export const TRANSFORMER_CORNER_RADIUS_SCREEN_PX = 4;

export function konvaNodeScale(node: Konva.Node | undefined): number {
  if (!node) return 1;
  return Math.max(Math.abs(node.scaleX()), Math.abs(node.scaleY()), 1e-6);
}

/** Sizes in story canvas (1080) space so handles stay constant on screen. */
export function screenFixedTransformerMetrics(stageScale: number, nodeScale: number) {
  const denom = stageScale * Math.max(nodeScale, 1e-6);
  return {
    anchorSize: TRANSFORMER_ANCHOR_SCREEN_PX / denom,
    rotateOffset: TRANSFORMER_ROTATE_OFFSET_SCREEN_PX / denom,
    hitStrokeWidth: TRANSFORMER_HIT_SCREEN_PX / denom,
    borderStrokeWidth: TRANSFORMER_BORDER_SCREEN_PX / denom,
    cornerRadius: TRANSFORMER_CORNER_RADIUS_SCREEN_PX / denom,
  };
}
