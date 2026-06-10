import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SubPageHeaderProps {
  title: string;
  onBack: () => void;
  icon?: ReactNode;
}

export function SubPageHeader({ title, onBack, icon }: SubPageHeaderProps) {
  const { t } = useTranslation();

  return (
    <div
      className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 shadow-lg sticky top-0 z-40"
      style={{ paddingTop: 'env(safe-area-inset-top)', height: 'calc(4rem + env(safe-area-inset-top))' }}
    >
      <div
        className="h-16 max-w-2xl mx-auto px-4 flex items-center gap-3"
        style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} className="text-gray-700 dark:text-gray-300" />
        </button>
        <h1 className="page-title flex items-center gap-2 min-w-0 truncate">
          <span className="truncate">{title}</span>
          {icon}
        </h1>
      </div>
    </div>
  );
}
