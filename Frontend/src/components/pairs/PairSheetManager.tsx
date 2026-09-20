import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getOverlay, removeOverlay } from '@/utils/urlSchema';
import { parseLevelSportQuery } from '@/utils/levelSportQuery';
import { useSportContextStore } from '@/store/sportContextStore';
import { PairSheet } from './PairSheet';

interface PairSheetManagerProps {
  children: React.ReactNode;
}

/**
 * PRD 352 — hosts the `?pair=a,b` overlay, modelled on
 * `PlayerCardModalManager`: the URL is the source of truth, so a deep link, a
 * back gesture and an in-app tap all land in the same place.
 *
 * Closing strips the param instead of pushing a new entry, so the sheet does
 * not leave a phantom step in the history stack.
 */
export const PairSheetManager = ({ children }: PairSheetManagerProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [pairId, setPairId] = useState<string | null>(null);

  const sportFromUrl = useMemo(
    () => parseLevelSportQuery(new URLSearchParams(location.search).get('sport')),
    [location.search],
  );

  useEffect(() => {
    const overlay = getOverlay(location.search);
    setPairId(overlay?.type === 'pair' && overlay.id ? overlay.id : null);
  }, [location.pathname, location.search]);

  const handleClose = useCallback(() => {
    setPairId(null);
    if (getOverlay(location.search)?.type === 'pair') {
      navigate(removeOverlay(location.pathname, location.search, 'pair'), { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const activeLevelSport = useSportContextStore((state) => state.activeLevelSport);
  const sport = sportFromUrl ?? activeLevelSport;

  return (
    <>
      {children}
      <PairSheet pairId={pairId} sport={sport} onClose={handleClose} />
    </>
  );
};
