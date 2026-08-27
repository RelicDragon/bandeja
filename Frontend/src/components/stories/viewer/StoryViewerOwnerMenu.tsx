import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MoreVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lightHaptic } from '@/utils/lightHaptic';
import { STORY_VIEWER_ICON_BTN } from '../storyViewerIconBtn';
import { setStoryViewerOwnerMenuPaused } from './storyViewerEngagementPause';

type StoryViewerOwnerMenuProps = {
  onDelete: () => Promise<boolean>;
};

type SheetStep = 'menu' | 'confirm';

const EASE = [0.22, 1, 0.36, 1] as const;

export function StoryViewerOwnerMenu({ onDelete }: StoryViewerOwnerMenuProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SheetStep>('menu');
  const [busy, setBusy] = useState(false);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
  }, [busy]);

  useEffect(() => {
    setStoryViewerOwnerMenuPaused(open);
    return () => setStoryViewerOwnerMenuPaused(false);
  }, [open]);

  useEffect(() => {
    if (open) return;
    const delay = reducedMotion ? 0 : 200;
    const id = window.setTimeout(() => setStep('menu'), delay);
    return () => window.clearTimeout(id);
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const root = panelRef.current;
      if (!root) return;
      const focusable = root.querySelector<HTMLElement>('button:not([disabled])');
      focusable?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, step]);

  const confirmDelete = () => {
    if (busy) return;
    setBusy(true);
    lightHaptic();
    setOpen(false);
    void onDelete().finally(() => setBusy(false));
  };

  const sheet = (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="story-owner-sheet"
          className="fixed inset-0 z-[100]"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={reducedMotion ? { duration: 0.01 } : { duration: 0.18, ease: EASE }}
        >
          <button
            type="button"
            className="absolute inset-0 touch-none bg-black/60"
            aria-label={t('stories.viewer.cancel')}
            data-story-interactive
            disabled={busy}
            onClick={close}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-x-0 bottom-0 mx-auto max-w-[428px] overflow-hidden rounded-t-[1.35rem] border border-white/10 bg-zinc-950/95 shadow-[0_-16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
            style={{ paddingBottom: 'max(0.85rem, env(safe-area-inset-bottom, 0px))' }}
            data-story-interactive
            initial={reducedMotion ? { opacity: 0 } : { y: 28, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducedMotion ? { opacity: 0 } : { y: 18, opacity: 0 }}
            transition={
              reducedMotion
                ? { duration: 0.01 }
                : { type: 'spring', stiffness: 460, damping: 36, mass: 0.8 }
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1" aria-hidden>
              <div className="h-1 w-9 rounded-full bg-white/20" />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {step === 'menu' ? (
                <motion.div
                  key="menu"
                  className="px-2.5 pb-2 pt-1"
                  initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.16, ease: EASE }}
                >
                  <p id={titleId} className="sr-only">
                    {t('stories.viewer.moreActions')}
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-start text-[15px] font-medium text-red-400 transition-colors hover:bg-white/[0.07] active:bg-white/[0.11] disabled:opacity-50"
                    onClick={() => {
                      lightHaptic();
                      setStep('confirm');
                    }}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15 ring-1 ring-red-400/20">
                      <Trash2 size={17} strokeWidth={2} />
                    </span>
                    {t('stories.viewer.deleteMyStory')}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="confirm"
                  className="px-4 pb-3 pt-1"
                  initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={{ duration: reducedMotion ? 0.01 : 0.16, ease: EASE }}
                >
                  <h2 id={titleId} className="text-center text-[16px] font-semibold tracking-tight text-white">
                    {t('stories.viewer.deleteStoryTitle')}
                  </h2>
                  <p className="mt-1.5 text-center text-sm leading-snug text-white/60">
                    {t('stories.viewer.deleteStoryConfirm')}
                  </p>
                  <div className="mt-4 flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full rounded-2xl bg-red-500 px-4 py-3.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(239,68,68,0.28)] transition-colors hover:bg-red-500/90 active:bg-red-600 disabled:opacity-60"
                      onClick={confirmDelete}
                    >
                      {t('stories.viewer.deleteStoryAction')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="w-full rounded-2xl bg-white/[0.08] px-4 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.12] active:bg-white/[0.16] disabled:opacity-50"
                      onClick={close}
                    >
                      {t('stories.viewer.cancel')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        className={`pointer-events-auto ${STORY_VIEWER_ICON_BTN}`}
        aria-label={t('stories.viewer.moreActions')}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          if (open) {
            close();
            return;
          }
          lightHaptic();
          setStep('menu');
          setOpen(true);
        }}
      >
        <MoreVertical size={24} className="text-white" strokeWidth={1.75} />
      </button>
      {createPortal(sheet, document.body)}
    </>
  );
}
