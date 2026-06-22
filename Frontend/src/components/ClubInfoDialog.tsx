import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import type { Club } from '@/types';
import { clubsApi } from '@/api/clubs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { ClubDetailPanel } from '@/components/ClubDetailPanel';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';

interface ClubInfoDialogProps {
  club: Club | null;
  onClose: () => void;
}

export function ClubInfoDialog({ club, onClose }: ClubInfoDialogProps) {
  const { t } = useTranslation();
  const [detailClub, setDetailClub] = useState<Club | null>(club);
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null);

  useEffect(() => {
    setDetailClub(club);
    if (!club) setFullscreenUrl(null);
  }, [club]);

  useEffect(() => {
    if (!club) return;
    let cancelled = false;
    clubsApi.getById(club.id).then((res) => {
      if (!cancelled && res.success && res.data) setDetailClub(res.data);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [club]);

  const refreshDetailClub = async () => {
    if (!detailClub) return;
    try {
      const res = await clubsApi.getById(detailClub.id);
      if (res.success && res.data) setDetailClub(res.data);
    } catch {
      /* noop */
    }
  };

  return (
    <>
      <Dialog open={!!club} onClose={onClose} modalId="club-info-dialog">
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 shrink-0"
                aria-label={t('createGame.clubDetailsBack')}
              >
                <ChevronLeft size={22} />
              </button>
              <DialogTitle className="truncate min-w-0">{detailClub?.name}</DialogTitle>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">
            {detailClub ? (
              <ClubDetailPanel
                club={detailClub}
                onOpenFullscreenPhoto={(url) => setFullscreenUrl(url)}
                onClubRefresh={refreshDetailClub}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      {fullscreenUrl ? (
        <FullscreenImageViewer imageUrl={fullscreenUrl} isOpen onClose={() => setFullscreenUrl(null)} />
      ) : null}
    </>
  );
}
