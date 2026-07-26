import { Loader2, Send } from 'lucide-react';

type PhotoStoryPublishBarProps = {
  label: string;
  disabled?: boolean;
  isPublishing?: boolean;
  onPublish: () => void;
};

/** Bottom share CTA — frosted white pill (Instagram “share” energy, not neon gradient). */
export function PhotoStoryPublishBar({
  label,
  disabled,
  isPublishing,
  onPublish,
}: PhotoStoryPublishBarProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-black/80 via-black/35 to-transparent pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-14">
      <button
        type="button"
        disabled={disabled || isPublishing}
        onClick={onPublish}
        className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-white px-7 py-3.5 text-[15px] font-semibold tracking-tight text-neutral-950 shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition active:scale-[0.98] disabled:opacity-50"
      >
        {isPublishing ? (
          <Loader2 className="animate-spin text-neutral-700" size={20} />
        ) : (
          <>
            <Send size={18} strokeWidth={2.4} className="text-sky-600" />
            {label}
          </>
        )}
      </button>
    </div>
  );
}
