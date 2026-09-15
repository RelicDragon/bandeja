import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { EVENT_MAX_HEROES } from '@shared/entityCapabilities';
import { mediaApi } from '@/api/media';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { pickImages } from '@/utils/photoCapture';
import { clampEventHeroes, type EventHeroPayload } from '@/utils/createEventPayload';

type EventHeroUploaderProps = {
  heroes: EventHeroPayload[];
  onChange: (heroes: EventHeroPayload[]) => void;
  disabled?: boolean;
};

export function EventHeroUploader({ heroes, onChange, disabled = false }: EventHeroUploaderProps) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);
  const remaining = EVENT_MAX_HEROES - heroes.length;

  const handleAdd = async () => {
    if (remaining <= 0 || uploading || disabled) return;
    const picked = await pickImages(remaining);
    if (!picked?.files?.length) return;
    setUploading(true);
    try {
      const uploaded: EventHeroPayload[] = [];
      for (const file of picked.files) {
        const res = await mediaApi.uploadEventHero(file);
        uploaded.push({ originalUrl: res.originalUrl, thumbnailUrl: res.thumbnailUrl });
      }
      onChange(clampEventHeroes([...heroes, ...uploaded]));
    } catch {
      toast.error(t('marketplace.uploadFailed', { defaultValue: 'Failed to upload image' }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <h2 className="section-title">{t('createEvent.heroes')}</h2>
      <p className="mt-1 mb-3 text-xs text-gray-500 dark:text-gray-400">{t('createEvent.heroesHint')}</p>
      <div className="grid grid-cols-2 gap-3">
        {heroes.map((hero, index) => (
          <div
            key={`${hero.originalUrl}-${index}`}
            className="relative aspect-[16/9] overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700"
          >
            <button
              type="button"
              className="h-full w-full"
              onClick={() => setFullscreenUrl(hero.originalUrl)}
            >
              <img src={hero.thumbnailUrl} alt="" className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              onClick={() => onChange(heroes.filter((_, i) => i !== index))}
              className="absolute top-1.5 right-1.5 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
              aria-label={t('common.remove', { defaultValue: 'Remove' })}
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={uploading || disabled}
            className="aspect-[16/9] rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:border-indigo-500 hover:text-indigo-500 disabled:opacity-50"
          >
            <ImagePlus size={28} strokeWidth={1.5} />
          </button>
        ) : null}
      </div>
      {fullscreenUrl ? (
        <FullscreenImageViewer imageUrl={fullscreenUrl} isOpen onClose={() => setFullscreenUrl(null)} />
      ) : null}
    </div>
  );
}
