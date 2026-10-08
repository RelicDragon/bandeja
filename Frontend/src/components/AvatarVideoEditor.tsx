import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import { X } from 'lucide-react';
import { Button } from './Button';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { AnimatedAvatarPill } from './AnimatedAvatarPill';
import {
  resolveAvatarExportPixelCrop,
  type CropPoint,
  type CropSize,
  type MediaSize,
  type PixelCrop,
} from '@/utils/avatarCropArea';
import {
  dragTrimHandle,
  filmstripTimes,
  initialTrimWindow,
  moveTrimWindow,
  trimFrameTimes,
  trimPlaybackFps,
  type TrimWindow,
} from '@/utils/avatarVideoTrim';
import { extractFilmstrip, extractVideoAvatarFrames } from '@/utils/animatedAvatar';

const FILMSTRIP_THUMBS = 8;
/** Extraction is most of the wait on phones; upload is the tail. */
const EXTRACT_SHARE = 0.7;

interface AvatarVideoEditorProps {
  videoFile: File;
  /** Frames are 256x256 squares; resolve once the avatar is saved (throw to keep the editor open). */
  onSubmit: (frames: Blob[], fps: number, onUploadProgress: (fraction: number) => void) => Promise<void>;
  onCancel: () => void;
}

type Phase = 'edit' | 'extracting' | 'uploading';

function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-3" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <svg width="76" height="76" viewBox="0 0 76 76" className="-rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="4" />
        <circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          className="text-white transition-[stroke-dashoffset] duration-200 ease-out"
        />
      </svg>
      <span className="text-sm font-medium text-white/85">{label}</span>
    </div>
  );
}

export const AvatarVideoEditor: React.FC<AvatarVideoEditorProps> = ({ videoFile, onSubmit, onCancel }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(true);
  const [videoUrl, setVideoUrl] = useState('');
  const [duration, setDuration] = useState(0);
  const [win, setWin] = useState<TrimWindow>({ start: 0, end: 0 });
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [decodeError, setDecodeError] = useState(false);
  const [phase, setPhase] = useState<Phase>('edit');
  const [progress, setProgress] = useState(0);

  const [crop, setCrop] = useState<CropPoint>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [mediaSize, setMediaSize] = useState<MediaSize | null>(null);
  const [cropSize, setCropSize] = useState<CropSize | null>(null);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<PixelCrop | null>(null);

  const videoRef = useRef<React.RefObject<HTMLVideoElement> | null>(null);
  const winRef = useRef(win);
  const scrubbingRef = useRef(false);
  const phaseRef = useRef<Phase>('edit');
  const playheadRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  winRef.current = win;
  phaseRef.current = phase;

  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setVideoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  const video = () => videoRef.current?.current ?? null;

  // Wire metadata / errors once the cropper mounts its <video>.
  useEffect(() => {
    if (!videoUrl) return;
    let el: HTMLVideoElement | null = null;
    let raf = 0;
    const attach = () => {
      el = video();
      if (!el) {
        raf = requestAnimationFrame(attach);
        return;
      }
      el.loop = false;
      const onMeta = () => {
        const d = Number.isFinite(el!.duration) ? el!.duration : 0;
        if (d <= 0) return;
        setDuration(d);
        setWin(initialTrimWindow(d));
      };
      const onError = () => setDecodeError(true);
      el.addEventListener('loadedmetadata', onMeta);
      el.addEventListener('error', onError);
      if (el.readyState >= 1) onMeta();
      if (el.error) onError();
    };
    attach();
    return () => cancelAnimationFrame(raf);
  }, [videoUrl]);

  // Loop the trim window and move the playhead without re-rendering.
  useEffect(() => {
    if (duration <= 0) return;
    let raf = 0;
    const tick = () => {
      const el = video();
      const w = winRef.current;
      if (el && phaseRef.current === 'edit' && !scrubbingRef.current) {
        if (el.currentTime >= w.end - 0.02 || el.currentTime < w.start - 0.05 || el.ended) {
          el.currentTime = w.start;
        }
        if (el.paused) void el.play().catch(() => undefined);
      }
      if (el && playheadRef.current && trackRef.current) {
        const x = (el.currentTime / duration) * trackRef.current.clientWidth;
        playheadRef.current.style.transform = `translateX(${x}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration]);

  useEffect(() => {
    if (!videoUrl || duration <= 0) return;
    let cancelled = false;
    extractFilmstrip(videoUrl, filmstripTimes(duration, FILMSTRIP_THUMBS))
      .then((out) => !cancelled && setThumbs(out))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [videoUrl, duration]);

  useLayoutEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackWidth(el.clientWidth));
    ro.observe(el);
    setTrackWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [duration]);

  const busy = phase !== 'edit';

  const handleClose = () => {
    if (busy) return;
    setIsOpen(false);
    setTimeout(onCancel, 300);
  };

  const xToTime = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return 0;
    return ((clientX - rect.left) / rect.width) * duration;
  };

  const seekPreview = (time: number) => {
    const el = video();
    if (!el) return;
    el.pause();
    el.currentTime = time;
  };

  const startDrag = (kind: 'start' | 'end' | 'move') => (e: React.PointerEvent) => {
    if (busy || duration <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrubbingRef.current = true;
    const origin = winRef.current;
    const originTime = xToTime(e.clientX);
    const onMove = (ev: PointerEvent) => {
      const time = xToTime(ev.clientX);
      const next =
        kind === 'move'
          ? moveTrimWindow(origin, time - originTime, duration)
          : dragTrimHandle(winRef.current, kind, time, duration);
      winRef.current = next;
      setWin(next);
      seekPreview(kind === 'end' ? Math.max(next.start, next.end - 0.04) : next.start);
    };
    const onUp = () => {
      scrubbingRef.current = false;
      const el = video();
      if (el) el.currentTime = winRef.current.start;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const nudge = (kind: 'start' | 'end') => (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -0.1 : e.key === 'ArrowRight' ? 0.1 : 0;
    if (!step) return;
    e.preventDefault();
    const w = winRef.current;
    setWin(dragTrimHandle(w, kind, (kind === 'start' ? w.start : w.end) + step, duration));
  };

  const pixelCrop = resolveAvatarExportPixelCrop(
    { crop, zoom, rotation: 0, mediaSize, cropSize, aspect: 1 },
    croppedAreaPixels
  );

  const handleUse = useCallback(async () => {
    const el = video();
    if (!el || !pixelCrop || busy) return;
    setPhase('extracting');
    setProgress(0);
    try {
      const times = trimFrameTimes(winRef.current);
      const frames = await extractVideoAvatarFrames(el, pixelCrop, times, (done, total) =>
        setProgress((done / total) * EXTRACT_SHARE)
      );
      setPhase('uploading');
      await onSubmit(frames, trimPlaybackFps(winRef.current, frames.length), (f) =>
        setProgress(EXTRACT_SHARE + f * (1 - EXTRACT_SHARE))
      );
      setProgress(1);
      setIsOpen(false);
      setTimeout(onCancel, 300);
    } catch (error) {
      console.error('Video avatar failed:', error);
      setPhase('edit');
      setProgress(0);
    }
  }, [pixelCrop, busy, onSubmit, onCancel]);

  const len = Math.max(0, win.end - win.start);
  const leftPx = duration > 0 ? (win.start / duration) * trackWidth : 0;
  const widthPx = duration > 0 ? (len / duration) * trackWidth : 0;

  return (
    <FullScreenDialog open={isOpen} onClose={handleClose} modalId="avatar-video-editor" closeOnInteractOutside={false} title={t('profile.animatedAvatarVideoTitle')}>
      <div className="fixed inset-0 flex flex-col bg-black text-white">
        <div className="relative flex shrink-0 items-center justify-between gap-3 px-2 pb-2" style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top, 0px))' }}>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label={t('common.cancel')}
            className="flex h-11 w-11 items-center justify-center rounded-full text-white/85 transition-opacity hover:bg-white/10 disabled:opacity-40"
          >
            <X size={22} />
          </button>
          <AnimatedAvatarPill />
          <span className="h-11 w-11" aria-hidden />
        </div>

        <div className="relative min-h-0 flex-1">
          {decodeError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
              <p className="max-w-xs text-sm leading-relaxed text-white/80">{t('profile.animatedAvatarDecodeError')}</p>
              <Button variant="secondary" onClick={handleClose}>
                {t('profile.animatedAvatarChooseAnother')}
              </Button>
            </div>
          ) : (
            videoUrl && (
              <Cropper
                video={videoUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, px) => setCroppedAreaPixels(px)}
                onCropAreaChange={(_, px) => setCroppedAreaPixels(px)}
                setMediaSize={setMediaSize}
                setCropSize={setCropSize}
                setVideoRef={(ref) => {
                  videoRef.current = ref;
                }}
                mediaProps={{ preload: 'auto' } as React.VideoHTMLAttributes<HTMLVideoElement>}
              />
            )
          )}
          {busy && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75">
              <ProgressRing
                value={progress}
                label={phase === 'extracting' ? t('profile.animatedAvatarPreparing') : t('profile.animatedAvatarUploading')}
              />
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pt-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto max-w-md">
            <div className="mb-2 flex items-baseline justify-between text-xs text-white/60">
              <span>{t('profile.animatedAvatarTrimHint')}</span>
              <span className="tabular-nums text-white/90">{t('profile.animatedAvatarSeconds', { value: len.toFixed(1) })}</span>
            </div>

            {/* Time runs left→right in every locale. */}
            <div dir="ltr" className="relative h-14 select-none touch-none px-0">
              <div ref={trackRef} className="absolute inset-0 overflow-hidden rounded-lg bg-white/10">
                <div className="flex h-full w-full">
                  {thumbs.map((src, i) => (
                    <img key={i} src={src} alt="" className="h-full min-w-0 flex-1 object-cover" draggable={false} />
                  ))}
                </div>
                <div className="absolute inset-y-0 left-0 bg-black/60" style={{ width: leftPx }} />
                <div className="absolute inset-y-0 right-0 bg-black/60" style={{ left: leftPx + widthPx }} />
                <div ref={playheadRef} className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-white/90 shadow-[0_0_4px_rgba(0,0,0,0.6)]" />
              </div>

              {duration > 0 && (
                <div
                  className="absolute inset-y-0 cursor-grab rounded-lg ring-2 ring-inset ring-amber-300 active:cursor-grabbing"
                  style={{ left: leftPx, width: widthPx }}
                  onPointerDown={startDrag('move')}
                >
                  {(['start', 'end'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      aria-label={t(kind === 'start' ? 'profile.animatedAvatarTrimStart' : 'profile.animatedAvatarTrimEnd')}
                      onPointerDown={startDrag(kind)}
                      onKeyDown={nudge(kind)}
                      className={`absolute inset-y-0 z-10 flex w-11 cursor-ew-resize items-center justify-center focus:outline-none ${kind === 'start' ? '-left-[22px]' : '-right-[22px]'}`}
                    >
                      <span className="flex h-full w-3 items-center justify-center rounded-md bg-amber-300 shadow-md">
                        <span className="h-4 w-0.5 rounded-full bg-black/45" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={handleClose} disabled={busy} className="h-12 flex-1">
                {t('common.cancel')}
              </Button>
              <Button onClick={() => void handleUse()} disabled={busy || decodeError || !pixelCrop || duration <= 0} className="h-12 flex-1">
                {t('profile.animatedAvatarUse')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </FullScreenDialog>
  );
};
