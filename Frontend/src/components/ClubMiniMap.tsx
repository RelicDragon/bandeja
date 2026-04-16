import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { getClubHouseIcon } from '@/components/CityMap/MarkerIcons';
import 'leaflet/dist/leaflet.css';

function InvalidateSizeOnMount() {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => window.clearTimeout(id);
  }, [map]);
  return null;
}

type ClubMiniMapProps = {
  latitude: number;
  longitude: number;
};

export function ClubMiniMap({ latitude, longitude }: ClubMiniMapProps) {
  return (
    <div className="h-44 w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
      <MapContainer
        center={[latitude, longitude]}
        zoom={15}
        className="h-full w-full z-0"
        scrollWheelZoom={false}
        attributionControl
      >
        <InvalidateSizeOnMount />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[latitude, longitude]} icon={getClubHouseIcon()} />
      </MapContainer>
    </div>
  );
}
