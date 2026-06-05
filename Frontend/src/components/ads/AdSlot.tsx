import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ConfirmationModal } from '@/components';
import type { AdPlacementKey } from '@/shared/adPlacements';
import { enqueueAdEvent, useAdPlacementEventMeta, useAdPlacements } from '@/hooks/useAdPlacements';
import { AdCard } from './AdCard';
import { adClickNeedsLeavingConfirm, executeAdClick } from './adClickHandler';
import { useAdViewability } from './useAdViewability';

type AdSlotProps = {
  placement: AdPlacementKey;
  className?: string;
};

export function AdSlot({ placement, className }: AdSlotProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getPlacement, dismissPlacement, isOnline } = useAdPlacements();
  const eventMeta = useAdPlacementEventMeta(placement);
  const payload = getPlacement(placement);
  const impressionSentRef = useRef(false);
  const [leavingOpen, setLeavingOpen] = useState(false);

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
    enabled: Boolean(payload && isOnline),
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

  if (!payload) return null;

  return (
    <>
      <div ref={viewRef} className={className ?? 'mb-4 w-full min-w-0'}>
        <AdCard payload={payload} onClick={handleClick} onDismiss={handleDismiss} />
      </div>
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
