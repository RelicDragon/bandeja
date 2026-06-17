import { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import {
  CHAT_ATTACH_FLYOUT_ITEM,
  CHAT_ROW_EXIT_DURATION_S,
} from '@/components/chat/chatListMotion';

type MessageInputImagePreviewStripProps = {
  imageFiles: File[];
  onRemove: (index: number) => void;
  failedSlotIndices?: ReadonlySet<number>;
  retryingSlotIndex?: number | null;
  onRetrySlot?: (index: number) => void;
};

type ImageStripItem = { file: File; url: string; key: string };

function useImageStripItems(files: File[]): ImageStripItem[] {
  const mapRef = useRef(new Map<File, { url: string; key: string }>());

  const items = useMemo(() => {
    const map = mapRef.current;
    const active = new Set(files);
    const revokeAfterMs = Math.ceil(CHAT_ROW_EXIT_DURATION_S * 1000) + 120;

    for (const [file, entry] of [...map.entries()]) {
      if (!active.has(file)) {
        const { url } = entry;
        window.setTimeout(() => URL.revokeObjectURL(url), revokeAfterMs);
        map.delete(file);
      }
    }

    return files.map((file) => {
      let entry = map.get(file);
      if (!entry) {
        const url = URL.createObjectURL(file);
        entry = { url, key: url };
        map.set(file, entry);
      }
      return { file, url: entry.url, key: entry.key };
    });
  }, [files]);

  useEffect(() => {
    const map = mapRef.current;
    return () => {
      for (const { url } of map.values()) {
        URL.revokeObjectURL(url);
      }
      map.clear();
    };
  }, []);

  return items;
}

export function MessageInputImagePreviewStrip({
  imageFiles,
  onRemove,
  failedSlotIndices,
  retryingSlotIndex = null,
  onRetrySlot,
}: MessageInputImagePreviewStripProps) {
  const reduceMotion = usePrefersReducedMotion();
  const items = useImageStripItems(imageFiles);

  if (items.length === 0) return null;

  const thumbnails = items.map((item, index) => {
    const failed = failedSlotIndices?.has(index) ?? false;
    const retrying = retryingSlotIndex === index;

    const content = (
      <>
        <img
          src={item.url}
          alt={`Preview ${index + 1}`}
          className={`h-16 w-16 rounded-lg border object-cover ${
            failed ? 'border-amber-500 ring-1 ring-amber-400/60' : 'border-gray-200 dark:border-gray-600'
          }`}
        />
        {failed && onRetrySlot && (
          <button
            type="button"
            disabled={retrying}
            onClick={() => onRetrySlot(index)}
            className="absolute bottom-0 left-0 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm hover:bg-amber-600 disabled:opacity-60"
            title="Retry upload"
          >
            <RefreshCw size={14} className={retrying ? 'animate-spin' : ''} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="absolute right-0 top-0 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-colors hover:bg-red-600"
        >
          <X size={16} />
        </button>
      </>
    );

    if (reduceMotion) {
      return (
        <div key={item.key} className="relative flex-shrink-0 pt-1 pr-1">
          {content}
        </div>
      );
    }

    return (
      <motion.div
        key={item.key}
        layout
        variants={CHAT_ATTACH_FLYOUT_ITEM}
        initial="hidden"
        animate="visible"
        exit="hidden"
        className="relative flex-shrink-0 pt-1 pr-1"
      >
        {content}
      </motion.div>
    );
  });

  return (
    <div className="mb-3 flex gap-2 overflow-x-auto overflow-y-visible pb-1">
      {reduceMotion ? thumbnails : <AnimatePresence initial={false}>{thumbnails}</AnimatePresence>}
    </div>
  );
}
