import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Drawer, DrawerCloseButton, DrawerContent } from '@/components/ui/Drawer';
import { Button } from '@/components/Button';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { useAuthStore } from '@/store/authStore';
import { toastApiError } from '@/utils/toastApiError';
import { pairsApi } from '@/api/pairs';
import { queryKeys } from '@/queries/queryKeys';
import type { Sport } from '@/types';
import { AddUserTeamToGameSheet } from '@/components/userTeam/AddUserTeamToGameSheet';
import { PairAvatars } from './PairAvatars';
import { PairStatTiles } from './PairStatTiles';
import { PairRecentGameCard } from './PairRecentGameCard';
import { ensurePairTeam } from './ensurePairTeam';
import { memberDisplayName, pairDisplayName } from './pairFormat';

export interface PairSheetProps {
  /** `userAId,userBId`; `null` closes the sheet. */
  pairId: string | null;
  sport?: Sport;
  onClose: () => void;
}

/**
 * The ad-hoc pair sheet behind `?pair=a,b`.
 *
 * 70 % of the viewport, both faces in the header, Games · Win rate ·
 * Chemistry, up to five shared games, and the team actions. When the two
 * already have a `UserTeam` the leaderboard routes straight to `/user-team/:id`
 * instead — this sheet is still reachable by URL, so it offers "Open team".
 *
 * No text input lives here, so the keyboard contract does not apply; the sheet
 * still uses `DrawerContent`, which carries `cap-keyboard-aware-sheet`.
 */
export const PairSheet = ({ pairId, sport, onClose }: PairSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewerId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [inviteTeamId, setInviteTeamId] = useState<string | null>(null);

  const open = Boolean(pairId);
  useBackButtonModal(open, onClose, 'pair-sheet');

  const query = useQuery({
    queryKey: queryKeys.pairs.detail(pairId ?? '', sport),
    queryFn: () => pairsApi.getPair(pairId!, sport),
    enabled: open,
    staleTime: 60 * 1000,
  });

  const detail = query.data;
  const partner = useMemo(() => {
    if (!detail) return null;
    if (detail.userA.id === viewerId) return detail.userB;
    if (detail.userB.id === viewerId) return detail.userA;
    return null;
  }, [detail, viewerId]);

  const title = detail
    ? pairDisplayName(memberDisplayName(detail.userA), memberDisplayName(detail.userB))
    : t('pairs.sheet.title');

  const withTeam = useCallback(
    async (after: (teamId: string) => void) => {
      if (!detail || !partner || busy) return;
      setBusy(true);
      try {
        const teamId = await ensurePairTeam(viewerId, partner.id, detail.teamId);
        // The pair now *has* a team. Without this the cached detail still says
        // `teamId === null`, so reopening the sheet re-runs the create path and
        // sends a second invite to the same partner.
        if (pairId) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.pairs.detail(pairId, sport),
          });
        }
        after(teamId);
      } catch (error: unknown) {
        toastApiError(t, error);
      } finally {
        setBusy(false);
      }
    },
    [busy, detail, pairId, partner, queryClient, sport, t, viewerId],
  );

  const handleTeamAction = useCallback(() => {
    void withTeam((teamId) => {
      onClose();
      navigate(`/user-team/${teamId}`);
    });
  }, [navigate, onClose, withTeam]);

  const handleInvite = useCallback(() => {
    void withTeam((teamId) => setInviteTeamId(teamId));
  }, [withTeam]);

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <DrawerContent
          className="flex h-[70dvh] flex-col overflow-hidden bg-white dark:bg-gray-900"
          accessibleTitle={title}
          data-testid="pair-sheet"
        >
          <div
            data-overlay-chrome=""
            className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-4"
          >
            {detail ? (
              <PairAvatars userA={detail.userA} userB={detail.userB} size={44} overlap={18} />
            ) : (
              <span className={`${shimmerBlock} h-11 w-[4.5rem] rounded-full`} aria-hidden />
            )}
            <h2 className="min-w-0 flex-1 truncate text-start text-lg font-semibold text-gray-900 dark:text-white">
              {title}
            </h2>
            <DrawerCloseButton aria-label={t('common.close')} className="shrink-0" />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
            {query.isLoading || !detail ? (
              <div className="space-y-3" aria-busy="true" aria-label={t('pairs.loading')}>
                <div className={`${shimmerBlock} h-20 w-full rounded-2xl`} />
                <div className={`${shimmerBlock} h-14 w-full rounded-xl`} />
                <div className={`${shimmerBlock} h-14 w-full rounded-xl`} />
              </div>
            ) : (
              <>
                <PairStatTiles
                  games={detail.games}
                  winRate={detail.winRate}
                  chemistry={detail.chemistry}
                />

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('pairs.sheet.recent')}
                  </h3>
                  {detail.recentGames.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('pairs.sheet.recentEmpty')}
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.recentGames.map((game) => (
                        <li key={game.id}>
                          <PairRecentGameCard game={game} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>

          {partner ? (
            <div
              className="flex shrink-0 flex-col gap-2 border-t border-gray-200 px-4 pt-3 dark:border-gray-700"
              style={{ paddingBottom: 'calc(var(--overlay-bottom-inset, 0px) + 0.75rem)' }}
            >
              <Button
                variant="primary"
                size="md"
                onClick={handleTeamAction}
                disabled={busy}
                data-testid="pair-sheet-team-action"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                {detail?.teamId ? t('pairs.sheet.openTeam') : t('pairs.sheet.createTeam')}
              </Button>
              <Button variant="ghost" size="md" onClick={handleInvite} disabled={busy}>
                {t('pairs.sheet.inviteToGame')}
              </Button>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>

      {inviteTeamId ? (
        <AddUserTeamToGameSheet
          open
          onOpenChange={(next) => {
            if (!next) setInviteTeamId(null);
          }}
          teamId={inviteTeamId}
          partnerName={partner ? memberDisplayName(partner) : null}
        />
      ) : null}
    </>
  );
};
