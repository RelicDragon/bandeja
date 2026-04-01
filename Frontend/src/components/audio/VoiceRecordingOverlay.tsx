import React from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AudioWaveform } from './AudioWaveform';
import { formatDurationClock } from './audioWaveformUtils';

interface VoiceRecordingOverlayProps {
  durationMs: number;
  liveLevels: number[];
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

export const VoiceRecordingOverlay: React.FC<VoiceRecordingOverlayProps> = ({
  durationMs,
  liveLevels,
  busy = false,
  onCancel,
  onConfirm,
}) => {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 sm:gap-3 w-full min-w-0 max-w-full rounded-[24px] border border-red-200 dark:border-red-900/50 bg-red-50/90 dark:bg-red-950/40 px-2.5 sm:px-3 py-2 shadow-inner"
    >
      <span className="flex h-2.5 w-2.5 flex-shrink-0 rounded-full bg-red-500 animate-pulse" aria-hidden />
      <span className="text-sm tabular-nums text-red-800 dark:text-red-200 font-medium shrink-0 w-[40px] sm:min-w-[42px] sm:w-auto">
        {formatDurationClock(durationMs)}
      </span>
      <div className="flex-1 min-w-0 h-9 overflow-hidden">
        <AudioWaveform levels={liveLevels.length ? liveLevels : Array.from({ length: 48 }, () => 0.1)} variant="live" isOwn />
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="flex-shrink-0 w-10 h-10 rounded-full border border-gray-300 dark:border-gray-600 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
        aria-label={t('chat.voice.cancelRecording', { defaultValue: 'Cancel recording' })}
      >
        <X className="w-5 h-5" />
      </button>
      <button
        type="button"
        onClick={() => void onConfirm()}
        disabled={busy}
        className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 text-white flex items-center justify-center hover:opacity-95 disabled:opacity-50"
        aria-label={t('chat.voice.sendRecording', { defaultValue: 'Send voice message' })}
      >
        {busy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-5 h-5" />}
      </button>
    </motion.div>
  );
};
