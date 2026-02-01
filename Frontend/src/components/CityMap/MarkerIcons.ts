import L from 'leaflet';

let clubHouseIcon: L.DivIcon | null = null;

export function getClubHouseIcon(): L.DivIcon {
  if (clubHouseIcon) return clubHouseIcon;

  clubHouseIcon = L.divIcon({
    className: 'club-house-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:#0ea5e9;border-radius:8px;box-shadow:0 2px 6px rgba(0,0,0,0.25);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  return clubHouseIcon;
}

let userLocationIcon: L.DivIcon | null = null;

export function getUserLocationIcon(): L.DivIcon {
  if (userLocationIcon) return userLocationIcon;

  userLocationIcon = L.divIcon({
    className: 'user-location-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;"><svg width="28" height="28" viewBox="0 0 24 24" fill="#4285f4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#fff"/></svg></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });

  return userLocationIcon;
}
