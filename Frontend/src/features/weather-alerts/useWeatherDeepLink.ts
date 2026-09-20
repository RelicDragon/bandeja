/**
 * PRD 357 — consumes `?section=weather&action=moveIndoor` on `/games/:id`.
 *
 * The params are read **once** and stripped from the URL straight away, so a
 * refresh, a back-navigation or a shared link never re-opens the sheet. The
 * captured intent survives in a ref, which is what the banner reads.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export interface WeatherDeepLinkIntent {
  /** The link asked for the weather section at all. */
  section: boolean;
  /** The link asked for the move-indoor sheet (organizers only). */
  autoOpenMoveIndoor: boolean;
  /** Called by the consumer once it has acted on the intent. */
  consume: () => void;
}

export function useWeatherDeepLink(): WeatherDeepLinkIntent {
  const location = useLocation();
  const navigate = useNavigate();
  const [intent, setIntent] = useState<{ section: boolean; moveIndoor: boolean }>({
    section: false,
    moveIndoor: false,
  });
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const params = new URLSearchParams(location.search);
    if (params.get('section') !== 'weather') return;
    handled.current = true;
    setIntent({ section: true, moveIndoor: params.get('action') === 'moveIndoor' });

    params.delete('section');
    params.delete('action');
    const search = params.toString();
    navigate({ pathname: location.pathname, search }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const consume = useCallback(() => {
    setIntent((current) =>
      current.section || current.moveIndoor ? { section: false, moveIndoor: false } : current,
    );
  }, []);

  return {
    section: intent.section,
    autoOpenMoveIndoor: intent.moveIndoor,
    consume,
  };
}
