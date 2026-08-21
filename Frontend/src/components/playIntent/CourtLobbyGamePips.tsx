type Props = {
  playing: number;
  max: number;
};

export function CourtLobbyGamePips({ playing, max }: Props) {
  const filled = Math.max(0, Math.min(max, playing));
  if (max > 6) {
    return (
      <span className="court-lobby-arena__game-pips" aria-hidden>
        {filled}/{max}
      </span>
    );
  }
  return (
    <span className="court-lobby-arena__game-pips is-dots" aria-hidden>
      {Array.from({ length: max }, (_, index) => (
        <i key={index} className={index < filled ? 'is-filled' : undefined} />
      ))}
    </span>
  );
}
