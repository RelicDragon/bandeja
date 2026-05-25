import { useEffect, useState } from 'react';

type VisualViewportInset = {
  bottom: number;
  height: number;
};

export function useVisualViewportInset(enabled: boolean): VisualViewportInset {
  const [inset, setInset] = useState<VisualViewportInset>({ bottom: 0, height: 0 });

  useEffect(() => {
    if (!enabled) {
      setInset({ bottom: 0, height: 0 });
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset({ bottom, height: vv.height });
    };

    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return inset;
}
