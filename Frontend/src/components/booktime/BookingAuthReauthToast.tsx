import toast from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';

type Props = {
  toastId: string;
  title: string;
  body: string;
  reauthorizeLabel: string;
  dismissLabel: string;
  onReauthorize: () => void;
};

export function BookingAuthReauthToast({
  toastId,
  title,
  body,
  reauthorizeLabel,
  dismissLabel,
  onReauthorize,
}: Props) {
  return (
    <div className="pointer-events-auto flex w-[min(100vw-2rem,22rem)] items-start gap-3 rounded-2xl border border-amber-200/90 bg-white p-3.5 shadow-lg dark:border-amber-900/60 dark:bg-gray-900">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300">
        <AlertTriangle size={16} strokeWidth={2.25} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{title}</p>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{body}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onReauthorize();
              toast.dismiss(toastId);
            }}
            className="inline-flex items-center rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            {reauthorizeLabel}
          </button>
          <button
            type="button"
            onClick={() => toast.dismiss(toastId)}
            className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
