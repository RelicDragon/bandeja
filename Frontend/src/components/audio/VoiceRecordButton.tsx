import React from 'react';
import { Mic } from 'lucide-react';
import { motion } from 'framer-motion';

interface VoiceRecordButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
}

export const VoiceRecordButton: React.FC<VoiceRecordButtonProps> = ({
  onClick,
  disabled,
  title,
  'aria-label': ariaLabel,
}) => (
  <motion.button
    type="button"
    whileTap={{ scale: 0.94 }}
    onClick={onClick}
    disabled={disabled}
    className="absolute bottom-0.5 right-[2px] w-11 h-11 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed z-10 shadow-[0_4px_24px_rgba(59,130,246,0.6)]"
    title={title}
    aria-label={ariaLabel}
  >
    <Mic className="w-5 h-5" />
  </motion.button>
);
