import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { STORY_VIEWER_ICON_BTN } from '../storyViewerIconBtn';
import { setStoryViewerOwnerMenuPaused } from './storyViewerEngagementPause';

type StoryViewerOwnerMenuProps = {
  onDelete: () => void | Promise<void>;
  deleting?: boolean;
};

type SheetStep = 'menu' | 'confirm';

export function StoryViewerOwnerMenu({ onDelete, deleting = false }: StoryViewerOwnerMenuProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<SheetStep>('menu');

  useEffect(() => {
    setStoryViewerOwnerMenuPaused(open);
    return () => setStoryViewerOwnerMenuPaused(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  const close = () => {
    if (deleting) return;
    setOpen(false);
    setStep('menu');
  };

  const openMenu = () => {
    setStep('menu');
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className={`pointer-events-auto ${STORY_VIEWER_ICON_BTN}`}
        aria-label={t('stories.viewer.moreActions')}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.stopPropagation();
          if (open) close();
          else openMenu();
        }}
      >
        <MoreVertical size={24} className="text-white" strokeWidth={1.75} />
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[80]" role="presentation">
              <button
                type="button"
                className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                aria-label={t('stories.viewer.cancel')}
                data-story-interactive
                disabled={deleting}
                onClick={close}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="story-owner-actions-title"
                className="absolute inset-x-0 bottom-0 mx-auto max-w-[428px] overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-900/98 shadow-[0_-12px_40px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}
                data-story-interactive
              >
                <div className="flex justify-center pt-3 pb-1" aria-hidden>
                  <div className="h-1 w-10 rounded-full bg-white/25" />
                </div>
                {step === 'menu' ? (
                  <div className="px-2 pb-2 pt-1">
                    <p id="story-owner-actions-title" className="sr-only">
                      {t('stories.viewer.moreActions')}
                    </p>
                    <button
                      type="button"
                      disabled={deleting}
                      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-medium text-red-400 transition-colors hover:bg-white/8 active:bg-white/12 disabled:opacity-50"
                      onClick={() => setStep('confirm')}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500/15">
                        <Trash2 size={18} strokeWidth={2} />
                      </span>
                      {t('stories.viewer.deleteMyStory')}
                    </button>
                  </div>
                ) : (
                  <div className="px-4 pb-3 pt-1">
                    <h2
                      id="story-owner-actions-title"
                      className="text-center text-base font-semibold text-white"
                    >
                      {t('stories.viewer.deleteStoryTitle')}
                    </h2>
                    <p className="mt-1.5 text-center text-sm leading-snug text-white/65">
                      {t('stories.viewer.deleteStoryConfirm')}
                    </p>
                    <div className="mt-4 flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={deleting}
                        className="w-full rounded-2xl bg-red-500 px-4 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-red-500/90 active:bg-red-600 disabled:opacity-60"
                        onClick={() => {
                          void Promise.resolve(onDelete()).then(() => {
                            setOpen(false);
                            setStep('menu');
                          });
                        }}
                      >
                        {deleting
                          ? t('stories.viewer.deletingStory')
                          : t('stories.viewer.deleteStoryAction')}
                      </button>
                      <button
                        type="button"
                        disabled={deleting}
                        className="w-full rounded-2xl bg-white/10 px-4 py-3.5 text-[15px] font-medium text-white transition-colors hover:bg-white/14 active:bg-white/18 disabled:opacity-50"
                        onClick={close}
                      >
                        {t('stories.viewer.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
