import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, MessageCircle } from 'lucide-react';
import { usePlayersStore } from '@/store/playersStore';
import { pressScaleGuard } from '@/components/motion/pressScale';
import type { BasicUser } from '@/types';
import { heroGlass } from './heroGlass';

/**
 * Opens (or creates) the direct USER chat with the teammate — the same
 * `getOrCreateAndAddUserChat` → `/user-chat/:id` path the player card and the
 * event partner board use.
 */
export function UserTeamMessagePartner({ partner }: { partner: BasicUser }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opening, setOpening] = useState(false);
  const name = partner.firstName?.trim() || partner.lastName?.trim() || '';

  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      const chat = await usePlayersStore.getState().getOrCreateAndAddUserChat(partner.id);
      if (!chat) {
        toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
        return;
      }
      navigate(`/user-chat/${chat.id}`, { state: { chat, contextType: 'USER' } });
    } catch (error: unknown) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      data-testid="user-team-message-partner"
      onClick={() => void open()}
      disabled={opening}
      aria-busy={opening || undefined}
      className={`inline-flex min-h-[2.5rem] max-w-full items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold text-zinc-800 outline-none transition-[background-color,scale] duration-200 hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] disabled:opacity-70 dark:text-zinc-100 dark:hover:bg-white/[0.12] ${heroGlass} ${pressScaleGuard}`}
    >
      {opening ? (
        <Loader2 size={16} className="shrink-0 animate-spin text-primary-600 dark:text-primary-300" aria-hidden />
      ) : (
        <MessageCircle size={16} strokeWidth={2.25} className="shrink-0 text-primary-600 dark:text-primary-300" aria-hidden />
      )}
      <span className="truncate">{name ? t('teams.messagePartner', { name }) : t('teams.messagePartnerNoName')}</span>
    </button>
  );
}
