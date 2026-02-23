import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Round } from '@/types/gameResults';
import { Game } from '@/types';

interface RoundAddedModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: Round | null;
  game: Game | null;
}

function fullName(firstName?: string | null, lastName?: string | null): string {
  return `${firstName ?? ''} ${lastName ?? ''}`.trim() || '—';
}

export function RoundAddedModal({ isOpen, onClose, round, game }: RoundAddedModalProps) {
  const { t } = useTranslation();
  const playerMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!game?.participants) return map;
    for (const p of game.participants) {
      if (p.user) map.set(p.userId, fullName(p.user.firstName, p.user.lastName));
    }
    return map;
  }, [game?.participants]);

  const courtIdToName = useMemo(() => {
    const map = new Map<string, string>();
    if (game?.gameCourts) {
      for (const { court } of game.gameCourts) {
        if (court?.id && court?.name) map.set(court.id, court.name);
      }
    }
    return map;
  }, [game?.gameCourts]);

  const sections = useMemo(() => {
    if (!round?.matches?.length) return [];
    const byCourt = new Map<string | undefined, typeof round.matches>();
    for (const m of round.matches) {
      const c = m.courtId ?? undefined;
      if (!byCourt.has(c)) byCourt.set(c, []);
      byCourt.get(c)!.push(m);
    }
    const result: { courtId: string | undefined; label: string; matches: typeof round.matches }[] = [];
    const sortedCourts = game?.gameCourts ? [...game.gameCourts].sort((a, b) => a.order - b.order) : [];
    const orderedIds = sortedCourts.map((gc) => gc.courtId);
    let courtIndex = 0;
    for (const courtId of orderedIds) {
      const matches = byCourt.get(courtId);
      if (matches?.length) {
        result.push({
          courtId,
          label: courtId ? (courtIdToName.get(courtId) ?? t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: ++courtIndex })) : t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: ++courtIndex }),
          matches,
        });
      }
    }
    const noCourt = byCourt.get(undefined);
    if (noCourt?.length) {
      result.push({
        courtId: undefined,
        label: t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: ++courtIndex }),
        matches: noCourt,
      });
    }
    for (const [courtId, matches] of byCourt) {
      if (courtId !== undefined && !orderedIds.includes(courtId) && matches.length) {
        result.push({
          courtId,
          label: courtIdToName.get(courtId) ?? t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: ++courtIndex }),
          matches,
        });
      }
    }
    if (result.length === 0 && round.matches.length) {
      result.push({ courtId: undefined, label: t('gameResults.courtNumber', { defaultValue: 'Court 1', number: 1 }), matches: round.matches });
    }
    return result;
  }, [round, game?.gameCourts, courtIdToName, t]);

  if (!round) return null;

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="round-added-modal">
      <DialogContent showCloseButton={true} closeOnInteractOutside={true}>
        <DialogHeader>
          <DialogTitle>{t('gameResults.roundAdded', { defaultValue: 'Round added' })}</DialogTitle>
        </DialogHeader>
        <div className="px-6 pb-6 overflow-y-auto max-h-[60vh]">
          {sections.map(({ courtId, label, matches }) => (
            <div key={courtId ?? 'none'} className="mb-4">
              <div className="text-sm font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-1 mb-2">
                ——— {label} ———
              </div>
              {matches.map((match) => {
                const t1 = (match.teamA.map((id) => playerMap.get(id) ?? id).join(' + ')) || '—';
                const t2 = (match.teamB.map((id) => playerMap.get(id) ?? id).join(' + ')) || '—';
                return (
                  <div key={match.id} className="text-sm text-gray-800 dark:text-gray-200 py-1.5">
                    <div className="font-medium">{t1}</div>
                    <div className="text-gray-500 dark:text-gray-400 text-center my-0.5">{t('gameResults.vs', { defaultValue: 'vs' })}</div>
                    <div className="font-medium">{t2}</div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
