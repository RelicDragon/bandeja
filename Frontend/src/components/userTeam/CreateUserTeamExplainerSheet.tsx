import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, Loader2, UsersRound } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
} from '@/components/ui/Drawer';
import { Button } from '@/components/Button';
import { useAuthStore } from '@/store/authStore';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { toastApiError } from '@/utils/toastApiError';
import { createOrReuseUserTeam } from '@/utils/createOrReuseUserTeam';
import { runWithProfileName } from '@/utils/runWithProfileName';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateUserTeamExplainerSheet({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.user?.id);
  const [busy, setBusy] = useState(false);

  useBackButtonModal(open, () => onOpenChange(false), 'create-user-team-explainer');

  const handleCreate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { id } = await createOrReuseUserTeam(userId);
      onOpenChange(false);
      navigate(`/user-team/${id}`);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'network') {
        toast.error(t('errors.networkError'));
      } else {
        toastApiError(t, e);
      }
    } finally {
      setBusy(false);
    }
  };

  const bullets = [
    t('teams.explainerBulletCity'),
    t('teams.explainerBulletAdd'),
    t('teams.explainerBulletFixed'),
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className="z-[70] max-h-[88dvh] overflow-hidden rounded-t-[32px] border-x border-t border-zinc-200/80 bg-zinc-50 text-zinc-950 shadow-[0_-24px_70px_rgba(15,23,42,0.16)] dark:border-white/10 dark:bg-[#0b111b] dark:text-white"
        accessibleTitle={t('teams.createExplainerTitle')}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-zinc-300 dark:bg-white/20" aria-hidden />
        <DrawerCloseButton
          className="absolute right-4 top-3.5 z-20 bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/15"
          aria-label={t('common.close', { defaultValue: 'Close' })}
        />
        <div data-testid="create-user-team-explainer" className="px-5 pb-6 pt-8">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-md shadow-primary-600/20">
            <UsersRound size={22} strokeWidth={2} aria-hidden />
          </div>
          <h2 className="text-center text-lg font-semibold tracking-tight">{t('teams.createExplainerTitle')}</h2>
          <p className="mt-1.5 text-center text-sm leading-snug text-zinc-600 dark:text-zinc-400">
            {t('teams.explainerCreate')}
          </p>
          <ul className="mt-4 space-y-2">
            {bullets.map((line) => (
              <li key={line} className="flex gap-2.5 text-sm leading-snug text-zinc-700 dark:text-zinc-300">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
                  <Check size={12} strokeWidth={2.5} aria-hidden />
                </span>
                {line}
              </li>
            ))}
          </ul>
          <Button
            className="mt-5 w-full rounded-2xl py-3 text-base"
            onClick={() => runWithProfileName(() => void handleCreate())}
            disabled={busy}
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : null}
            {t('teams.createPair')}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
