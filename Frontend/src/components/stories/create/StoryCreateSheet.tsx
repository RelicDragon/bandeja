import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Clapperboard, Upload, type LucideIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { useMediaDropZone } from './hooks/useMediaDropZone';
import type { StoryMediaFile } from './types/storyEditor.types';

type StoryCreateSheetProps = {
  open: boolean;
  onClose: () => void;
  onFilesSelected: (files: StoryMediaFile[]) => void;
  disabled?: boolean;
};

type MediaOptionProps = {
  icon: LucideIcon;
  label: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
  accent: 'photo' | 'video';
};

const ACCENT_STYLES = {
  photo: {
    glow: 'from-sky-400/25 to-blue-600/20 dark:from-sky-500/20 dark:to-blue-600/15',
    icon: 'from-sky-500 to-blue-600 shadow-sky-500/30',
    ring: 'group-hover:ring-sky-400/40 dark:group-hover:ring-sky-500/35',
  },
  video: {
    glow: 'from-violet-400/25 to-fuchsia-600/20 dark:from-violet-500/20 dark:to-fuchsia-600/15',
    icon: 'from-violet-500 to-fuchsia-600 shadow-violet-500/30',
    ring: 'group-hover:ring-violet-400/40 dark:group-hover:ring-violet-500/35',
  },
} as const;

function MediaOption({ icon: Icon, label, hint, disabled, onClick, accent }: MediaOptionProps) {
  const styles = ACCENT_STYLES[accent];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group relative flex flex-col items-center gap-3 rounded-2xl bg-gray-50/90 p-4 pt-5 text-center transition-all duration-200 hover:bg-gray-100/90 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-800/60 dark:hover:bg-gray-800 ring-1 ring-gray-200/80 dark:ring-gray-700/80 hover:ring-gray-300 dark:hover:ring-gray-600 hover:shadow-md"
    >
      <div
        className={`pointer-events-none absolute inset-x-3 top-3 h-16 rounded-xl bg-gradient-to-br opacity-70 blur-md transition-opacity duration-200 group-hover:opacity-100 ${styles.glow}`}
        aria-hidden
      />
      <div
        className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg transition-transform duration-200 group-hover:scale-105 group-active:scale-100 ring-2 ring-transparent ${styles.icon} ${styles.ring}`}
      >
        <Icon size={26} strokeWidth={1.75} />
      </div>
      <div className="relative space-y-0.5">
        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-50">{label}</span>
        <span className="block text-[11px] leading-tight text-gray-500 dark:text-gray-400">{hint}</span>
      </div>
    </button>
  );
}

export function StoryCreateSheet({ open, onClose, onFilesSelected, disabled }: StoryCreateSheetProps) {
  const { t } = useTranslation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const emitAndClose = useCallback(
    (files: StoryMediaFile[]) => {
      if (files.length === 0) return;
      onFilesSelected(files);
      onClose();
    },
    [onClose, onFilesSelected]
  );

  const dropZone = useMediaDropZone({
    disabled,
    onFiles: emitAndClose,
  });

  const pick = (kind: 'IMAGE' | 'VIDEO') => {
    if (disabled) return;
    runWithProfileName(() => {
      if (kind === 'IMAGE') photoInputRef.current?.click();
      else videoInputRef.current?.click();
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-[340px] gap-0 overflow-hidden p-0"
        onPaste={dropZone.handlePaste}
        onDragOver={dropZone.handleDragOver}
        onDragLeave={dropZone.handleDragLeave}
        onDrop={dropZone.handleDrop}
      >
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-500/[0.07] via-transparent to-violet-500/[0.06]" />
        <DialogHeader className="relative border-0 pb-2">
          <DialogTitle className="pr-8">{t('stories.addStory')}</DialogTitle>
          <DialogDescription>{t('stories.addStoryHint')}</DialogDescription>
        </DialogHeader>

        <div
          className={`relative mx-6 mb-3 hidden rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors sm:block ${
            dropZone.isDragging
              ? 'border-sky-400 bg-sky-50/80 dark:border-sky-500 dark:bg-sky-950/30'
              : 'border-gray-200 dark:border-gray-700'
          }`}
        >
          <Upload className="mx-auto mb-2 text-gray-400" size={22} />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('stories.dropPhotosHere')}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('stories.dropPhotosHint')}</p>
        </div>

        <div className="relative grid grid-cols-2 gap-3 px-6 pb-2">
          <MediaOption
            accent="photo"
            icon={Camera}
            label={t('stories.photo')}
            hint={t('stories.photoHint')}
            disabled={disabled}
            onClick={() => pick('IMAGE')}
          />
          <MediaOption
            accent="video"
            icon={Clapperboard}
            label={t('stories.video')}
            hint={t('stories.videoHint')}
            disabled={disabled}
            onClick={() => pick('VIDEO')}
          />
        </div>
        <DialogFooter className="relative border-0 p-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full border-t border-gray-200/80 py-3.5 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700 dark:border-gray-700/80 dark:text-gray-400 dark:hover:bg-gray-800/80 dark:hover:text-gray-200"
          >
            {t('common.cancel')}
          </button>
        </DialogFooter>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => dropZone.handleInputChange(e, 'IMAGE')}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => dropZone.handleInputChange(e, 'VIDEO')}
        />
      </DialogContent>
    </Dialog>
  );
}

