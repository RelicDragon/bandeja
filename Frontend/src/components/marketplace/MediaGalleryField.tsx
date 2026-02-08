import { useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';

const MAX_IMAGES = 5;
const THUMB_SIZE = 'w-20 h-20';

interface MediaGalleryFieldProps {
  urls: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  uploading?: boolean;
}

export const MediaGalleryField = ({ urls, onAdd, onRemove, uploading }: MediaGalleryFieldProps) => {
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {urls.map((url, i) => (
          <div
            key={url}
            className={`relative ${THUMB_SIZE} rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-600 shadow-sm cursor-pointer`}
            onClick={() => setFullscreenUrl(url)}
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(i);
              }}
              className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {urls.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={onAdd}
            disabled={uploading}
            className={`${THUMB_SIZE} rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:border-primary-500 hover:text-primary-500 dark:hover:border-primary-400 dark:hover:text-primary-400 transition-colors disabled:opacity-50`}
          >
            <ImagePlus size={28} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {fullscreenUrl && (
        <FullscreenImageViewer
          imageUrl={fullscreenUrl}
          isOpen
          onClose={() => setFullscreenUrl(null)}
        />
      )}
    </>
  );
};
