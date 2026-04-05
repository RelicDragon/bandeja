import { RefreshCw, X } from 'lucide-react';

type MessageInputImagePreviewStripProps = {
  imagePreviewUrls: string[];
  onRemove: (index: number) => void;
  failedSlotIndices?: ReadonlySet<number>;
  retryingSlotIndex?: number | null;
  onRetrySlot?: (index: number) => void;
};

export function MessageInputImagePreviewStrip({
  imagePreviewUrls,
  onRemove,
  failedSlotIndices,
  retryingSlotIndex = null,
  onRetrySlot,
}: MessageInputImagePreviewStripProps) {
  if (imagePreviewUrls.length === 0) return null;
  return (
    <div className="mb-3 flex gap-2 overflow-x-auto overflow-y-visible pb-1">
      {imagePreviewUrls.map((url, index) => {
        const failed = failedSlotIndices?.has(index) ?? false;
        const retrying = retryingSlotIndex === index;
        return (
          <div key={index} className="relative flex-shrink-0 pt-1 pr-1">
            <img
              src={url}
              alt={`Preview ${index + 1}`}
              className={`w-16 h-16 object-cover rounded-lg border ${
                failed ? 'border-amber-500 ring-1 ring-amber-400/60' : 'border-gray-200 dark:border-gray-600'
              }`}
            />
            {failed && onRetrySlot && (
              <button
                type="button"
                disabled={retrying}
                onClick={() => onRetrySlot(index)}
                className="absolute bottom-0 left-0 w-7 h-7 bg-amber-500 text-white rounded-full flex items-center justify-center hover:bg-amber-600 shadow-sm z-10 disabled:opacity-60"
                title="Retry upload"
              >
                <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute top-0 right-0 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-sm z-10"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
