import { useEffect, useState } from 'react';
import { Popup, useMap } from 'react-leaflet';
import type L from 'leaflet';

interface LazyPopupProps {
  children: React.ReactNode;
  markerRef: React.RefObject<L.Marker>;
}

export function LazyPopup({ children, markerRef }: LazyPopupProps) {
  const [isOpen, setIsOpen] = useState(false);
  const map = useMap();

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const handlePopupOpen = () => setIsOpen(true);
    const handlePopupClose = () => setIsOpen(false);

    marker.on('popupopen', handlePopupOpen);
    marker.on('popupclose', handlePopupClose);

    return () => {
      marker.off('popupopen', handlePopupOpen);
      marker.off('popupclose', handlePopupClose);
    };
  }, [markerRef, map]);

  if (!isOpen) {
    return <Popup><div /></Popup>;
  }

  return <Popup>{children}</Popup>;
}
