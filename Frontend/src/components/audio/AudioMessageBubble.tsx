import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FileText, Loader2, Pause, Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ChatMessage } from '@/api/chat';
import { AudioWaveform } from './AudioWaveform';
import { AudioSkip10Button } from './AudioSkip10Button';
import { formatDurationClock, resolveChatMediaUrl } from './audioWaveformUtils';
import { useAudioPlaybackStore } from '@/store/audioPlaybackStore';

interface AudioMessageBubbleProps {
  message: ChatMessage;
  isOwnMessage: boolean;
  isChannel: boolean;
  onTranscribe?: () => void;
  isTranscribing?: boolean;
}

export const AudioMessageBubble: React.FC<AudioMessageBubbleProps> = ({
  message,
  isOwnMessage,
  isChannel,
  onTranscribe,
  isTranscribing,
}) => {
  const { t } = useTranslation();
  const url = resolveChatMediaUrl(message.mediaUrls[0] || '');
  const durationMs = message.audioDurationMs ?? 0;
  const peaks = message.waveformData?.length ? message.waveformData : undefined;

  const activeMessageId = useAudioPlaybackStore((s) => s.activeMessageId);
  const isPlaying = useAudioPlaybackStore((s) => s.isPlaying);
  const currentTime = useAudioPlaybackStore((s) => s.currentTime);
  const duration = useAudioPlaybackStore((s) => s.duration);
  const playbackRate = useAudioPlaybackStore((s) => s.playbackRate);
  const toggle = useAudioPlaybackStore((s) => s.toggle);
  const cycleRate = useAudioPlaybackStore((s) => s.cycleRate);
  const seekBy = useAudioPlaybackStore((s) => s.seekBy);

  const isActive = activeMessageId === message.id;
  const messageDurSec = durationMs > 0 ? durationMs / 1000 : 0;
  const browserDurSec = isActive && duration > 0 ? duration : 0;
  const timelineSec = messageDurSec > 0 ? messageDurSec : browserDurSec;
  const pos = isActive ? currentTime : 0;
  const playedRatio =
    timelineSec > 0 ? Math.min(1, Math.max(0, pos / timelineSec)) : 0;
  const showSkips = durationMs > 10_000 && isActive;
  const bubbleVariant = isChannel ? 'channel' : isOwnMessage ? 'own' : 'other';
  const maxDurSec = durationMs > 0 ? durationMs / 1000 : undefined;
  const timeActiveBackdrop = isChannel
    ? 'bg-black/[0.08] dark:bg-white/[0.12] backdrop-blur-md ring-1 ring-inset ring-black/[0.06] dark:ring-white/[0.08] shadow-sm'
    : isOwnMessage
      ? 'bg-black/20 backdrop-blur-md ring-1 ring-inset ring-white/15 shadow-md'
      : 'bg-white/80 dark:bg-black/45 backdrop-blur-md ring-1 ring-inset ring-black/[0.05] dark:ring-white/10 shadow-sm';

  const levels = useMemo(() => {
    if (peaks?.length) return peaks;
    return Array.from({ length: 48 }, () => 0.12);
  }, [peaks]);

  const waveformHeight = 32;
  const labelBandPx = 14;

  const waveTrackRef = useRef<HTMLDivElement>(null);
  const currentTimeLabelRef = useRef<HTMLSpanElement>(null);
  const [currentTimeLabelLeft, setCurrentTimeLabelLeft] = useState(0);

  const recomputeCurrentTimeLabelLeft = useCallback(() => {
    const track = waveTrackRef.current;
    const label = currentTimeLabelRef.current;
    if (!track || !label || !isActive) return;
    const cw = track.clientWidth;
    if (cw <= 0) return;
    const lw = label.offsetWidth || 1;
    const center = playedRatio * cw;
    const x = Math.max(0, Math.min(cw - lw, center - lw / 2));
    setCurrentTimeLabelLeft(x);
  }, [isActive, playedRatio]);

  useLayoutEffect(() => {
    if (!isActive) return;
    recomputeCurrentTimeLabelLeft();
  }, [isActive, recomputeCurrentTimeLabelLeft, pos]);

  useEffect(() => {
    if (!isActive) return;
    const track = waveTrackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => recomputeCurrentTimeLabelLeft());
    ro.observe(track);
    return () => ro.disconnect();
  }, [isActive, recomputeCurrentTimeLabelLeft]);

  const bandTween = { duration: 0.22, ease: [0.33, 1, 0.68, 1] as const };
  const presenceTween = { duration: 0.18, ease: [0.33, 1, 0.68, 1] as const };

  const hasTranscription = !!message.audioTranscription?.transcription?.trim();
  const showTranscribeBtn = !!onTranscribe && !hasTranscription;

  return (
    <div
      className={`relative flex min-w-[200px] max-w-[min(100%,380px)] flex-col gap-1 px-3 ${showSkips ? 'pt-2 pb-0' : 'py-2'}`}
    >
      <div className="flex min-w-0 flex-1 gap-2">
        <div className="flex shrink-0 flex-col">
          <motion.div
            initial={false}
            animate={{ height: isActive ? labelBandPx : 0, opacity: isActive ? 1 : 0 }}
            transition={bandTween}
            className="w-10 shrink-0 overflow-hidden"
            aria-hidden
          />
          <div className="flex items-center justify-center" style={{ height: waveformHeight }}>
            <button
              type="button"
              onClick={() => url && toggle(message.id, url)}
              disabled={!url}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-transform hover:scale-105 ${
                isChannel
                  ? 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100'
                  : isOwnMessage
                    ? 'bg-white/20 text-white'
                    : 'bg-blue-600 text-white dark:bg-blue-500'
              }`}
              aria-pressed={isActive && isPlaying}
              aria-label={t('chat.voice.playPause', { defaultValue: 'Play or pause voice message' })}
            >
              {isActive && isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 pl-0.5" />}
            </button>
          </div>
        </div>
        <div ref={waveTrackRef} className="relative flex min-w-0 flex-1 flex-col overflow-visible">
          <motion.div
            initial={false}
            animate={{ height: isActive ? labelBandPx : 0, opacity: isActive ? 1 : 0 }}
            transition={bandTween}
            className="relative min-w-0 overflow-hidden"
          >
            <div className="relative h-3.5 min-w-0">
              {isActive && (
                <span
                  ref={currentTimeLabelRef}
                  className={`pointer-events-none absolute top-0 z-10 rounded-md px-1 py-0.5 text-[10px] font-medium tabular-nums leading-none ${timeActiveBackdrop}`}
                  style={{ left: currentTimeLabelLeft }}
                  aria-live="polite"
                >
                  {formatDurationClock(pos * 1000)}
                </span>
              )}
            </div>
          </motion.div>
          <div className="min-w-0 shrink-0">
            <AudioWaveform
              levels={levels}
              playedRatio={playedRatio}
              variant="playback"
              isOwn={!isChannel && isOwnMessage}
              height={waveformHeight}
            />
          </div>
          <AnimatePresence initial={false} mode="popLayout">
            {showSkips && (
              <motion.div
                key="voice-skips"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                transition={presenceTween}
                className="flex w-full shrink-0 justify-center gap-2 pt-0 leading-none"
              >
                <AudioSkip10Button
                  direction="back"
                  variant={bubbleVariant}
                  disabled={!url}
                  aria-label={t('chat.voice.skipBack10', { defaultValue: 'Skip back 10 seconds' })}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekBy(message.id, -10, maxDurSec);
                  }}
                />
                <AudioSkip10Button
                  direction="forward"
                  variant={bubbleVariant}
                  disabled={!url}
                  aria-label={t('chat.voice.skipForward10', { defaultValue: 'Skip forward 10 seconds' })}
                  onClick={(e) => {
                    e.stopPropagation();
                    seekBy(message.id, 10, maxDurSec);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center gap-1">
          <span className="relative inline-flex h-5 shrink-0 items-stretch">
            {formatDurationClock(durationMs)}
          </span>
          <AnimatePresence initial={false} mode="popLayout">
            {isActive && (
              <motion.button
                key="voice-rate"
                type="button"
                initial={{ opacity: 0, scale: 0.96, y: 3 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 2 }}
                transition={presenceTween}
                onClick={(e) => {
                  e.stopPropagation();
                  cycleRate();
                }}
                className="flex h-5 min-w-[2.25rem] items-center justify-center rounded-md text-[10px] font-semibold tabular-nums leading-none ring-1 ring-inset ring-black/10 dark:ring-white/15 bg-black/[0.08] dark:bg-white/10"
              >
                {playbackRate}×
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
      {showTranscribeBtn && (
        <div className="flex justify-end pr-0.5">
          <button
            type="button"
            disabled={isTranscribing}
            onClick={(e) => {
              e.stopPropagation();
              onTranscribe?.();
            }}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium transition-opacity ring-1 ring-inset disabled:opacity-50 ${
              isChannel
                ? 'text-gray-700 dark:text-gray-200 ring-black/10 dark:ring-white/15 bg-black/[0.04] dark:bg-white/10'
                : isOwnMessage
                  ? 'text-white/95 ring-white/25 bg-white/15'
                  : 'text-blue-700 dark:text-blue-200 ring-blue-200/80 dark:ring-blue-500/40 bg-blue-50/90 dark:bg-blue-950/40'
            }`}
            aria-busy={isTranscribing}
            aria-label={t('chat.voice.transcribe', { defaultValue: 'Transcribe voice message' })}
          >
            {isTranscribing ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 opacity-90" />
            )}
            <span>{isTranscribing ? t('chat.voice.transcribing', { defaultValue: 'Transcribing…' }) : t('chat.voice.transcribe', { defaultValue: 'Transcribe' })}</span>
          </button>
        </div>
      )}
    </div>
  );
};
