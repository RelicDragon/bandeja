import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Loader2, Send } from 'lucide-react';
import type { MonthlyRecapDto, RecapSlide } from '@/api/recap';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerHandle,
} from '@/components/ui/Drawer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { useShareRecapMutation } from '@/queries/recap/useRecapQueries';
import { useRecapFormatters } from '@/features/recap/recapFormat';
import {
  canShareSelection,
  initialSharedSlideKeys,
  toggleSharedSlideKey,
} from '@/features/recap/recapShareSelection';
import { recapSlideShareLabel } from '@/features/recap/recapShareLabels';
import { recapSlideBackgroundClass } from '@/components/stories/slides/recapSlideTheme';

/**
 * PRD 353 — "Share with followers".
 *
 * Slide thumbnails with checkboxes (everything on by default **except** a level
 * drop), a preview strip of what will actually be published, and one primary
 * Share. Sharing is the only thing in the whole feature that makes a recap
 * visible to anyone else.
 */

const MODAL_ID = 'recap-share-sheet';

export interface RecapShareSheetProps {
  open: boolean;
  recap: MonthlyRecapDto;
  onClose: () => void;
}

export const RecapShareSheet = ({ open, recap, onClose }: RecapShareSheetProps) => {
  const { t } = useTranslation();
  const formatters = useRecapFormatters();
  const share = useShareRecapMutation(recap.monthKey);
  useBackButtonModal(open, onClose, MODAL_ID);

  const slides = useMemo(
    () => recap.payload.slides.filter((slide) => slide.kind !== 'OUTRO'),
    [recap.payload.slides],
  );
  const [selected, setSelected] = useState<string[]>(() =>
    initialSharedSlideKeys(slides, recap.sharedSlideKeys),
  );

  useEffect(() => {
    if (!open) return;
    setSelected(initialSharedSlideKeys(slides, recap.sharedSlideKeys));
  }, [open, slides, recap.sharedSlideKeys]);

  const handleToggle = useCallback(
    (key: string) => {
      setSelected((current) => toggleSharedSlideKey(slides, current, key));
    },
    [slides],
  );

  const handleShare = useCallback(async () => {
    try {
      await share.mutateAsync(selected);
      toast.success(t('recap.share.success'));
      onClose();
    } catch {
      toast.error(t('recap.share.failed'));
    }
  }, [share, selected, t, onClose]);

  const previewSlides = useMemo(
    () => slides.filter((slide) => selected.includes(slide.key)),
    [slides, selected],
  );

  return (
    <Drawer
      open={open}
      handleOnly
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DrawerContent
        className="flex max-h-[85dvh] flex-col overflow-hidden bg-white dark:bg-gray-900"
        aria-labelledby={`${MODAL_ID}-title`}
        accessibleTitle={t('recap.share.title')}
      >
        <DrawerHandle className="relative mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-gray-300/90 dark:bg-gray-600" />
        <div data-overlay-chrome="" className="flex shrink-0 items-center gap-3 px-4 pb-1 pt-3">
          <div className="min-w-0 flex-1">
            <h2
              id={`${MODAL_ID}-title`}
              className="truncate text-start text-lg font-semibold tracking-tight text-gray-900 dark:text-white"
            >
              {t('recap.share.title')}
            </h2>
            <p className="truncate text-start text-xs text-gray-500 dark:text-gray-400">
              {t('recap.share.subtitle', {
                month: formatters.monthLong(recap.payload.monthStart),
              })}
            </p>
          </div>
          <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2">
          <ul className="flex flex-col gap-2 py-2">
            {slides.map((slide) => (
              <RecapShareSlideRow
                key={slide.key}
                slide={slide}
                premium={recap.payload.owner.isPremium}
                checked={selected.includes(slide.key)}
                onToggle={handleToggle}
              />
            ))}
          </ul>

          <div className="pt-2">
            <p className="text-start text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('recap.share.previewLabel', { count: previewSlides.length })}
            </p>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {previewSlides.map((slide) => (
                <span
                  key={slide.key}
                  className={`h-16 w-10 shrink-0 rounded-lg ${recapSlideBackgroundClass(
                    slide.kind,
                    recap.payload.owner.isPremium,
                  )}`}
                  aria-hidden
                />
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-100 px-4 pb-[max(1rem,var(--overlay-bottom-inset,0px))] pt-3 dark:border-gray-800">
          <p className="pb-2 text-start text-xs text-gray-500 dark:text-gray-400">
            {t('recap.share.ttlNote')}
          </p>
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={!canShareSelection(selected) || share.isPending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {share.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Send className="h-4 w-4" aria-hidden />
            )}
            {t('recap.share.cta', { count: selected.length })}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

function RecapShareSlideRow({
  slide,
  premium,
  checked,
  onToggle,
}: {
  slide: RecapSlide;
  premium: boolean;
  checked: boolean;
  onToggle: (key: string) => void;
}) {
  const { t } = useTranslation();
  const label = recapSlideShareLabel(slide, t);

  return (
    <li>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onToggle(slide.key)}
        className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-gray-200 px-3 py-2 text-start transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
      >
        <span
          className={`h-12 w-8 shrink-0 rounded-lg ${recapSlideBackgroundClass(slide.kind, premium)}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
            {label}
          </span>
          {slide.sensitive ? (
            <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
              {t('recap.share.sensitiveHint')}
            </span>
          ) : null}
        </span>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
            checked
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-gray-300 text-transparent dark:border-gray-600'
          }`}
          aria-hidden
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      </button>
    </li>
  );
}
