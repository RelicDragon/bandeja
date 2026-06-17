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
    className="message-input-action-btn absolute bottom-0.5 right-[2px] z-10 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 text-white disabled:cursor-not-allowed disabled:opacity-50"
    title={title}
    aria-label={ariaLabel}
  >
    <Mic className="w-5 h-5" />
  </motion.button>
);
