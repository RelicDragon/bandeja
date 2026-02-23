import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Swords } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { PlayerAvatar } from '@/components';
import { Round } from '@/types/gameResults';
import { Game, BasicUser } from '@/types';

interface RoundAddedModalProps {
  isOpen: boolean;
  onClose: () => void;
  round: Round | null;
  game: Game | null;
  roundNumber?: number;
}

export function RoundAddedModal({ isOpen, onClose, round, game, roundNumber }: RoundAddedModalProps) {
  const { t } = useTranslation();

  const playerMap = useMemo(() => {
    const map = new Map<string, BasicUser>();
    if (!game?.participants) return map;
    for (const p of game.participants) {
      if (p.user) map.set(p.userId, p.user);
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
          label: courtId
            ? (courtIdToName.get(courtId) ?? t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: ++courtIndex }))
            : t('gameResults.courtNumber', { defaultValue: 'Court {{number}}', number: ++courtIndex }),
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
          <DialogTitle>
            {roundNumber != null
              ? t('gameResults.roundNumber', { defaultValue: 'Round {{number}}', number: roundNumber })
              : t('gameResults.roundAdded', { defaultValue: 'Round added' })}
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-5 pt-4 overflow-y-auto max-h-[60vh] space-y-4">
          {sections.map(({ courtId, label, matches }) => (
            <CourtSection key={courtId ?? 'none'} label={label}>
              {matches.map((match) => (
                <MatchRow
                  key={match.id}
                  teamA={match.teamA}
                  teamB={match.teamB}
                  playerMap={playerMap}
                />
              ))}
            </CourtSection>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CourtSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
          {label}
        </span>
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function MatchRow({
  teamA,
  teamB,
  playerMap,
}: {
  teamA: string[];
  teamB: string[];
  playerMap: Map<string, BasicUser>;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-3">
      <div className="flex items-center gap-2">
        <TeamAvatars playerIds={teamA} playerMap={playerMap} />
        <div className="shrink-0 flex flex-col items-center justify-center">
          <Swords className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <span className="text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 leading-none mt-0.5">
            {t('gameResults.vs', { defaultValue: 'vs' })}
          </span>
        </div>
        <TeamAvatars playerIds={teamB} playerMap={playerMap} justify="end" />
      </div>
    </div>
  );
}

function TeamAvatars({
  playerIds,
  playerMap,
  justify = 'start',
}: {
  playerIds: string[];
  playerMap: Map<string, BasicUser>;
  justify?: 'start' | 'end';
}) {
  return (
    <div className={`flex-1 flex ${justify === 'end' ? 'justify-end' : 'justify-start'} gap-1`}>
      {playerIds.map((id) => {
        const player = playerMap.get(id);
        return (
          <PlayerAvatar
            key={id}
            player={player ?? null}
            extrasmall
            showName
            asDiv
          />
        );
      })}
    </div>
  );
}
