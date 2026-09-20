import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Download, Send, Sparkles, X } from 'lucide-react';
import type { Sport } from '@/types';
import type { StorySegment } from '@/api/stories';
import { FullScreenDialog } from '@/components/ui/FullScreenDialog';
import { StoriesGestureLayer } from '@/components/stories/StoriesGestureLayer';
import { StoriesProgressBars } from '@/components/stories/StoriesProgressBars';
import { RecapStorySlide } from '@/components/stories/slides/RecapStorySlide';
import { useStoriesPlayback } from '@/hooks/useStoriesPlayback';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useAuthStore } from '@/store/authStore';
import { getSportConfig } from '@/sport/sportRegistry';
import { lightHaptic } from '@/utils/lightHaptic';
import { isDocumentRtl, isRovingNavKey, nextRovingIndex } from '@/utils/rovingFocus';
import { useRecapFormatters } from '@/features/recap/recapFormat';
import { recapSlideAltText } from '@/features/recap/recapSlideText';
import { deliverRecapCard, isRecapShareDismissal } from '@/features/recap/recapSaveImage';
import {
  useExportRecapMutation,
  useMarkRecapViewed,
  useRecapDetailQuery,
} from '@/queries/recap/useRecapQueries';
import { RecapShareSheet } from './RecapShareSheet';

/**
 * PRD 353 — the recap reel.
 *
 * Reuses the story viewer's chrome (tap to advance, hold to pause, swipe down
 * to close, keyboard arrows on web) but owns its own shell: an unshared recap
 * is private, so it must never reach the engagement chrome of the shared story
 * viewer, and the outro needs actions the story viewer has no concept of.
 */

type RecapStoryViewerProps = {
  open: boolean;
  monthKey: string | null;
  onClose: () => void;
};

/** Ties the sport `role="tab"` strip to the slide area it controls. */
const RECAP_REEL_PANEL_ID = 'recap-reel-panel';

type RecapSegment = Extract<StorySegment, { sourceType: 'MONTHLY_RECAP' }>;

function isRecapSegment(segment: StorySegment): segment is RecapSegment {
  return segment.sourceType === 'MONTHLY_RECAP';
}

export function RecapStoryViewer({ open, monthKey, onClose }: RecapStoryViewerProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewerId = useAuthStore((s) => s.user?.id);
  const reduceMotion = usePrefersReducedMotion();
  const formatters = useRecapFormatters();
  const markViewed = useMarkRecapViewed();
  const { data, isPending, isError } = useRecapDetailQuery(open ? monthKey : null);
  const exportCard = useExportRecapMutation(monthKey);

  const [index, setIndex] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [activeSport, setActiveSport] = useState<Sport | null>(null);
  const markedRef = useRef<string | null>(null);

  const segments = useMemo(
    () => (data?.segments ?? []).filter(isRecapSegment),
    [data?.segments],
  );
  const sports = useMemo(() => data?.recap.payload.sports.map((s) => s.sport) ?? [], [data]);
  const multisport = sports.length > 1;

  const visibleSegments = useMemo(() => {
    if (!multisport || !activeSport) return segments;
    // The sport tab strip filters the sport-scoped slides only; the cover, the
    // streak and the outro belong to the whole month.
    return segments.filter((seg) => seg.recap.sport == null || seg.recap.sport === activeSport);
  }, [segments, multisport, activeSport]);

  const safeIndex = visibleSegments.length > 0 ? Math.min(index, visibleSegments.length - 1) : 0;
  const segment = visibleSegments[safeIndex];

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setShareOpen(false);
  }, [open, monthKey]);

  useEffect(() => {
    if (!multisport) {
      setActiveSport(null);
      return;
    }
    setActiveSport((current) => current ?? sports[0] ?? null);
  }, [multisport, sports]);

  useEffect(() => {
    if (!open || !monthKey) return;
    if (markedRef.current === monthKey) return;
    markedRef.current = monthKey;
    markViewed(monthKey);
  }, [open, monthKey, markViewed]);

  const handleClose = useCallback(() => {
    lightHaptic();
    onClose();
  }, [onClose]);

  const goNext = useCallback(() => {
    if (safeIndex < visibleSegments.length - 1) {
      lightHaptic();
      setIndex(safeIndex + 1);
      return;
    }
    handleClose();
  }, [safeIndex, visibleSegments.length, handleClose]);

  const goPrev = useCallback(() => {
    if (safeIndex > 0) {
      lightHaptic();
      setIndex(safeIndex - 1);
    }
  }, [safeIndex]);

  const playback = useStoriesPlayback({
    segment: segment ?? null,
    isActive: open && !!segment && !shareOpen,
    onComplete: goNext,
    onMarkViewed: () => {},
  });

  const togglePause = playback.togglePause;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (shareOpen) return;
      const target = e.target instanceof Element ? e.target : null;
      // The sport tab strip owns the arrow keys while it has focus — otherwise
      // "next tab" silently advances the reel instead (CONTRACT §7.1).
      if (target?.closest('[role="tablist"]')) return;
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === ' ') {
        // Space is the default activation key of whatever control has focus;
        // only the bare reel may repurpose it as play/pause.
        if (target?.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, shareOpen, goNext, goPrev, togglePause]);

  // Roving tabindex for the Padel / Tennis strip (`utils/rovingFocus`).
  const sportTabsRef = useRef<HTMLDivElement>(null);
  const handleSportTabsKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isRovingNavKey(event.key)) return;
      const tabs = sportTabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      if (!tabs || tabs.length === 0) return;
      const list = Array.from(tabs);
      const target = nextRovingIndex({
        key: event.key,
        currentIndex: list.indexOf(document.activeElement as HTMLButtonElement),
        enabled: list.map(() => true),
        rtl: isDocumentRtl(),
        // A horizontal `tablist`: Up/Down belong to the page, not to us.
        orientation: 'horizontal',
      });
      if (target == null) return;
      const sport = sports[target];
      if (!sport) return;
      event.preventDefault();
      setActiveSport(sport);
      setIndex(0);
      list[target]?.focus();
    },
    [sports],
  );

  const handleSaveImage = useCallback(async () => {
    if (!monthKey || !data) return;
    try {
      const result = await exportCard.mutateAsync();
      await deliverRecapCard({
        imageUrl: result.imageUrl,
        monthKey,
        shareText: t('recap.share.imageText', {
          month: formatters.monthLong(data.recap.payload.monthStart),
        }),
      });
    } catch (err) {
      if (isRecapShareDismissal(err)) return;
      toast.error(t('recap.share.exportFailed'));
    }
  }, [monthKey, data, exportCard, t, formatters]);

  const handlePlayIntent = useCallback(() => {
    onClose();
    navigate('/?playIntentOpen=1');
  }, [onClose, navigate]);

  const altText = segment ? recapSlideAltText(segment.recap, t, formatters) : '';
  const isOutro = segment?.recap.kind === 'OUTRO';
  const lowActivity = data?.recap.payload.variant === 'LOW_ACTIVITY';

  return (
    <>
    <FullScreenDialog
      open={open}
      onClose={handleClose}
      title={t('recap.viewer.title')}
      closeOnInteractOutside={false}
      overlayClassName="fixed inset-0 z-50 bg-black"
      contentClassName="overflow-hidden"
      bodyClassName="overflow-hidden !overflow-hidden h-full min-h-0"
    >
      <div className="relative h-dvh min-h-0 w-full overflow-hidden bg-slate-950">
        <StoriesGestureLayer
          className="absolute inset-0"
          reducedMotion={reduceMotion}
          onTapLeft={goPrev}
          onTapRight={goNext}
          onLongPressStart={() => playback.setPaused(true)}
          onLongPressEnd={() => playback.setPaused(false)}
          onSwipeDown={handleClose}
          onSwipeLeft={goNext}
          onSwipeRight={goPrev}
        >
          <div
            className="absolute inset-0 overflow-hidden"
            id={RECAP_REEL_PANEL_ID}
            role={multisport ? 'tabpanel' : undefined}
            aria-label={multisport && activeSport ? t(getSportConfig(activeSport).labelKey) : undefined}
          >
            {segment ? (
              <RecapSlideFrame key={segment.key} reduceMotion={reduceMotion}>
                <RecapStorySlide segment={segment} viewerId={viewerId} />
              </RecapSlideFrame>
            ) : (
              <RecapViewerPlaceholder
                loading={isPending}
                failed={isError}
                onRetryClose={handleClose}
              />
            )}
          </div>
        </StoriesGestureLayer>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/60 to-transparent pb-4">
          <StoriesProgressBars
            segments={visibleSegments}
            activeIndex={safeIndex}
            progress={playback.progress}
          />
          {multisport ? (
            <div
              ref={sportTabsRef}
              className="pointer-events-auto mt-2 flex justify-center gap-2 px-3"
              role="tablist"
              aria-orientation="horizontal"
              aria-label={t('recap.viewer.sportTabs')}
              onKeyDown={handleSportTabsKeyDown}
            >
              {sports.map((sport) => {
                const selected = sport === activeSport;
                return (
                  <button
                    key={sport}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={RECAP_REEL_PANEL_ID}
                    tabIndex={selected ? 0 : -1}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSport(sport);
                      setIndex(0);
                    }}
                    className={`min-h-11 rounded-full px-4 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      selected
                        ? 'bg-white text-slate-900'
                        : 'bg-white/15 text-white hover:bg-white/25'
                    }`}
                  >
                    {t(getSportConfig(sport).labelKey)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleClose}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t('recap.viewer.close')}
          className="absolute end-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-40 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>

        {/* The text alternative of the current slide, announced on entry. */}
        <p className="sr-only" aria-live="polite">
          {altText}
        </p>

        {isOutro ? (
          <div
            className="absolute inset-x-0 bottom-0 z-40 flex flex-col gap-2 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]"
            data-story-interactive
          >
            {lowActivity ? (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={handlePlayIntent}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-900"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {t('recap.viewer.playIntentCta')}
              </button>
            ) : (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setShareOpen(true)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-900"
              >
                <Send className="h-4 w-4" aria-hidden />
                {t('recap.viewer.shareCta')}
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => void handleSaveImage()}
              disabled={exportCard.isPending}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-white/40 px-5 text-sm font-semibold text-white disabled:opacity-60"
            >
              <Download className="h-4 w-4" aria-hidden />
              {exportCard.isPending ? t('recap.viewer.savingImage') : t('recap.viewer.saveImageCta')}
            </button>
          </div>
        ) : null}

        {reduceMotion && segment ? (
          <div className="absolute inset-x-0 bottom-24 z-40 flex justify-center" data-story-interactive>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={goNext}
              className="min-h-11 rounded-full bg-white/20 px-5 text-sm font-semibold text-white"
            >
              {t('recap.viewer.next')}
            </button>
          </div>
        ) : null}
      </div>

    </FullScreenDialog>
    {data ? (
      <RecapShareSheet
        open={shareOpen}
        recap={data.recap}
        onClose={() => setShareOpen(false)}
      />
    ) : null}
    </>
  );
}

/**
 * Crossfade 200 ms with a 1.02 scale settle (PRD 353, motion). Reduced motion
 * skips straight to the final state — `initial={false}` is the whole guard.
 */
function RecapSlideFrame({
  children,
  reduceMotion,
}: {
  children: ReactNode;
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      className="h-full w-full"
      initial={reduceMotion ? false : { opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

function RecapViewerPlaceholder({
  loading,
  failed,
  onRetryClose,
}: {
  loading: boolean;
  failed: boolean;
  onRetryClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-sky-600 via-violet-700 to-slate-950 px-8 text-center">
      <p className="text-base font-medium text-white/90">
        {failed ? t('recap.viewer.loadFailed') : t('recap.viewer.loading')}
      </p>
      {failed ? (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onRetryClose}
          className="min-h-11 rounded-2xl bg-white px-5 text-sm font-semibold text-slate-900"
        >
          {t('recap.viewer.close')}
        </button>
      ) : (
        <span className="sr-only">{loading ? t('recap.viewer.loading') : ''}</span>
      )}
    </div>
  );
}
