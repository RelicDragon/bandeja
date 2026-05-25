import type { CSSProperties } from 'react';

const FADE_WIDTH = '3rem';

export function getHorizontalScrollFadeMaskStyle(
  showLeft: boolean,
  showRight: boolean
): CSSProperties | undefined {
  if (!showLeft && !showRight) return undefined;

  const stops: string[] = [];
  if (showLeft) {
    stops.push('transparent 0', `black ${FADE_WIDTH}`);
  } else {
    stops.push('black 0');
  }
  if (showRight) {
    stops.push(`black calc(100% - ${FADE_WIDTH})`, 'transparent 100%');
  } else {
    stops.push('black 100%');
  }

  const maskImage = `linear-gradient(to right, ${stops.join(', ')})`;
  return {
    maskImage,
    WebkitMaskImage: maskImage,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
  };
}
