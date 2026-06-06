import { ChevronRight, LucideIcon } from 'lucide-react';

interface ClubAdminActionCardProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  variant?: 'primary' | 'default';
  onClick: () => void;
}

export function ClubAdminActionCard({
  icon: Icon,
  label,
  description,
  variant = 'default',
  onClick,
}: ClubAdminActionCardProps) {
  const isPrimary = variant === 'primary';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${
        isPrimary
          ? 'border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent shadow-sm hover:border-primary/30 hover:shadow-md dark:from-primary/20 dark:via-primary/10'
          : 'border-border bg-white hover:border-primary/20 hover:bg-muted/50 dark:bg-gray-900'
      }`}
    >
      <div
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          isPrimary
            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
            : 'bg-muted text-foreground group-hover:bg-primary/10 group-hover:text-primary'
        }`}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`font-semibold ${isPrimary ? 'text-foreground' : 'text-foreground'}`}>{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <ChevronRight
        className={`h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 ${
          isPrimary ? 'text-primary' : 'text-muted-foreground'
        }`}
      />
    </button>
  );
}
