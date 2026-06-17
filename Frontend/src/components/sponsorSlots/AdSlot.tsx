import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ConfirmationModal } from '@/components';
import type { AdPlacementKey } from '@/shared/adPlacements';
import {
  enqueueAdEvent,
  useAdPlacementEventMeta,
  useAdPlacements,
} from '@/hooks/useAdPlacements';
import { useAuthStore } from '@/store/authStore';
import { useNetworkStore } from '@/utils/networkStatus';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CONTENT_ENTER_Y, LAYOUT_TRANSITION, PANEL_EXIT_Y } from '@/components/motion/motionTokens';
import { AdCard } from './AdCard';
import { adClickNeedsLeavingConfirm, executeAdClick } from './adClickHandler';
import { useAdViewability } from './useAdViewability';

type AdSlotProps = {
  placement: AdPlacementKey;
  className?: string;
};

function useDeferredAdReveal(creativeId: string | undefined, reduceMotion: boolean): boolean {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!creativeId || reduceMotion) {
      setRevealed(Boolean(creativeId));
      return;
    }

    setRevealed(false);
    let cancelled = false;
    const outer = requestAnimationFrame(() => {
      const inner = requestAnimationFrame(() => {
        if (!cancelled) setRevealed(true);
      });
      if (cancelled) cancelAnimationFrame(inner);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
    };
  }, [creativeId, reduceMotion]);

  return revealed;
}

export function AdSlot({ placement, className }: AdSlotProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const reduceMotion = usePrefersReducedMotion();
  const userId = useAuthStore((s) => s.user?.id);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { placements, dismissPlacement } = useAdPlacements();
  const eventMeta = useAdPlacementEventMeta(placement);
  const payload = !isOnline || !userId ? null : placements[placement] ?? null;
  const revealed = useDeferredAdReveal(payload?.creativeId, reduceMotion);
  const impressionSentRef = useRef(false);
  const [leavingOpen, setLeavingOpen] = useState(false);

  useEffect(() => {
    impressionSentRef.current = false;
  }, [payload?.creativeId]);

  const recordImpression = useCallback(() => {
    if (!payload || impressionSentRef.current) return;
    impressionSentRef.current = true;
    enqueueAdEvent({
      type: 'IMPRESSION',
      campaignId: payload.campaignId,
      creativeId: payload.creativeId,
      placement,
      ...eventMeta,
    });
  }, [eventMeta, payload, placement]);

  const viewRef = useAdViewability({
    enabled: Boolean(payload && revealed && isOnline),
    onViewable: recordImpression,
  });

  const runClick = useCallback(async () => {
    if (!payload) return;
    enqueueAdEvent({
      type: 'CLICK',
      campaignId: payload.campaignId,
      creativeId: payload.creativeId,
      placement,
      ...eventMeta,
    });
    await executeAdClick(payload, navigate);
  }, [eventMeta, navigate, payload, placement]);

  const handleClick = useCallback(() => {
    if (!payload) return;
    if (adClickNeedsLeavingConfirm(payload)) {
      setLeavingOpen(true);
      return;
    }
    void runClick();
  }, [payload, runClick]);

  const handleDismiss = useCallback(() => {
    if (!payload) return;
    dismissPlacement(placement, payload, eventMeta);
  }, [dismissPlacement, eventMeta, payload, placement]);

  const showAd = Boolean(payload && revealed);

  return (
    <>
      <AnimatePresence>
        {showAd && payload ? (
          <motion.div
            key={payload.creativeId}
            layout
            ref={viewRef}
            initial={reduceMotion ? false : { opacity: 0, y: CONTENT_ENTER_Y, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: PANEL_EXIT_Y, scale: 0.98 }}
            transition={{
              opacity: { duration: 0.34, ease: [0.21, 0.47, 0.32, 0.98] },
              y: { duration: 0.34, ease: [0.21, 0.47, 0.32, 0.98] },
              scale: { duration: 0.34, ease: [0.21, 0.47, 0.32, 0.98] },
              layout: LAYOUT_TRANSITION,
            }}
            className={className ?? 'mb-4 w-full min-w-0'}
          >
            <AdCard payload={payload} onClick={handleClick} onDismiss={handleDismiss} />
          </motion.div>
        ) : null}
      </AnimatePresence>
      {leavingOpen && (
        <ConfirmationModal
          isOpen
          onClose={() => setLeavingOpen(false)}
          onConfirm={() => {
            setLeavingOpen(false);
            void runClick();
          }}
          title={t('ads.leavingBandejaTitle', { defaultValue: 'Leaving Bandeja' })}
          message={t('ads.leavingBandejaMessage', {
            defaultValue: 'You are about to open an external website. Continue?',
          })}
          confirmText={t('ads.leavingBandejaConfirm', { defaultValue: 'Continue' })}
          cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
          confirmVariant="primary"
        />
      )}
    </>
  );
}
