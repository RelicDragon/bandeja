import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '@/components';
import { BasicUser } from '@/types';

interface FloatingDraggedPlayerProps {
  player: BasicUser | null;
  position: { x: number; y: number };
}

export const FloatingDraggedPlayer = ({ player, position }: FloatingDraggedPlayerProps) => {
  if (!player) return null;

  return createPortal(
    <div
      className="fixed pointer-events-none z-50"
      style={{
        left: position.x - 20,
        top: position.y - 20,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1.15, opacity: 1, rotate: -4 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className="rounded-full shadow-2xl shadow-blue-500/40 ring-2 ring-blue-400/70 ring-offset-2 ring-offset-transparent"
      >
        <PlayerAvatar 
          player={player}
          showName={false}
          smallLayout={true}
          draggable={false}
        />
      </motion.div>
    </div>,
    document.body
  );
};
