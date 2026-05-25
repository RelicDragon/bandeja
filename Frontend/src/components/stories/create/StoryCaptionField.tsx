import { useTranslation } from 'react-i18next';
import { STORY_CAPTION_MAX_CHARS } from '@/api/storyEngagement';

type StoryCaptionFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function StoryCaptionField({ value, onChange, disabled }: StoryCaptionFieldProps) {
  const { t } = useTranslation();
  const showCounter = value.length > STORY_CAPTION_MAX_CHARS - 30;

  return (
    <div className="relative z-40 mx-4 mb-2 rounded-xl bg-black/45 px-3 py-2 backdrop-blur-sm">
      <label className="sr-only" htmlFor="story-caption-input">
        {t('stories.captionLabel')}
      </label>
      <input
        id="story-caption-input"
        type="text"
        value={value}
        disabled={disabled}
        maxLength={STORY_CAPTION_MAX_CHARS}
        placeholder={t('stories.captionPlaceholder')}
        onChange={(e) => onChange(e.target.value.slice(0, STORY_CAPTION_MAX_CHARS))}
        className="w-full bg-transparent text-sm text-white placeholder:text-white/50 outline-none disabled:opacity-50"
        data-story-interactive
      />
      {showCounter ? (
        <p className="mt-1 text-right text-[10px] tabular-nums text-white/50">
          {value.length}/{STORY_CAPTION_MAX_CHARS}
        </p>
      ) : null}
    </div>
  );
}
