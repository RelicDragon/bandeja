import './CourtLobbyPulseRing.css';

export function CourtLobbyPulseRing() {
  return (
    <div
      className="court-lobby-pulse-ring pointer-events-none absolute left-1/2 top-[54%] h-24 w-32 -translate-x-1/2 -translate-y-1/2"
      aria-hidden
    >
      <span className="court-lobby-pulse-ring__orbit court-lobby-pulse-ring__orbit--outer" />
      <span className="court-lobby-pulse-ring__orbit court-lobby-pulse-ring__orbit--inner" />
      <span className="court-lobby-pulse-ring__ripple" />
      <span className="court-lobby-pulse-ring__ripple court-lobby-pulse-ring__ripple--delayed" />
      <span className="court-lobby-pulse-ring__core" />
    </div>
  );
}
