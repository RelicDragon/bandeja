import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Card } from '@/components';
import { LeagueFixtureMatrix } from '@/components/GameDetails/LeagueFixtureMatrix';
import { LeagueFixtureDetailSheet } from '@/components/GameDetails/LeagueFixtureDetailSheet';
import { gamesApi } from '@/api';
import { leaguesApi, type LeagueGroup, type LeagueRound, type LeagueStanding } from '@/api/leagues';
import { standingsTeamsForGroup, type MatrixTeam } from '@/utils/leagueFixtureMatrix';
import type { Game } from '@/types';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';

export const LeagueFixtureTableFullscreenPage = () => {
  const { id: leagueSeasonId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [gameMeta, setGameMeta] = useState<Game | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [rounds, setRounds] = useState<LeagueRound[]>([]);
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [fixtureSheet, setFixtureSheet] = useState<{
    games: Game[];
    row: MatrixTeam;
    col: MatrixTeam;
  } | null>(null);

  const goBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    const ret = (location.state as { scheduleReturnTo?: string } | null)?.scheduleReturnTo;
    if (ret) {
      navigate(ret, { replace: true });
      return;
    }
    navigate(`/games/${leagueSeasonId}?tab=schedule&subtab=table`, { replace: false });
  }, [navigate, leagueSeasonId, location.state]);

  useBackButtonHandler(
    useCallback(() => {
      if (fixtureSheet) {
        setFixtureSheet(null);
        return true;
      }
      goBack();
      return true;
    }, [fixtureSheet, goBack])
  );

  const fetchData = useCallback(async () => {
    if (!leagueSeasonId) return;
    setLoading(true);
    try {
      const [roundsRes, standingsRes, groupsRes] = await Promise.all([
        leaguesApi.getRounds(leagueSeasonId),
        leaguesApi.getStandings(leagueSeasonId),
        leaguesApi.getGroups(leagueSeasonId),
      ]);
      setRounds(roundsRes.data);
      setStandings(standingsRes.data);
      setGroups(groupsRes.data.groups);
    } catch (e) {
      console.error(e);
      setRounds([]);
      setStandings([]);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId]);

  useEffect(() => {
    if (!leagueSeasonId) return;
    let cancelled = false;
    gamesApi
      .getById(leagueSeasonId)
      .then((res) => {
        if (cancelled) return;
        setGameMeta(res.data);
        setMetaError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setGameMeta(null);
        setMetaError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueSeasonId]);

  useEffect(() => {
    fetchData().catch(() => {});
  }, [fetchData]);

  const fixtureTableReadiness = useMemo(() => {
    const hasFixedTeams = !!gameMeta?.hasFixedTeams;
    if (!hasFixedTeams || groups.length === 0 || standings.length === 0) {
      return { allGroupsValidTeams: false };
    }
    for (const g of groups) {
      const inGroup = standings.filter((s) => s.currentGroupId === g.id);
      if (inGroup.length < 2) return { allGroupsValidTeams: false };
      const allValid = inGroup.every((s) => {
        if (s.participantType !== 'TEAM') return false;
        const ids = (s.leagueTeam?.players ?? [])
          .map((p) => p.userId)
          .filter((uid): uid is string => typeof uid === 'string' && uid.trim().length > 0);
        return ids.length === 2;
      });
      if (!allValid) return { allGroupsValidTeams: false };
    }
    return { allGroupsValidTeams: true };
  }, [gameMeta?.hasFixedTeams, groups, standings]);

  const fixtureTableEligible = fixtureTableReadiness.allGroupsValidTeams;
  const groupFromQuery = searchParams.get('group');
  const matrixGroupId = useMemo(() => {
    if (groups.length === 0) return '';
    if (groupFromQuery && groups.some((g) => g.id === groupFromQuery)) return groupFromQuery;
    return groups[0]?.id ?? '';
  }, [groups, groupFromQuery]);

  const matrixTeams = matrixGroupId ? standingsTeamsForGroup(matrixGroupId, standings) : [];

  const entityOk =
    gameMeta &&
    (gameMeta.entityType === 'LEAGUE' || gameMeta.entityType === 'LEAGUE_SEASON') &&
    gameMeta.hasFixedTeams &&
    fixtureTableEligible;

  if (!leagueSeasonId) return null;

  return (
    <>
    <div className="fixed inset-0 z-[70] flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="shrink-0 pt-[env(safe-area-inset-top)]">
        <div className="relative flex h-12 items-center justify-center px-12">
          <button
            type="button"
            onClick={goBack}
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full text-gray-800 shadow-sm ring-1 ring-gray-200/80 transition hover:bg-gray-100 dark:text-gray-100 dark:ring-gray-700 dark:hover:bg-gray-800"
            aria-label={t('common.back')}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col px-2 pb-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary-600" />
          </div>
        ) : metaError || !gameMeta ? (
          <Card className="mx-auto mt-8 max-w-md p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">{t('errors.notFound')}</p>
          </Card>
        ) : !entityOk ? (
          <Card className="mx-auto mt-8 max-w-md p-6 text-center">
            <p className="text-gray-600 dark:text-gray-400">{t('gameDetails.fixtureMatrixEmpty')}</p>
          </Card>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <LeagueFixtureMatrix
              groupId={matrixGroupId}
              teams={matrixTeams}
              rounds={rounds}
              fillViewportHeight
              onFixtureCell={({ games, row, col }) => setFixtureSheet({ games, row, col })}
            />
          </div>
        )}
      </div>
    </div>

    {fixtureSheet && (
      <div className="fixed inset-0 z-[90] pointer-events-auto">
        <LeagueFixtureDetailSheet
          games={fixtureSheet.games}
          rowTeam={fixtureSheet.row}
          colTeam={fixtureSheet.col}
          onClose={() => setFixtureSheet(null)}
          inline
        />
      </div>
    )}
    </>
  );
};
