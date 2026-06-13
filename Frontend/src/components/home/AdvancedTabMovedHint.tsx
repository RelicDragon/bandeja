import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function AdvancedTabMovedHint() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const moreTab = t('home.more', { defaultValue: 'More' });

  const openAdvancedTab = () => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', 'advanced');
    navigate(`/?${newParams.toString()}`, { replace: true });
  };

  return (
    <div className="mb-2 max-w-md mx-auto px-4">
      <button
        type="button"
        onClick={openAdvancedTab}
        className="flex w-full min-w-0 items-center gap-1 text-left text-xs text-primary-600 hover:underline dark:text-primary-400"
      >
        <span className="min-w-0">
          {t('home.moreTabMovedHint', {
            tab: moreTab,
            defaultValue: 'Teams and leagues — {{tab}} tab',
          })}
        </span>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />
      </button>
    </div>
  );
}
