import { useTranslation } from 'react-i18next';

type Props = {
  canFinish: boolean;
  onFinish: () => void;
  disabled?: boolean;
};

export function LiveAutomaticFinishSetControl({ canFinish, onFinish, disabled = false }: Props) {
  const { t } = useTranslation();
  if (!canFinish) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        className="rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-2 text-xs font-medium text-primary-950 dark:text-primary-50 disabled:opacity-50"
        onClick={onFinish}
      >
        {t('gameDetails.liveScoring.automaticFinishSetCta')}
      </button>
    </div>
  );
}
