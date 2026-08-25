import { CourtLobbyAvatarImage } from '@/components/playIntent/CourtLobbyAvatarImage';
import {
  matchingGameFaces,
  matchingGameInitials,
} from '@/components/playIntent/matchingLobbyGames';
import type { MatchingLobbyGame } from '@/api/playIntents';

export function CourtLobbyGameComposite({ game }: { game: MatchingLobbyGame }) {
  const faces = matchingGameFaces(game).slice(0, 3);
  if (faces.length === 0) {
    return <span className="court-lobby-arena__game-empty">?</span>;
  }
  if (faces.length === 1) {
    const face = faces[0];
    return (
      <CourtLobbyAvatarImage
        avatar={face.avatar}
        initials={matchingGameInitials(face)}
        imgClassName="h-full w-full object-cover"
        initialsClassName="court-lobby-arena__avatar-initials"
      />
    );
  }
  return (
    <span
      className={`court-lobby-arena__game-faces is-${faces.length}`}
      aria-hidden
    >
      {faces.map((face) => (
        <span key={face.userId} className="court-lobby-arena__game-face">
          <CourtLobbyAvatarImage
            avatar={face.avatar}
            initials={matchingGameInitials(face)}
            imgClassName="h-full w-full object-cover"
            initialsClassName="court-lobby-arena__avatar-initials"
          />
        </span>
      ))}
    </span>
  );
}
