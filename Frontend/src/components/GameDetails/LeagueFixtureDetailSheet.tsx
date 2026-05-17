import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/utils/dateFormat';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, MapPin, Clock } from 'lucide-react';
import type { BasicUser, Game, GameTeam } from '@/types';
import type { MatrixTeam } from '@/utils/leagueFixtureMatrix';
import { formatFixtureMatrixPlayerName } from '@/utils/leagueFixtureMatrix';
import { gamesApi } from '@/api';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
import { useBackButtonModal } from '@/hooks/useBackButtonModal';
import { PlayerAvatar } from '@/components';

interface LeagueFixtureDetailSheetProps {
  games: Game[];
  rowTeam: MatrixTeam;
  colTeam: MatrixTeam;
  onClose: () => void;
  /** Render in place (for fullscreen table page) instead of portaling to document.body */
  inline?: boolean;
}

function roundHeading(game: Game, t: (key: string) => string): string {
  if (game.leagueRound != null && typeof game.leagueRound.orderIndex === 'number') {
    return `${t('gameDetails.round')} ${game.leagueRound.orderIndex + 1}`;
  }
  return t('gameDetails.fixtureMatchFallback');
}

function TeamPlayersStack({ team }: { team: GameTeam | undefined }) {
  if (!team?.players?.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {team.players.map((p) => (
        <div key={p.userId} className="flex min-w-0 items-center gap-2">
          <PlayerAvatar
            player={(p.user ?? { id: p.userId }) as BasicUser}
            showName={false}
            inlineFace
            extrasmall
          />
          <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-50">
            {p.user ? formatFixtureMatrixPlayerName(p.user) : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function MatrixTeamStack({ team }: { team: MatrixTeam }) {
  return (
    <div className="flex flex-col gap-1.5">
      {team.players.map((p) => (
        <div key={p.userId} className="flex min-w-0 items-center gap-2">
          <PlayerAvatar
            player={(p.user ?? { id: p.userId }) as BasicUser}
            showName={false}
            inlineFace
            extrasmall
          />
          <span className="min-w-0 truncate text-sm font-medium text-gray-900 dark:text-gray-50">
            {formatFixtureMatrixPlayerName(p.user)}
          </span>
        </div>
      ))}
    </div>
  );
}

function VsDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-1" role="separator" aria-label={label}>
      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-gray-400 dark:text-gray-500">
        {label}
      </span>
      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

function FixedTeamsVsLayout({ teams, vsLabel }: { teams: GameTeam[]; vsLabel: string }) {
  const sorted = [...teams].sort((a, b) => a.teamNumber - b.teamNumber);
  return (
    <div className="mt-1 flex flex-col gap-1">
      <TeamPlayersStack team={sorted[0]} />
      <VsDivider label={vsLabel} />
      <TeamPlayersStack team={sorted[1]} />
    </div>
  );
}

function MatrixTeamsVsLayout({ row, col, vsLabel }: { row: MatrixTeam; col: MatrixTeam; vsLabel: string }) {
  return (
    <div className="mt-2 flex flex-col gap-1">
      <MatrixTeamStack team={row} />
      <VsDivider label={vsLabel} />
      <MatrixTeamStack team={col} />
    </div>
  );
}

type LooseSet = {
  teamA?: number;
  teamB?: number;
  teamAScore?: number;
  teamBScore?: number;
};

function setDisplayScores(s: LooseSet): { a: number; b: number } | null {
  const a = s.teamAScore ?? s.teamA;
  const b = s.teamBScore ?? s.teamB;
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { a, b };
}

function scoreSummaryFromGame(game: Game): string | null {
  const matches = game.rounds?.flatMap((r) => r.matches ?? []) ?? [];
  const parts: string[] = [];
  for (const m of matches) {
    for (const s of m.sets ?? []) {
      const pair = setDisplayScores(s as LooseSet);
      if (!pair) continue;
      if (pair.a === 0 && pair.b === 0) continue;
      parts.push(`${pair.a}:${pair.b}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const sheetPanelVariants = {
  hidden: { y: '100%', opacity: 0.85 },
  visible: { y: 0, opacity: 1 },
};

const dialogPanelVariants = {
  hidden: { y: 20, opacity: 0, scale: 0.96 },
  visible: { y: 0, opacity: 1, scale: 1 },
};

const backdropTransition = { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const };
const panelTransition = { type: 'spring' as const, damping: 30, stiffness: 380, mass: 0.85 };

export const LeagueFixtureDetailSheet = ({
  games,
  rowTeam,
  colTeam,
  onClose,
  inline = false,
}: LeagueFixtureDetailSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const panelRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [detailById, setDetailById] = useState<Record<string, Game>>(() =>
    Object.fromEntries(games.map((g) => [g.id, g]))
  );

  const requestClose = useCallback(() => setVisible(false), []);

  useBackButtonModal(visible, requestClose, 'league-fixture-detail-sheet');

  const loadThin = useCallback(async () => {
    if (games.length === 0) return;
    await Promise.all(
      games.map(async (g) => {
        try {
          const { data } = await gamesApi.getById(g.id);
          setDetailById((prev) => ({ ...prev, [g.id]: data }));
        } catch {
          /* keep list payload */
        }
      })
    );
  }, [games]);

  useEffect(() => {
    void loadThin();
  }, [loadThin]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [requestClose]);

  useEffect(() => {
    const tmr = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('[data-fixture-primary-action]')?.focus();
    }, 50);
    return () => window.clearTimeout(tmr);
  }, []);

  const useDialog = isDesktop || isLandscape;

  const panelClassName = useDialog
    ? 'relative z-[1] mx-auto my-8 w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900'
    : 'relative z-[1] flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-gray-200/80 bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.12)] dark:border-gray-700 dark:bg-gray-900';

  const panelBody = (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <h2 id="league-fixture-detail-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('gameDetails.fixtureDetailTitle')}
        </h2>
        <button
          type="button"
          data-fixture-primary-action={games.length === 0 ? true : undefined}
          onClick={requestClose}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={t('common.close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
        {games.length === 0 ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-800/50">
            <MatrixTeamsVsLayout row={rowTeam} col={colTeam} vsLabel={t('gameDetails.fixtureVsShort')} />
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.fixtureDetailNoGameYet')}</p>
          </div>
        ) : (
          games.map((g, idx) => {
            const d = detailById[g.id] ?? g;
            const clubName = d.club?.name ?? d.court?.club?.name;
            const courtName = d.court?.name;
            const hasScheduledTime = Boolean(d.startTime && d.timeIsSet);
            const when = hasScheduledTime
              ? formatDate(d.startTime, 'PPp')
              : d.resultsStatus === 'FINAL'
                ? t('gameDetails.fixtureDetailNoDatetimeFinal')
                : t('gameDetails.datetimeNotSet');
            const teamsSorted = [...(d.fixedTeams ?? [])].sort((a, b) => a.teamNumber - b.teamNumber);
            const scoreLine = scoreSummaryFromGame(d);
            const vsLabel = t('gameDetails.fixtureVsShort');
            return (
              <div
                key={g.id}
                className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-800/50"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-gray-900 dark:text-white">{roundHeading(d, t)}</p>
                  {d.resultsStatus === 'FINAL' ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                      {t('games.status.finished')}
                    </span>
                  ) : d.resultsStatus === 'IN_PROGRESS' ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                      {t('games.results.status.inProgress')}
                    </span>
                  ) : null}
                </div>
                {teamsSorted.length > 0 && <FixedTeamsVsLayout teams={teamsSorted} vsLabel={vsLabel} />}
                <div className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {clubName && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0 opacity-70" />
                      <span>{clubName}</span>
                      {courtName && <span className="text-gray-400">· {courtName}</span>}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 opacity-70" />
                    <span>{when}</span>
                  </div>
                  {scoreLine && (
                    <p className="pt-0.5 font-medium text-gray-800 dark:text-gray-200">
                      {t('gameDetails.fixtureDetailScoreSummary', { scores: scoreLine })}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  data-fixture-primary-action={idx === 0 ? true : undefined}
                  onClick={() => {
                    navigate(`/games/${d.id}`);
                    requestClose();
                  }}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 active:scale-[0.99]"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('gameDetails.fixtureOpenMatch')}
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );

  const overlay = (
    <AnimatePresence onExitComplete={() => onClose()}>
      {visible && (
        <motion.div
          key="league-fixture-detail-overlay"
          className={`${inline ? 'absolute' : 'fixed'} inset-0 z-[200] flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4`}
          role="presentation"
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={backdropVariants}
          transition={backdropTransition}
          onClick={(e) => {
            if (e.target === e.currentTarget) requestClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="league-fixture-detail-title"
            className={panelClassName}
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={useDialog ? dialogPanelVariants : sheetPanelVariants}
            transition={panelTransition}
            onClick={(e) => e.stopPropagation()}
          >
            {panelBody}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (inline) return overlay;
  return createPortal(overlay, document.body);
};
