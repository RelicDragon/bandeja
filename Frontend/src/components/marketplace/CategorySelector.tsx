import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { AnimatedChildrenStagger } from '@/components/motion/AnimatedChildrenStagger';

const BTN_BASE =
  'relative inline-flex items-center justify-center px-3 py-1.5 text-sm rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/20';

interface CategorySelectorProps {
  value: string;
  onChange: (id: string) => void;
  categories: ReadonlyArray<{ id: string; name: string }>;
  allLabel?: string;
}

function CategoryButton({
  id,
  name,
  isSelected,
  onChange,
}: {
  id: string;
  name: string;
  isSelected: boolean;
  onChange: (id: string) => void;
}) {
  const reduceMotion = usePrefersReducedMotion();

  if (reduceMotion) {
    return (
      <button
        type="button"
        onClick={() => onChange(id)}
        className={
          BTN_BASE +
          (isSelected
            ? ' border-primary-500 bg-primary-500 text-white dark:border-primary-500 dark:bg-primary-500 dark:text-white'
            : ' border-slate-200 bg-slate-50 text-slate-800 hover:border-primary-500/50 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white')
        }
      >
        {name}
      </button>
    );
  }

  return (
    <motion.button
      type="button"
      onClick={() => onChange(id)}
      className={
        BTN_BASE +
        (isSelected
          ? ' border-primary-500 text-white dark:border-primary-500 dark:text-white'
          : ' border-slate-200 bg-slate-50 text-slate-800 hover:border-primary-500/50 dark:border-slate-600 dark:bg-slate-700/50 dark:text-white')
      }
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      layout
    >
      {isSelected && (
        <motion.span
          className="absolute inset-0 rounded-lg bg-primary-500 dark:bg-primary-500"
          layoutId="marketplace-category-pill"
          initial={false}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          aria-hidden
        />
      )}
      <span className={`relative z-[1] ${isSelected ? 'text-white' : ''}`}>{name}</span>
    </motion.button>
  );
}

export function CategorySelector({ value, onChange, categories, allLabel }: CategorySelectorProps) {
  const reduceMotion = usePrefersReducedMotion();
  const items = allLabel
    ? [...categories, { id: '', name: allLabel }]
    : categories;
  const contentKey = items.map((c) => c.id).join(',');

  const row = items.map((c) => (
    <CategoryButton
      key={c.id || 'all'}
      id={c.id}
      name={c.name}
      isSelected={value === c.id}
      onChange={onChange}
    />
  ));

  if (reduceMotion) {
    return <div className="flex flex-row flex-wrap gap-2">{row}</div>;
  }

  return (
    <AnimatedChildrenStagger contentKey={contentKey} className="flex flex-row flex-wrap gap-2">
      {row}
    </AnimatedChildrenStagger>
  );
}
