import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clubsApi } from '@/api/clubs';
import { ClubDetailPanel } from '@/components/ClubDetailPanel';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { Club } from '@/types';

interface ClubViewAsPlayerModalProps {
  clubId: string;
  open: boolean;
  onClose: () => void;
}

export function ClubViewAsPlayerModal({ clubId, open, onClose }: ClubViewAsPlayerModalProps) {
  const { t } = useTranslation();
  const [club, setClub] = useState<Club | null>(null);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !clubId) return;
    clubsApi.getById(clubId).then(setClub).catch(() => setClub(null));
  }, [open, clubId]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[80] flex flex-col bg-background">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button type="button" className="text-sm text-muted-foreground" onClick={onClose}>
            {t('common.close')}
          </button>
          <h2 className="flex-1 text-center text-lg font-semibold">{t('clubAdmin.viewAsPlayer')}</h2>
          <span className="w-12" />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {club ? (
            <ClubDetailPanel club={club} onOpenFullscreenPhoto={setFullscreenUrl} onClubRefresh={setClub} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          )}
        </div>
      </div>
      {fullscreenUrl && <FullscreenImageViewer url={fullscreenUrl} onClose={() => setFullscreenUrl(null)} />}
    </>
  );
}
