export interface MessageMenuRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type MessageMenuAnchorAlign = 'start' | 'end' | 'center'; // physical: start = left edge, end = right edge

export interface MessageMenuLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  safeTop: number;
  safeBottom: number;
  sourceRect: MessageMenuRect; // pressed message row rect at open (viewport coords)
  anchorRect: MessageMenuRect; // bubble rect inside that row (viewport coords)
  anchorAlign: MessageMenuAnchorAlign;
  previewNaturalHeight: number; // full height of the cloned row
  menuHeight: number; // measured natural menu height
  menuWidth: number; // measured menu width
  gap?: number; // default 8  (between preview bottom and menu top)
  edgePadding?: number; // default 12 (from viewport/safe-area edges)
  minPreviewHeight?: number; // default 96 (preview never squeezed below min(natural, this))
}

export interface MessageMenuLayout {
  previewTop: number;
  previewHeight: number; // visible (possibly clipped) preview height
  previewClipped: boolean; // natural > visible (caller applies bottom fade mask)
  menuTop: number;
  menuLeft: number;
  menuMaxHeight: number; // menu gets overflow-auto when its natural height exceeds this
  menuOriginX: 'left' | 'right' | 'center'; // transform-origin side for the scale-in
}

const DEFAULT_GAP = 8;
const DEFAULT_EDGE_PADDING = 12;
const DEFAULT_MIN_PREVIEW_HEIGHT = 96;
const FULL_WIDTH_RATIO = 0.9;
const CENTER_TOLERANCE_PX = 8;

const num = (value: number | undefined, fallback = 0): number => {
  if (value === undefined) return fallback;
  return Number.isFinite(value) ? value : 0;
};

/**
 * Places the lifted message preview and its menu so the message moves as little as possible
 * and the menu sits directly beneath it, inside the safe-area-padded viewport.
 */
export function computeMessageMenuLayout(input: MessageMenuLayoutInput): MessageMenuLayout {
  const viewportWidth = num(input.viewportWidth);
  const viewportHeight = num(input.viewportHeight);
  const gap = num(input.gap, DEFAULT_GAP);
  const pad = num(input.edgePadding, DEFAULT_EDGE_PADDING);
  const minPreviewHeight = num(input.minPreviewHeight, DEFAULT_MIN_PREVIEW_HEIGHT);
  const previewNaturalHeight = Math.max(0, num(input.previewNaturalHeight));
  const menuHeight = Math.max(0, num(input.menuHeight));
  const menuWidth = Math.max(0, num(input.menuWidth));

  const top = num(input.safeTop) + pad;
  const bottom = viewportHeight - num(input.safeBottom) - pad;

  const minPreview = Math.min(previewNaturalHeight, minPreviewHeight);
  const menuMaxHeight = Math.max(0, bottom - top - gap - minPreview);
  const menuH = Math.min(menuHeight, menuMaxHeight);

  const available = Math.max(0, bottom - top - gap - menuH);
  const previewHeight = Math.max(0, Math.min(previewNaturalHeight, available));
  const previewClipped = previewNaturalHeight - previewHeight > 0.5;

  const upper = bottom - menuH - gap - previewHeight;
  const sourceTop = num(input.sourceRect.top);
  const previewTop = upper < top ? top : Math.min(Math.max(sourceTop, top), upper);
  const menuTop = previewTop + previewHeight + gap;

  const anchorLeft = num(input.anchorRect.left);
  const anchorWidth = num(input.anchorRect.width);
  let menuLeft: number;
  let menuOriginX: MessageMenuLayout['menuOriginX'];
  if (input.anchorAlign === 'end') {
    menuLeft = anchorLeft + anchorWidth - menuWidth;
    menuOriginX = 'right';
  } else if (input.anchorAlign === 'center') {
    menuLeft = anchorLeft + anchorWidth / 2 - menuWidth / 2;
    menuOriginX = 'center';
  } else {
    menuLeft = anchorLeft;
    menuOriginX = 'left';
  }
  if (menuWidth > viewportWidth - 2 * pad) {
    menuLeft = pad;
  } else {
    menuLeft = Math.min(Math.max(menuLeft, pad), viewportWidth - pad - menuWidth);
  }

  return {
    previewTop,
    previewHeight,
    previewClipped,
    menuTop,
    menuLeft,
    menuMaxHeight,
    menuOriginX,
  };
}

/** Picks which physical edge of the bubble the menu should align to (RTL-agnostic). */
export function resolveMessageMenuAnchorAlign(
  sourceRect: MessageMenuRect,
  anchorRect: MessageMenuRect
): MessageMenuAnchorAlign {
  const sourceWidth = num(sourceRect.width);
  const anchorWidth = num(anchorRect.width);
  if (anchorWidth >= sourceWidth * FULL_WIDTH_RATIO) return 'start';
  const sourceCenter = num(sourceRect.left) + sourceWidth / 2;
  const anchorCenter = num(anchorRect.left) + anchorWidth / 2;
  const diff = anchorCenter - sourceCenter;
  if (Math.abs(diff) <= CENTER_TOLERANCE_PX) return 'center';
  return diff > 0 ? 'end' : 'start';
}

/** Reads the current env(safe-area-inset-*) top/bottom values in px via a hidden probe element. */
export function readSafeAreaInsets(): { top: number; bottom: number } {
  if (typeof document === 'undefined' || !document.body) return { top: 0, bottom: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;' +
    'padding-top:env(safe-area-inset-top, 0px);padding-bottom:env(safe-area-inset-bottom, 0px);';
  document.body.appendChild(probe);
  try {
    const style = window.getComputedStyle(probe);
    const top = parseFloat(style.paddingTop);
    const bottom = parseFloat(style.paddingBottom);
    return {
      top: Number.isFinite(top) ? top : 0,
      bottom: Number.isFinite(bottom) ? bottom : 0,
    };
  } finally {
    probe.remove();
  }
}
