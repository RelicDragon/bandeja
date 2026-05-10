import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/utils/dateFormat';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, MapPin, Clock } from 'lucide-react';
import type { BasicUser, Game, GameTeam } from '@/types';
import { gamesApi } from '@/api';
import { useDesktop } from '@/hooks/useDesktop';
import { useIsLandscape } from '@/hooks/useIsLandscape';
interface LeagueFixtureDetailSheetProps {
  games: Game[];
  onClose: () => void;
}

function shortName(u: BasicUser | undefined): string {
  if (!u) return '';
  return [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
}

function fixedTeamLine(ft: GameTeam | undefined): string {
  if (!ft?.players?.length) return '';
  const parts = ft.players.map((p) => shortName(p.user)).filter(Boolean);
  return parts.length ? parts.join(' / ') : '';
}

function scoreSummaryFromGame(game: Game): string | null {
  const matches = game.rounds?.flatMap((r) => r.matches ?? []) ?? [];
  const m = matches[0];
  if (!m?.sets?.length) return null;
  return m.sets.map((s) => `${s.teamA}-${s.teamB}`).join(', ');
}

export const LeagueFixtureDetailSheet = ({ games, onClose }: LeagueFixtureDetailSheetProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isDesktop = useDesktop();
  const isLandscape = useIsLandscape();
  const panelRef = useRef<HTMLDivElement>(null);
  const [detailById, setDetailById] = useState<Record<string, Game>>(() =>
    Object.fromEntries(games.map((g) => [g.id, g]))
  );

  const loadThin = useCallback(async () => {
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
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const tmr = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('[data-fixture-primary-action]')?.focus();
    }, 50);
    return () => window.clearTimeout(tmr);
  }, []);

  const useDialog = isDesktop || isLandscape;

  const content = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="league-fixture-detail-title"
      className={
        useDialog
          ? 'relative z-[60] mx-auto my-8 w-full max-w-lg max-h-[85vh] overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900'
          : 'relative z-[60] flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl border border-gray-200/80 bg-white shadow-[0_-8px_40px_rgba(0,0,0,0.12)] dark:border-gray-700 dark:bg-gray-900'
      }
    >
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-800">
        <h2 id="league-fixture-detail-title" className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('gameDetails.fixtureDetailTitle')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label={t('common.close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-4">
        {games.map((g, idx) => {
          const d = detailById[g.id] ?? g;
          const clubName = d.club?.name ?? d.court?.club?.name;
          const courtName = d.court?.name;
          const when =
            d.startTime && d.timeIsSet
              ? formatDate(d.startTime, 'PPp')
              : t('gameDetails.datetimeNotSet');
          const teamsSorted = [...(d.fixedTeams ?? [])].sort((a, b) => a.teamNumber - b.teamNumber);
          const t1 = fixedTeamLine(teamsSorted[0]);
          const t2 = fixedTeamLine(teamsSorted[1]);
          const scoreLine = scoreSummaryFromGame(d);
          return (
            <div
              key={g.id}
              className="rounded-xl border border-gray-100 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-800/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium text-gray-900 dark:text-white">{d.name || t('gameDetails.fixtureMatchFallback')}</p>
                {d.resultsStatus === 'FINAL' && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    {t('games.status.finished')}
                  </span>
                )}
              </div>
              {(t1 || t2) && (
                <div className="mt-2 space-y-1 text-sm text-gray-800 dark:text-gray-100">
                  {t1 && (
                    <p>
                      <span className="font-medium text-gray-500 dark:text-gray-400">{t('gameDetails.team1')}</span>{' '}
                      {t1}
                    </p>
                  )}
                  {t2 && (
                    <p>
                      <span className="font-medium text-gray-500 dark:text-gray-400">{t('gameDetails.team2')}</span>{' '}
                      {t2}
                    </p>
                  )}
                </div>
              )}
              <div className="mt-2 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
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
                {scoreLine && <p className="pt-0.5 font-medium text-gray-800 dark:text-gray-200">{t('gameDetails.fixtureDetailScoreSummary', { scores: scoreLine })}</p>}
              </div>
              <button
                type="button"
                data-fixture-primary-action={idx === 0 ? true : undefined}
                onClick={() => {
                  navigate(`/games/${d.id}`);
                  onClose();
                }}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-700 active:scale-[0.99]"
              >
                <ExternalLink className="h-4 w-4" />
                {t('gameDetails.fixtureOpenMatch')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );

  const overlay = (
    <div
      className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center p-0 sm:p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {content}
    </div>
  );

  return createPortal(overlay, document.body);
};
