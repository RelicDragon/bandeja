import { useTranslation } from 'react-i18next';
import { STORY_CAPTION_MAX_CHARS } from '@/api/storyEngagement';

type PhotoStoryCaptionDrawerProps = {
  open: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  disabled?: boolean;
};

export function PhotoStoryCaptionDrawer({
  open,
  value,
  onChange,
  onClose,
  disabled,
}: PhotoStoryCaptionDrawerProps) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-50 rounded-t-2xl bg-zinc-900/98 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(0,0,0,0.45)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-white/90">{t('stories.captionLabel')}</span>
        <button type="button" onClick={onClose} className="text-sm text-sky-400 font-medium">
          {t('common.done')}
        </button>
      </div>
      <input
        type="text"
        value={value}
        disabled={disabled}
        maxLength={STORY_CAPTION_MAX_CHARS}
        placeholder={t('stories.captionPlaceholder')}
        onChange={(e) => onChange(e.target.value.slice(0, STORY_CAPTION_MAX_CHARS))}
        className="w-full rounded-xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 outline-none"
        autoFocus
      />
    </div>
  );
}
