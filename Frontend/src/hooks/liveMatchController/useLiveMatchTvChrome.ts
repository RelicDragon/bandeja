import { useCallback, useEffect, useRef, useState } from 'react';

export function useLiveMatchTvChrome(tv: boolean) {
  const [showTvChrome, setShowTvChrome] = useState(!tv);
  const tvChromeHideRef = useRef<number>(0);

  useEffect(() => {
    setShowTvChrome(!tv);
  }, [tv]);

  useEffect(() => {
    return () => {
      window.clearTimeout(tvChromeHideRef.current);
    };
  }, []);

  const bumpTvChrome = useCallback(() => {
    if (!tv) return;
    setShowTvChrome(true);
    window.clearTimeout(tvChromeHideRef.current);
    tvChromeHideRef.current = window.setTimeout(() => {
      setShowTvChrome(false);
    }, 4200);
  }, [tv]);

  return { showTvChrome, bumpTvChrome };
}
