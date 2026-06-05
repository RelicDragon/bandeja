import { Pencil } from 'lucide-react';
import { motion } from 'framer-motion';

type Props = {
  label: string;
  onClick?: () => void;
  readOnly?: boolean;
};

export function CreateTemplateCustomizeButton({ label, onClick, readOnly }: Props) {
  return (
    <motion.div
      layout
      layoutId="create-game-format-customize"
      transition={{ duration: 0.22, ease: 'easeInOut' }}
      className="pt-0.5"
    >
      <button
        type="button"
        onClick={readOnly ? undefined : onClick}
        disabled={readOnly}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-primary-600 transition-colors hover:bg-gray-100 disabled:cursor-default disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800/70 dark:text-primary-400 dark:hover:bg-gray-800"
      >
        <Pencil size={16} strokeWidth={2} aria-hidden />
        {label}
      </button>
    </motion.div>
  );
}
