import { Plus, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/Button';

interface CreateGameFooterBarProps {
  label: string;
  loading: boolean;
  hint?: string | null;
  onHintClick?: () => void;
  onCreate: () => void;
  dimmed?: boolean;
}

export const CreateGameFooterBar = ({
  label,
  loading,
  hint,
  onHintClick,
  onCreate,
  dimmed = false,
}: CreateGameFooterBarProps) => {
  const { t } = useTranslation();

  return (
    <div
      className={`flex-shrink-0 relative z-10 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md transition-opacity duration-300 ${
        dimmed ? 'opacity-35 pointer-events-none' : ''
      }`}
    >
      <div
        className="mx-auto max-w-2xl space-y-2 px-4 py-3"
        style={{
          paddingLeft: 'max(1rem, env(safe-area-inset-left))',
          paddingRight: 'max(1rem, env(safe-area-inset-right))',
        }}
      >
        {hint ? (
          <button
            type="button"
            onClick={onHintClick}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:bg-amber-900/25 dark:text-amber-300 dark:hover:bg-amber-900/40"
          >
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">{hint}</span>
          </button>
        ) : null}
        <Button
          onClick={onCreate}
          disabled={loading}
          className="w-full py-3 text-base font-semibold flex items-center justify-center gap-2"
          size="lg"
        >
          {loading ? (
            t('common.loading')
          ) : (
            <>
              <Plus size={20} />
              {label}
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
