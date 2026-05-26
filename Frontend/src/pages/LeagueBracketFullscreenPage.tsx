import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { Card, ConfirmationModal } from '@/components';
import toast from 'react-hot-toast';
import { LeagueBracketView } from '@/components/GameDetails/LeagueBracketView';
import { BracketRoundPicker } from '@/components/GameDetails/BracketRoundPicker';
import { gamesApi } from '@/api';
import { leaguesApi, type LeagueGroup, type LeagueRound } from '@/api/leagues';
import type { BracketPlayoffGroupDto, BracketPlayoffResponse } from '@/api/leagues';
import { enrichBracketGroups } from '@/utils/leagueBracketEnrich';
import { resolveBracketRoundTitleFromSlots } from '@/utils/bracketRoundDisplay.util';
import type { Game } from '@/types';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { useAuthStore } from '@/store/authStore';
import {
  findBracketRounds,
  defaultBracketRoundId,
  resolveSelectedBracketRound,
  canRestartBracketPlayoff,
} from '@/utils/leagueBracketRound';
import { isCrossGroupBracket, resolveBracketGroupFromQuery } from '@/utils/bracketView.util';

export const LeagueBracketFullscreenPage = () => {
  const { id: leagueSeasonId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [gameMeta, setGameMeta] = useState<Game | null>(null);
  const [metaError, setMetaError] = useState(false);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [bracketPayload, setBracketPayload] = useState<BracketPlayoffResponse | null>(null);
  const [bracketError, setBracketError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bracketRounds, setBracketRounds] = useState<LeagueRound[]>([]);
  const [selectedBracketRoundId, setSelectedBracketRoundId] = useState<string | null>(null);
  const [allRounds, setAllRounds] = useState<LeagueRound[]>([]);
  const [bracketRestartConfirmOpen, setBracketRestartConfirmOpen] = useState(false);
  const [bracketRestartPending, setBracketRestartPending] = useState(false);
  const user = useAuthStore((s) => s.user);

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
    navigate(`/games/${leagueSeasonId}?tab=schedule&subtab=bracket`, { replace: false });
  }, [navigate, leagueSeasonId, location.state]);

  useBackButtonHandler(
    useCallback(() => {
      goBack();
      return true;
    }, [goBack])
  );

  useEffect(() => {
    const roundFromUrl =
      searchParams.get('roundId')?.trim() || searchParams.get('round')?.trim();
    if (roundFromUrl) setSelectedBracketRoundId(roundFromUrl);
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    if (!leagueSeasonId) return;
    setLoading(true);
    setBracketError(false);
    setBracketPayload(null);
    try {
      const roundsRes = await leaguesApi.getRounds(leagueSeasonId);
      setAllRounds(roundsRes.data);
      const playoffs = findBracketRounds(roundsRes.data);
      setBracketRounds(playoffs);
      const round = resolveSelectedBracketRound(playoffs, selectedBracketRoundId);
      const [groupsRes] = await Promise.all([leaguesApi.getGroups(leagueSeasonId)]);
      setGroups(groupsRes.data.groups);
      if (!round) {
        setBracketPayload(null);
        setBracketError(playoffs.length === 0);
        return;
      }
      const bracketRes = await leaguesApi.getBracketPlayoff(leagueSeasonId, { roundId: round.id });
      const games = round.games ?? bracketRes.data.round.games ?? [];
      setBracketPayload({
        ...bracketRes.data,
        groups: enrichBracketGroups(bracketRes.data.groups, games),
      });
      setBracketError(false);
    } catch (e) {
      console.error(e);
      setBracketPayload(null);
      setBracketError(true);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId, selectedBracketRoundId]);

  useEffect(() => {
    if (bracketRounds.length === 0) return;
    setSelectedBracketRoundId((prev) => {
      const fromUrl =
        searchParams.get('roundId')?.trim() || searchParams.get('round')?.trim();
      if (fromUrl && bracketRounds.some((r) => r.id === fromUrl)) return fromUrl;
      if (prev && bracketRounds.some((r) => r.id === prev)) return prev;
      return defaultBracketRoundId(bracketRounds);
    });
  }, [bracketRounds, searchParams]);

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

  const groupFromQuery = searchParams.get('group');
  const crossGroupBracket = isCrossGroupBracket(bracketPayload);
  const activeGroup: BracketPlayoffGroupDto | null = useMemo(
    () => resolveBracketGroupFromQuery(bracketPayload, groupFromQuery),
    [bracketPayload, groupFromQuery]
  );

  const selectedBracketRoundSlotTitle = useMemo(
    () =>
      activeGroup?.slots?.length ? resolveBracketRoundTitleFromSlots(activeGroup.slots) : null,
    [activeGroup?.slots]
  );

  const entityOk =
    gameMeta &&
    (gameMeta.entityType === 'LEAGUE' || gameMeta.entityType === 'LEAGUE_SEASON') &&
    gameMeta.hasFixedTeams;

  const canEdit = useMemo(() => {
    if (!gameMeta || !user) return false;
    if (user.isAdmin) return true;
    const me = gameMeta.participants?.find((p) => p.userId === user.id);
    return me?.role === 'OWNER' || me?.role === 'ADMIN';
  }, [gameMeta, user]);

  const handleOpenGame = useCallback(
    (game: Game) => {
      navigate(`/games/${game.id}`);
    },
    [navigate]
  );

  const selectedBracketRound = useMemo(
    () => resolveSelectedBracketRound(bracketRounds, selectedBracketRoundId),
    [bracketRounds, selectedBracketRoundId]
  );

  const canRestartBracket = useMemo(
    () =>
      Boolean(
        selectedBracketRound &&
          canEdit &&
          canRestartBracketPlayoff(selectedBracketRound, allRounds)
      ),
    [selectedBracketRound, canEdit, allRounds]
  );

  const handleRestartBracketPlayoff = useCallback(async () => {
    if (!selectedBracketRound) return;
    setBracketRestartPending(true);
    try {
      await leaguesApi.deleteRound(selectedBracketRound.id);
      toast.success(
        t('gameDetails.playoffRestarted', { defaultValue: 'Playoff bracket removed' })
      );
      goBack();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const errorMessage = err.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setBracketRestartPending(false);
      setBracketRestartConfirmOpen(false);
    }
  }, [selectedBracketRound, goBack, t]);

  if (!leagueSeasonId) return null;

  const activeRoundId = selectedBracketRoundId ?? bracketPayload?.round.id ?? '';

  return (
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
          <h1 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.bracketFullscreenTitle')}
          </h1>
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
            <p className="text-gray-600 dark:text-gray-400">{t('gameDetails.bracketRequiresFixedTeams')}</p>
          </Card>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            {bracketRounds.length > 1 && activeRoundId && (
              <BracketRoundPicker
                rounds={bracketRounds}
                selectedRoundId={activeRoundId}
                onSelect={setSelectedBracketRoundId}
                layoutIdPrefix={`${leagueSeasonId}-fullscreen`}
                selectedRoundSlotTitle={selectedBracketRoundSlotTitle}
              />
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <LeagueBracketView
                group={activeGroup}
                groups={groups}
                crossGroupBracket={crossGroupBracket}
                loading={false}
                error={bracketError}
                onRetry={fetchData}
                onOpenGame={handleOpenGame}
                compact
                canEditBracket={canEdit}
                leagueSeasonId={leagueSeasonId}
                bracketRoundId={activeRoundId || undefined}
                onBracketUpdated={(res) => {
                  const games = res.round.games ?? [];
                  setBracketPayload({
                    ...res,
                    groups: enrichBracketGroups(res.groups, games),
                  });
                }}
                canRestartPlayoff={canRestartBracket}
                restartingPlayoff={bracketRestartPending}
                onRestartPlayoff={() => setBracketRestartConfirmOpen(true)}
              />
            </div>
          </div>
        )}
      </div>
      <ConfirmationModal
        isOpen={bracketRestartConfirmOpen}
        title={t('gameDetails.restartPlayoff', { defaultValue: 'Restart Playoff' })}
        message={t('gameDetails.restartPlayoffConfirmation', {
          defaultValue:
            'This will delete the entire bracket and all scheduled matchup games. You can create a new playoff from scratch.',
        })}
        confirmText={t('gameDetails.restartPlayoff', { defaultValue: 'Restart Playoff' })}
        cancelText={t('common.cancel')}
        confirmVariant="danger"
        onConfirm={handleRestartBracketPlayoff}
        onCancel={() => setBracketRestartConfirmOpen(false)}
      />
    </div>
  );
};
