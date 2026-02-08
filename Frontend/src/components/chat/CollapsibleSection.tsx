import { ChevronDown, LucideIcon } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: LucideIcon;
}

export const CollapsibleSection = ({ title, expanded, onToggle, children, icon: Icon }: CollapsibleSectionProps) => (
  <div className="border-b border-gray-200 dark:border-gray-700 last:border-b-0">
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm font-semibold text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon size={16} className="shrink-0 text-gray-500 dark:text-gray-400" />}
        {title}
      </span>
      <ChevronDown
        size={16}
        className={`shrink-0 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
      />
    </button>
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  </div>
);
