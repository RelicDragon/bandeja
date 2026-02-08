const BTN_BASE =
  'inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20';

interface CategorySelectorProps {
  value: string;
  onChange: (id: string) => void;
  categories: Array<{ id: string; name: string }>;
  allLabel?: string;
}

export function CategorySelector({ value, onChange, categories, allLabel }: CategorySelectorProps) {
  const items = allLabel
    ? [{ id: '', name: allLabel }, ...categories]
    : categories;

  return (
    <div className="flex flex-row flex-wrap gap-2">
      {items.map((c) => {
        const isSelected = value === c.id;
        return (
          <button
            key={c.id || 'all'}
            type="button"
            onClick={() => onChange(c.id)}
            className={
              BTN_BASE +
              (isSelected
                ? ' bg-primary-500 text-white border-primary-500 dark:bg-primary-500 dark:text-white'
                : ' border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-slate-800 dark:text-white hover:border-primary-500/50')
            }
          >
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
