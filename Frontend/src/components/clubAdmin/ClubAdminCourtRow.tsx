import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Court } from '@/types';

interface ClubAdminCourtRowProps {
  court: Court;
  onEdit: () => void;
}

export function ClubAdminCourtRow({ court, onEdit }: ClubAdminCourtRowProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-3 dark:bg-gray-900">
      <div className="min-w-0 flex-1">
        <p className="font-medium truncate">{court.name}</p>
        <p className="text-xs text-muted-foreground">
          {court.isActive === false ? t('clubAdmin.inactive') : t('clubAdmin.active')}
          {court.isIndoor ? ` · ${t('clubAdmin.indoor')}` : ''}
          {court.courtType ? ` · ${court.courtType}` : ''}
        </p>
      </div>
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onEdit}
        aria-label={t('clubAdmin.editCourt')}
      >
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}
