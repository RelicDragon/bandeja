import { PlayerAvatar } from '@/components';
import { User } from '@/types';

interface FloatingDraggedPlayerProps {
  player: User | null;
  position: { x: number; y: number };
}

export const FloatingDraggedPlayer = ({ player, position }: FloatingDraggedPlayerProps) => {
  if (!player) return null;

  return (
    <div
      className="fixed pointer-events-none z-50"
      style={{
        left: position.x - 20,
        top: position.y - 20,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <PlayerAvatar 
        player={player}
        showName={false}
        smallLayout={true}
        draggable={false}
      />
    </div>
  );
};

