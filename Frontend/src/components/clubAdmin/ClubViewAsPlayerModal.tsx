import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { clubsApi } from '@/api/clubs';
import { ClubDetailPanel } from '@/components/ClubDetailPanel';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
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

  useBackButtonModal(open, onClose, 'club-view-as-player');

  const refreshClub = async () => {
    if (!clubId) return;
    try {
      const res = await clubsApi.getById(clubId);
      if (res.success && res.data) setClub(res.data);
    } catch {
      /* keep current */
    }
  };

  useEffect(() => {
    if (!open || !clubId) return;
    clubsApi
      .getById(clubId)
      .then((res) => {
        if (res.success && res.data) setClub(res.data);
        else setClub(null);
      })
      .catch(() => setClub(null));
  }, [open, clubId]);

  useEffect(() => {
    if (!open) {
      setFullscreenUrl(null);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="safe-area-all fixed inset-0 z-[200] flex flex-col bg-gray-50 dark:bg-gray-950">
        <header className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-3 dark:border-gray-800 dark:bg-gray-900">
          <button
            type="button"
            className="flex items-center gap-1 rounded-full px-2 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            onClick={onClose}
          >
            <ChevronLeft className="h-5 w-5" />
            {t('common.close')}
          </button>
          <h2 className="flex-1 truncate text-center text-lg font-semibold text-gray-900 dark:text-white">
            {t('clubAdmin.viewAsPlayer')}
          </h2>
          <span className="w-[4.5rem]" aria-hidden />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">
          {club ? (
            <ClubDetailPanel club={club} onOpenFullscreenPhoto={setFullscreenUrl} onClubRefresh={refreshClub} />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
          )}
        </div>
      </div>
      {fullscreenUrl && (
        <FullscreenImageViewer imageUrl={fullscreenUrl} onClose={() => setFullscreenUrl(null)} />
      )}
    </>,
    document.body
  );
}
