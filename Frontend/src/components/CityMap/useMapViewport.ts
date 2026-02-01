import { useState, useEffect } from 'react';
import { useMapEvents } from 'react-leaflet';
import type { LatLngBounds } from 'leaflet';

export function useMapViewport() {
  const [bounds, setBounds] = useState<LatLngBounds | null>(null);
  const [zoom, setZoom] = useState<number>(2);

  const map = useMapEvents({
    moveend: () => {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
    zoomend: () => {
      setBounds(map.getBounds());
      setZoom(map.getZoom());
    },
  });

  useEffect(() => {
    setBounds(map.getBounds());
    setZoom(map.getZoom());
  }, [map]);

  return { bounds, zoom };
}

export function isInBounds(
  lat: number,
  lng: number,
  bounds: LatLngBounds | null
): boolean {
  if (!bounds) return true;
  return bounds.contains([lat, lng]);
}
