import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH, type Transform2D } from '../types';

/** Client (screen) point → story canvas coordinates given frame rect + scale. */
export function clientToCanvasPoint(
  clientX: number,
  clientY: number,
  frameRect: Pick<DOMRect, 'left' | 'top'>,
  stageScale: number
): { x: number; y: number } {
  const s = Math.max(stageScale, 1e-6);
  return {
    x: (clientX - frameRect.left) / s,
    y: (clientY - frameRect.top) / s,
  };
}

/**
 * Scale media around a fixed canvas point (Instagram pinch: zoom under fingers).
 * Transform is center-anchored on the 1080×1920 canvas.
 */
export function scaleMediaAroundCanvasPoint(
  transform: Transform2D,
  canvasPoint: { x: number; y: number },
  nextScale: number
): Transform2D {
  const prevScale = Math.max(transform.scale, 1e-6);
  const scale = Math.max(nextScale, 1e-6);
  if (Math.abs(scale - prevScale) < 1e-9) {
    return { ...transform, scale };
  }

  const cx = STORY_CANVAS_WIDTH / 2 + transform.x;
  const cy = STORY_CANVAS_HEIGHT / 2 + transform.y;
  const dx = canvasPoint.x - cx;
  const dy = canvasPoint.y - cy;

  const rad = (-transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localX = (dx * cos - dy * sin) / prevScale;
  const localY = (dx * sin + dy * cos) / prevScale;

  const fwd = (transform.rotation * Math.PI) / 180;
  const fcos = Math.cos(fwd);
  const fsin = Math.sin(fwd);
  const worldOffX = localX * scale * fcos - localY * scale * fsin;
  const worldOffY = localX * scale * fsin + localY * scale * fcos;

  return {
    x: canvasPoint.x - worldOffX - STORY_CANVAS_WIDTH / 2,
    y: canvasPoint.y - worldOffY - STORY_CANVAS_HEIGHT / 2,
    scale,
    rotation: transform.rotation,
  };
}
