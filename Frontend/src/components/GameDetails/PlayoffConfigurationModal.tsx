import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components';
import { SegmentedSwitch } from '@/components/SegmentedSwitch';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { BasicUser, GameSetupParams } from '@/types';
import {
  leaguesApi,
  LeagueStanding,
  LeagueGroup,
  type BracketScope,
  type CrossGroupSeedingPreset,
  type CreateBracketPlayoffGroupEntry,
  type CustomPlayInPairingDto,
} from '@/api/leagues';
import { Loader2, Check } from 'lucide-react';
import { getLeagueGroupColor, getLeagueGroupSoftColor } from '@/utils/leagueGroupColors';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';
import { PlayoffGameSetupStep } from './PlayoffGameSetupStep';
import { BracketStructureSummary } from './BracketStructureSummary';
import { BracketPlayoffPreview } from './BracketPlayoffPreview';
import { BracketPlayoffGameSetupStep } from './BracketPlayoffGameSetupStep';
import {
  BRACKET_MAX_ENTRANTS,
  BRACKET_MIN_ENTRANTS,
  buildBracketPlan,
} from '@/utils/bracketStructure';
import { BracketPhase4CreateOptions } from './BracketPhase4CreateOptions';
import { BracketPlayInPairEditor } from './BracketPlayInPairEditor';
import {
  byeCountForEntrants,
  validateCustomByeSeedRanks,
  type CustomByeValidationError,
} from '@/utils/customByeSeedRanks.util';
import {
  validateCustomPlayInSeedPairs,
  type PlayInSeedPair,
} from '@/utils/bracketCustomPlayIn.util';
import { CrossGroupBracketConfigStep } from './CrossGroupBracketConfigStep';
import { computeCrossGroupBracketDerived } from '@/utils/crossGroupBracketConfig.util';
import {
  validateUnequalCrossGroupPool,
  UnequalCrossGroupValidationError,
  type TeamsPerGroupMap,
} from '@/utils/crossGroupUnequalK.util';
import { bracketPlanOptionsFromWizardConfig } from '@/utils/playoffWizardBracketPlan.util';
import { BracketPlayoffConfirmOptions } from './BracketPlayoffConfirmOptions';
import {
  getPlayoffWizardStepIndex,
  getPlayoffWizardStepTotal,
  type PlayoffWizardStep,
} from '@/utils/playoffWizardSteps.util';
import {
  buildBracketSeedLabels,
  getStandingDisplayName,
} from '@/utils/playoffWizardSeedLabels.util';
import { getGroupSetupStatus } from '@/utils/playoffWizardGroupSetup.util';
import {
  getPhase4FlagForGroup,
  setPhase4FlagForGroup,
} from '@/utils/playoffWizardPhase4ByGroup.util';
import {
  customByeErrorI18nKey,
  customPlayInErrorI18nKey,
  getCustomByeValidation,
  getCustomPlayInValidation,
} from '@/utils/playoffWizardValidation.util';

const ALL_GROUP_ID = 'ALL';
const SESSION_MIN_PARTICIPANTS = 4;

function toCustomPlayInPairings(pairs?: PlayInSeedPair[]): CustomPlayInPairingDto[] | undefined {
  if (!pairs?.length) return undefined;
  return pairs.map(([seedA, seedB]) => ({ seedA, seedB }));
}

type SessionPlayoffGameType = 'WINNER_COURT' | 'AMERICANO';
type PlayoffFormatChoice = SessionPlayoffGameType | 'BRACKET';
type Step = PlayoffWizardStep;

interface PlayoffConfigurationModalProps {
  isOpen: boolean;
  onClose: () => void;
  leagueSeasonId: string;
  hasFixedTeams: boolean;
  onCreated: () => void;
}

function compareStandings(a: LeagueStanding, b: LeagueStanding) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
  return 0;
}

export const PlayoffConfigurationModal = ({
  isOpen,
  onClose,
  leagueSeasonId,
  hasFixedTeams,
  onCreated,
}: PlayoffConfigurationModalProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('config');
  const [formatChoice, setFormatChoice] = useState<PlayoffFormatChoice>('WINNER_COURT');
  const [selectedGroupId, setSelectedGroupId] = useState(ALL_GROUP_ID);
  const [selectedIdsByGroup, setSelectedIdsByGroup] = useState<Record<string, Set<string>>>({});
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [groups, setGroups] = useState<LeagueGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bracketGameSetup, setBracketGameSetup] = useState<GameSetupParams | null>(null);
  const [bracketScope, setBracketScope] = useState<BracketScope>('PER_GROUP');
  const [crossTeamsPerGroup, setCrossTeamsPerGroup] = useState<TeamsPerGroupMap>({});
  const [crossIncludedGroupIds, setCrossIncludedGroupIds] = useState<Set<string>>(new Set());
  const [crossSeedingPreset, setCrossSeedingPreset] = useState<CrossGroupSeedingPreset>(
    'WINNERS_THEN_RUNNERS_UP'
  );
  const [crossManualGlobalIds, setCrossManualGlobalIds] = useState<string[] | null>(null);
  const [previewOrderedByGroup, setPreviewOrderedByGroup] = useState<Record<string, string[]>>({});
  const [crossPreviewOrderedIds, setCrossPreviewOrderedIds] = useState<string[] | null>(null);
  const [includeThirdPlaceByGroup, setIncludeThirdPlaceByGroup] = useState<Record<string, boolean>>({});
  const [includeConsolationBracketByGroup, setIncludeConsolationBracketByGroup] = useState<
    Record<string, boolean>
  >({});
  const [includeDoubleEliminationByGroup, setIncludeDoubleEliminationByGroup] = useState<
    Record<string, boolean>
  >({});
  const [crossIncludeThirdPlace, setCrossIncludeThirdPlace] = useState(false);
  const [crossIncludeConsolationBracket, setCrossIncludeConsolationBracket] = useState(false);
  const [crossIncludeDoubleElimination, setCrossIncludeDoubleElimination] = useState(false);
  const [customByeEnabledByGroup, setCustomByeEnabledByGroup] = useState<Record<string, boolean>>({});
  const [customByeRanksByGroup, setCustomByeRanksByGroup] = useState<Record<string, number[]>>({});
  const [crossCustomByeEnabled, setCrossCustomByeEnabled] = useState(false);
  const [crossCustomByeRanks, setCrossCustomByeRanks] = useState<number[]>([]);
  const [customPlayInEnabledByGroup, setCustomPlayInEnabledByGroup] = useState<Record<string, boolean>>({});
  const [playInPairsByGroup, setPlayInPairsByGroup] = useState<Record<string, PlayInSeedPair[]>>({});
  const [crossCustomPlayInEnabled, setCrossCustomPlayInEnabled] = useState(false);
  const [crossPlayInPairs, setCrossPlayInPairs] = useState<PlayInSeedPair[]>([]);
  const [previewReturnStep, setPreviewReturnStep] = useState<'config' | 'summary' | null>(null);

  const isBracket = formatChoice === 'BRACKET';
  const showBracketScopeSwitch = isBracket && groups.length >= 2;
  const isCrossGroupBracket = isBracket && bracketScope === 'CROSS_GROUP';
  const minParticipants = isBracket ? BRACKET_MIN_ENTRANTS : SESSION_MIN_PARTICIPANTS;
  const maxParticipants = isBracket ? BRACKET_MAX_ENTRANTS : undefined;

  const fetchData = useCallback(async () => {
    if (!leagueSeasonId) return;
    setLoading(true);
    try {
      const [standingsRes, groupsRes] = await Promise.all([
        leaguesApi.getStandings(leagueSeasonId),
        leaguesApi.getGroups(leagueSeasonId).catch(() => ({ data: { groups: [], unassignedParticipants: [] } })),
      ]);
      setStandings(standingsRes.data ?? []);
      setGroups(groupsRes.data?.groups ?? []);
    } catch {
      toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId, t]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setStep('config');
      setSelectedIdsByGroup({});
      setBracketGameSetup(null);
      setBracketScope('PER_GROUP');
      setCrossTeamsPerGroup({});
      setCrossIncludedGroupIds(new Set());
      setCrossSeedingPreset('WINNERS_THEN_RUNNERS_UP');
      setCrossManualGlobalIds(null);
      setPreviewOrderedByGroup({});
      setCrossPreviewOrderedIds(null);
      setIncludeThirdPlaceByGroup({});
      setIncludeConsolationBracketByGroup({});
      setIncludeDoubleEliminationByGroup({});
      setCrossIncludeThirdPlace(false);
      setCrossIncludeConsolationBracket(false);
      setCrossIncludeDoubleElimination(false);
      setCustomByeEnabledByGroup({});
      setCustomByeRanksByGroup({});
      setCrossCustomByeEnabled(false);
      setCrossCustomByeRanks([]);
      setCustomPlayInEnabledByGroup({});
      setPlayInPairsByGroup({});
      setCrossCustomPlayInEnabled(false);
      setCrossPlayInPairs([]);
      setPreviewReturnStep(null);
      if (!hasFixedTeams) setFormatChoice('WINNER_COURT');
    }
  }, [isOpen, fetchData, hasFixedTeams]);

  useEffect(() => {
    if (isOpen && groups.length >= 2 && crossIncludedGroupIds.size === 0) {
      setCrossIncludedGroupIds(new Set(groups.map((g) => g.id)));
    }
  }, [isOpen, groups, crossIncludedGroupIds.size]);

  useEffect(() => {
    if (!isOpen || groups.length === 0) return;
    setCrossTeamsPerGroup((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const g of groups) {
        if (next[g.id] == null) {
          next[g.id] = 2;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [isOpen, groups]);

  useEffect(() => {
    if (isOpen && groups.length > 0 && selectedGroupId === ALL_GROUP_ID) {
      setSelectedGroupId(groups[0].id);
    }
  }, [isOpen, groups, selectedGroupId]);

  const getStandingsForGroup = useCallback(
    (groupId: string) =>
      standings
        .filter((s) => (s.currentGroupId ?? s.currentGroup?.id) === groupId)
        .sort(compareStandings),
    [standings]
  );

  const getOrderedParticipantIds = useCallback(
    (groupId: string) => {
      const ids = selectedIdsByGroup[groupId];
      if (!ids?.size) return [];
      return getStandingsForGroup(groupId)
        .filter((s) => ids.has(s.id))
        .map((s) => s.id);
    },
    [getStandingsForGroup, selectedIdsByGroup]
  );

  const groupMeetsMin = useCallback(
    (groupId: string) => {
      const count = selectedIdsByGroup[groupId]?.size ?? 0;
      return count >= minParticipants && (maxParticipants === undefined || count <= maxParticipants);
    },
    [selectedIdsByGroup, minParticipants, maxParticipants]
  );

  const filteredStandings = selectedGroupId === ALL_GROUP_ID
    ? [...standings].sort(compareStandings)
    : getStandingsForGroup(selectedGroupId);

  const currentGroupSelected = selectedIdsByGroup[selectedGroupId];
  const selectedIds = currentGroupSelected ?? new Set<string>();
  const selectedCount = selectedIds.size;
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  const crossDerived = useMemo(
    () =>
      computeCrossGroupBracketDerived(
        groups,
        getStandingsForGroup,
        crossTeamsPerGroup,
        crossIncludedGroupIds,
        crossSeedingPreset,
        crossManualGlobalIds
      ),
    [
      groups,
      getStandingsForGroup,
      crossTeamsPerGroup,
      crossIncludedGroupIds,
      crossSeedingPreset,
      crossManualGlobalIds,
    ]
  );

  const crossCanCreate = useMemo(() => {
    if (!isCrossGroupBracket || crossDerived.includedList.length < 2) return false;
    if (crossDerived.totalN < BRACKET_MIN_ENTRANTS || crossDerived.totalN > BRACKET_MAX_ENTRANTS) {
      return false;
    }
    try {
      validateUnequalCrossGroupPool({
        includedGroupIds: crossDerived.groupOrder,
        qualifiers: crossDerived.qualifiers,
        globalParticipantIds: crossDerived.globalParticipantIds,
        teamsPerGroup: crossTeamsPerGroup,
        groupNames: Object.fromEntries(groups.map((g) => [g.id, g.name])),
      });
      return true;
    } catch {
      return false;
    }
  }, [isCrossGroupBracket, crossDerived, crossTeamsPerGroup, groups]);

  const canCreate = isCrossGroupBracket
    ? crossCanCreate
    : groups.length > 0 && groups.every((g) => groupMeetsMin(g.id));

  const standingsById = useMemo(() => new Map(standings.map((s) => [s.id, s])), [standings]);

  const configSeedLabels = useMemo(
    () => buildBracketSeedLabels(getOrderedParticipantIds(selectedGroupId), standingsById),
    [getOrderedParticipantIds, selectedGroupId, standingsById]
  );

  const crossConfigSeedLabels = useMemo(
    () =>
      buildBracketSeedLabels(
        crossPreviewOrderedIds ?? crossDerived.globalParticipantIds,
        standingsById
      ),
    [crossPreviewOrderedIds, crossDerived.globalParticipantIds, standingsById]
  );

  const wizardStepTotal = getPlayoffWizardStepTotal(isBracket);
  const wizardStepIndex = getPlayoffWizardStepIndex(step, isBracket);

  const handleToggle = (id: string) => {
    setSelectedIdsByGroup((prev) => {
      const next = new Set(prev[selectedGroupId] ?? []);
      if (next.has(id)) next.delete(id);
      else {
        if (maxParticipants !== undefined && next.size >= maxParticipants) {
          toast.error(
            t('gameDetails.bracketMaxParticipants', {
              defaultValue: 'At most {{count}} teams in a bracket.',
              count: maxParticipants,
            })
          );
          return prev;
        }
        next.add(id);
      }
      return { ...prev, [selectedGroupId]: next };
    });
  };

  const handleSelectAll = () => {
    setSelectedIdsByGroup((prev) => {
      const current = prev[selectedGroupId] ?? new Set();
      const cap = maxParticipants ?? filteredStandings.length;
      const allIds = new Set(filteredStandings.slice(0, cap).map((s) => s.id));
      const next =
        current.size === allIds.size && [...current].every((id) => allIds.has(id))
          ? new Set<string>()
          : allIds;
      return { ...prev, [selectedGroupId]: next };
    });
  };

  const minPlayersInGroups =
    groups.length > 0
      ? Math.min(...groups.map((g) => getStandingsForGroup(g.id).length))
      : 0;

  const quickSelectMax = isBracket
    ? Math.min(BRACKET_MAX_ENTRANTS, minPlayersInGroups)
    : minPlayersInGroups;

  const quickSelectOptions =
    quickSelectMax >= minParticipants
      ? Array.from(
          { length: quickSelectMax - minParticipants + 1 },
          (_, i) => minParticipants + i
        )
      : [];

  const isQuickSelectActive = (n: number) =>
    groups.every((g) => {
      const ids = selectedIdsByGroup[g.id];
      const topN = getStandingsForGroup(g.id)
        .slice(0, n)
        .map((s) => s.id);
      return (
        ids &&
        ids.size === n &&
        topN.length === n &&
        topN.every((id) => ids.has(id))
      );
    });

  const handleQuickSelectCount = (n: number) => {
    setSelectedIdsByGroup(() => {
      const next: Record<string, Set<string>> = {};
      for (const g of groups) {
        const sorted = getStandingsForGroup(g.id);
        next[g.id] = new Set(sorted.slice(0, n).map((s) => s.id));
      }
      return next;
    });
  };

  const initPreviewOrders = useCallback(() => {
    if (isCrossGroupBracket) {
      setCrossPreviewOrderedIds([...crossDerived.globalParticipantIds]);
      setPreviewOrderedByGroup({});
    } else {
      const next: Record<string, string[]> = {};
      for (const g of groups) {
        if (groupMeetsMin(g.id)) next[g.id] = getOrderedParticipantIds(g.id);
      }
      setPreviewOrderedByGroup(next);
      setCrossPreviewOrderedIds(null);
    }
  }, [isCrossGroupBracket, crossDerived.globalParticipantIds, groups, groupMeetsMin, getOrderedParticipantIds]);

  const validateBracketAdvancedOptions = useCallback((): boolean => {
    if (!isBracket) return true;

    if (isCrossGroupBracket) {
      const byeCheck = getCustomByeValidation(
        crossDerived.totalN,
        crossCustomByeEnabled,
        crossCustomByeRanks
      );
      if (!byeCheck.valid) {
        toast.error(t(customByeErrorI18nKey(byeCheck.error), { defaultValue: 'Invalid custom bye selection' }));
        return false;
      }
      const playInCheck = getCustomPlayInValidation(
        crossDerived.totalN,
        crossCustomPlayInEnabled,
        crossPlayInPairs,
        crossCustomByeEnabled ? crossCustomByeRanks : undefined
      );
      if (!playInCheck.valid) {
        toast.error(t(customPlayInErrorI18nKey(playInCheck.error), { defaultValue: 'Invalid play-in pairings' }));
        return false;
      }
      return true;
    }

    for (const g of groups) {
      if (!groupMeetsMin(g.id)) continue;
      const count = selectedIdsByGroup[g.id]?.size ?? 0;
      const byeCheck = getCustomByeValidation(
        count,
        customByeEnabledByGroup[g.id] ?? false,
        customByeRanksByGroup[g.id] ?? []
      );
      if (!byeCheck.valid) {
        toast.error(
          t(customByeErrorI18nKey(byeCheck.error), {
            defaultValue: 'Invalid custom bye selection',
          })
        );
        return false;
      }
      const customByeSeedRanks = customByeEnabledByGroup[g.id] ? customByeRanksByGroup[g.id] : undefined;
      const playInCheck = getCustomPlayInValidation(
        count,
        customPlayInEnabledByGroup[g.id] ?? false,
        playInPairsByGroup[g.id] ?? [],
        customByeSeedRanks
      );
      if (!playInCheck.valid) {
        toast.error(
          t(customPlayInErrorI18nKey(playInCheck.error), { defaultValue: 'Invalid play-in pairings' })
        );
        return false;
      }
    }
    return true;
  }, [
    isBracket,
    isCrossGroupBracket,
    crossDerived.totalN,
    crossCustomByeEnabled,
    crossCustomByeRanks,
    crossCustomPlayInEnabled,
    crossPlayInPairs,
    groups,
    groupMeetsMin,
    selectedIdsByGroup,
    customByeEnabledByGroup,
    customByeRanksByGroup,
    customPlayInEnabledByGroup,
    playInPairsByGroup,
    t,
  ]);

  const handlePrimaryNext = () => {
    if (!canCreate) return;
    if (isBracket) {
      if (!validateBracketAdvancedOptions()) return;
      initPreviewOrders();
      setPreviewReturnStep(null);
      setStep('preview');
    } else setStep('summary');
  };

  const participantIdsForGroupCreate = useCallback(
    (groupId: string) => previewOrderedByGroup[groupId] ?? getOrderedParticipantIds(groupId),
    [previewOrderedByGroup, getOrderedParticipantIds]
  );

  const handleBracketGameSetupConfirm = (gameSetup: GameSetupParams) => {
    setBracketGameSetup(gameSetup);
    setStep('summary');
  };

  const handleSessionGameSetupConfirm = async (gameSetup: GameSetupParams) => {
    if (!canCreate || isBracket) return;
    setSubmitting(true);
    try {
      const groupsPayload = groups
        .map((g) => {
          const ids = getOrderedParticipantIds(g.id);
          if (ids.length < SESSION_MIN_PARTICIPANTS) return null;
          return { leagueGroupId: g.id, participantIds: ids };
        })
        .filter((x): x is { leagueGroupId: string; participantIds: string[] } => x !== null);
      const result = await leaguesApi.createPlayoff(leagueSeasonId, {
        ...resultsRoundGenV2Payload,
        gameType: formatChoice,
        groups: groupsPayload,
        gameSetup,
      });
      const createdCount =
        (result.data as { games?: unknown[] })?.games?.length ??
        ((result.data as { game?: unknown })?.game ? 1 : 0);
      if (createdCount > 0) {
        toast.success(t('gameDetails.playoffCreated', { defaultValue: 'Playoff created' }));
        onCreated();
        onClose();
      }
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setSubmitting(false);
    }
  };

  const toastCustomByeError = (error: CustomByeValidationError) => {
    const key =
      error === 'countMismatch'
        ? 'gameDetails.bracketCustomByesErrorCount'
        : error === 'duplicate'
          ? 'gameDetails.bracketCustomByesErrorDuplicate'
          : error === 'outOfRange'
            ? 'gameDetails.bracketCustomByesErrorRange'
            : 'errors.generic';
    toast.error(t(key, { defaultValue: 'Invalid custom bye selection' }));
  };

  const playInPairsPayload = (
    entrantCount: number,
    enabled: boolean,
    pairs: PlayInSeedPair[],
    customByeRanks?: number[]
  ): PlayInSeedPair[] | undefined => {
    if (!enabled || pairs.length === 0) return undefined;
    const check = validateCustomPlayInSeedPairs(entrantCount, pairs, customByeRanks);
    if (!check.valid) {
      toast.error(t('gameDetails.bracketCustomPlayInError', { defaultValue: 'Invalid play-in pairings' }));
      throw new Error('custom-play-in-invalid');
    }
    return pairs;
  };

  const customByePayload = (
    entrantCount: number,
    enabled: boolean,
    ranks: number[]
  ): number[] | undefined => {
    if (!enabled) return undefined;
    const byeCount = byeCountForEntrants(entrantCount);
    const check = validateCustomByeSeedRanks(ranks, entrantCount, byeCount);
    if (!check.valid) {
      toastCustomByeError(check.error);
      throw new Error('custom-bye-invalid');
    }
    return ranks;
  };

  const handleBracketCreateConfirm = async () => {
    if (!canCreate || !bracketGameSetup) return;
    setSubmitting(true);
    try {
      if (isCrossGroupBracket) {
        const { groupOrder, qualifiers, globalParticipantIds } = crossDerived;
        validateUnequalCrossGroupPool({
          includedGroupIds: groupOrder,
          qualifiers,
          globalParticipantIds,
          teamsPerGroup: crossTeamsPerGroup,
          groupNames: Object.fromEntries(groups.map((g) => [g.id, g.name])),
        });
        const crossByes = customByePayload(
          crossDerived.totalN,
          crossCustomByeEnabled,
          crossCustomByeRanks
        );
        const crossPlayIn = playInPairsPayload(
          crossDerived.totalN,
          crossCustomPlayInEnabled,
          crossPlayInPairs,
          crossByes
        );
        const kValues = groupOrder.map((gid) => crossTeamsPerGroup[gid] ?? 0);
        const allEqualK = new Set(kValues).size === 1 && kValues[0] >= 1;
        await leaguesApi.createBracketPlayoff(leagueSeasonId, {
          ...resultsRoundGenV2Payload,
          bracketScope: 'CROSS_GROUP',
          crossGroup: {
            ...(allEqualK
              ? { equalTopK: kValues[0] }
              : {
                  unequalK: true,
                  teamsPerGroup: groupOrder
                    .map((leagueGroupId) => ({
                      leagueGroupId,
                      k: crossTeamsPerGroup[leagueGroupId] ?? 0,
                    }))
                    .filter((e) => e.k >= 1),
                }),
            includedGroupIds: groupOrder,
            seedingPreset: crossSeedingPreset,
            globalParticipantIds: crossPreviewOrderedIds ?? crossDerived.globalParticipantIds,
            qualifiers: groupOrder.map((leagueGroupId) => ({
              leagueGroupId,
              participantIds: qualifiers[leagueGroupId] ?? [],
            })),
            includeThirdPlace: crossIncludeThirdPlace || undefined,
            includeConsolationBracket: crossIncludeConsolationBracket || undefined,
            includeDoubleElimination: crossIncludeDoubleElimination || undefined,
            customByeSeedRanks: crossByes,
            customPlayInPairings: toCustomPlayInPairings(crossPlayIn),
          },
          gameSetup: bracketGameSetup,
        });
      } else {
        const groupsPayload = groups
          .map((g): CreateBracketPlayoffGroupEntry | null => {
            const participantIds = participantIdsForGroupCreate(g.id);
            if (participantIds.length < BRACKET_MIN_ENTRANTS) return null;
            const customByeSeedRanks = customByePayload(
              participantIds.length,
              customByeEnabledByGroup[g.id] ?? false,
              customByeRanksByGroup[g.id] ?? []
            );
            const playInPairs = playInPairsPayload(
              participantIds.length,
              customPlayInEnabledByGroup[g.id] ?? false,
              playInPairsByGroup[g.id] ?? [],
              customByeSeedRanks
            );
            const entry: CreateBracketPlayoffGroupEntry = {
              leagueGroupId: g.id,
              participantIds,
              customByeSeedRanks,
              customPlayInPairings: toCustomPlayInPairings(playInPairs),
            };
            if (getPhase4FlagForGroup(includeThirdPlaceByGroup, g.id)) {
              entry.includeThirdPlace = true;
            }
            if (getPhase4FlagForGroup(includeConsolationBracketByGroup, g.id)) {
              entry.includeConsolationBracket = true;
            }
            if (getPhase4FlagForGroup(includeDoubleEliminationByGroup, g.id)) {
              entry.includeDoubleElimination = true;
            }
            return entry;
          })
          .filter((x): x is CreateBracketPlayoffGroupEntry => x !== null);
        await leaguesApi.createBracketPlayoff(leagueSeasonId, {
          ...resultsRoundGenV2Payload,
          bracketScope: 'PER_GROUP',
          groups: groupsPayload,
          gameSetup: bracketGameSetup,
        });
      }
      toast.success(t('gameDetails.bracketPlayoffCreated', { defaultValue: 'Bracket playoff created' }));
      onCreated();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.message === 'custom-bye-invalid') {
        return;
      }
      if (err instanceof Error && err.message === 'custom-play-in-invalid') {
        return;
      }
      if (err instanceof UnequalCrossGroupValidationError) {
        if (err.code === 'GROUP_TOO_SMALL') {
          toast.error(
            t('gameDetails.bracketErrorGroupTooSmall', {
              defaultValue: '{{group}} has only {{n}} teams (need {{k}})',
              group: err.details?.groupName ?? err.details?.groupId,
              n: err.details?.n,
              k: err.details?.k,
            })
          );
        } else if (err.code === 'TOTAL_OVER_MAX') {
          toast.error(
            t('gameDetails.bracketErrorTotalOver16', {
              defaultValue: 'Too many teams for one bracket (max 16)',
            })
          );
        } else {
          toast.error(t('errors.generic', { defaultValue: 'Something went wrong' }));
        }
        return;
      }
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setSubmitting(false);
    }
  };

  const crossPreviewPlan = useMemo(() => {
    if (!isCrossGroupBracket || crossDerived.totalN < BRACKET_MIN_ENTRANTS) return null;
    const ids = crossPreviewOrderedIds ?? crossDerived.globalParticipantIds;
    const planOptions = bracketPlanOptionsFromWizardConfig({
      customByeEnabled: crossCustomByeEnabled,
      customByeSeedRanks: crossCustomByeRanks,
      customPlayInEnabled: crossCustomPlayInEnabled,
      playInSeedPairs: crossPlayInPairs,
    });
    try {
      return buildBracketPlan(crossDerived.totalN, ids, planOptions);
    } catch {
      return null;
    }
  }, [
    isCrossGroupBracket,
    crossDerived,
    crossPreviewOrderedIds,
    crossCustomByeEnabled,
    crossCustomByeRanks,
    crossCustomPlayInEnabled,
    crossPlayInPairs,
  ]);

  const crossSummaryBreakdown = useMemo(
    () =>
      crossDerived.includedList
        .filter((g) => (crossTeamsPerGroup[g.id] ?? 0) >= 1)
        .map((g) => `${g.name}×${crossTeamsPerGroup[g.id]}`)
        .join(', '),
    [crossDerived.includedList, crossTeamsPerGroup]
  );

  const groupTitle = selectedGroup?.name ?? t('gameDetails.group', { defaultValue: 'Group' });

  const formatLabel = isBracket
    ? t('gameDetails.bracketPlayoffFormat', { defaultValue: 'Knockout bracket' })
    : formatChoice === 'WINNER_COURT'
      ? t('games.gameTypes.WINNER_COURT', { defaultValue: "Winner's Court" })
      : t('games.gameTypes.AMERICANO', { defaultValue: 'Americano' });

  const stepTitle = () => {
    switch (step) {
      case 'config':
        return t('gameDetails.playoffConfiguration', { defaultValue: 'Playoff configuration' });
      case 'preview':
        return t('gameDetails.bracketPreviewTitle', { defaultValue: 'Bracket preview' });
      case 'summary':
        return t('gameDetails.confirmPlayoff', { defaultValue: 'Confirm playoff' });
      case 'gameSetup':
        return t('gameResults.setupGame');
      default:
        return '';
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} modalId="playoff-configuration-modal">
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-col items-center gap-1">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {t('gameDetails.playoffWizardStep', {
              current: wizardStepIndex,
              total: wizardStepTotal,
              defaultValue: 'Step {{current}} of {{total}}',
            })}
          </p>
          <DialogTitle className="text-center">{stepTitle()}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto scrollbar-auto px-4 py-2">
          {step === 'config' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
                  {t('gameDetails.playoffFormat', { defaultValue: 'Format' })}
                </label>
                <SegmentedSwitch
                  tabs={[
                    {
                      id: 'WINNER_COURT',
                      label: t('games.gameTypes.WINNER_COURT', { defaultValue: "Winner's Court" }),
                    },
                    {
                      id: 'AMERICANO',
                      label: t('games.gameTypes.AMERICANO', { defaultValue: 'Americano' }),
                    },
                    {
                      id: 'BRACKET',
                      label: t('gameDetails.bracketPlayoffFormat', { defaultValue: 'Bracket' }),
                      disabled: !hasFixedTeams,
                      title: !hasFixedTeams
                        ? t('gameDetails.bracketRequiresFixedTeams', {
                            defaultValue: 'Bracket playoffs require fixed teams.',
                          })
                        : undefined,
                    },
                  ]}
                  activeId={formatChoice}
                  onChange={(id) => setFormatChoice(id as PlayoffFormatChoice)}
                  showOnlyActiveTabText={false}
                  layoutId="playoff-format"
                />
              </div>

              {!hasFixedTeams && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  {t('gameDetails.bracketRequiresFixedTeams', {
                    defaultValue: 'Bracket playoffs require fixed teams.',
                  })}
                </p>
              )}

              {showBracketScopeSwitch && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
                    {t('gameDetails.bracketScopeLabel', { defaultValue: 'Bracket scope' })}
                  </label>
                  <SegmentedSwitch
                    tabs={[
                      {
                        id: 'PER_GROUP',
                        label: t('gameDetails.bracketScopePerGroup', {
                          defaultValue: 'Separate bracket per group',
                        }),
                      },
                      {
                        id: 'CROSS_GROUP',
                        label: t('gameDetails.bracketScopeCrossGroup', {
                          defaultValue: 'One bracket across groups',
                        }),
                      },
                    ]}
                    activeId={bracketScope}
                    onChange={(id) => {
                      setBracketScope(id as BracketScope);
                      setCrossManualGlobalIds(null);
                    }}
                    showOnlyActiveTabText={false}
                    layoutId="bracket-scope"
                  />
                </div>
              )}

              {isCrossGroupBracket ? (
                <CrossGroupBracketConfigStep
                  groups={groups}
                  getStandingsForGroup={getStandingsForGroup}
                  teamsPerGroup={crossTeamsPerGroup}
                  onTeamsPerGroupChange={setCrossTeamsPerGroup}
                  includedGroupIds={crossIncludedGroupIds}
                  onIncludedGroupIdsChange={setCrossIncludedGroupIds}
                  seedingPreset={crossSeedingPreset}
                  onSeedingPresetChange={setCrossSeedingPreset}
                  manualGlobalIds={crossManualGlobalIds}
                  onManualGlobalIdsChange={setCrossManualGlobalIds}
                  phase4EntrantCount={
                    crossDerived.totalN >= BRACKET_MIN_ENTRANTS ? crossDerived.totalN : undefined
                  }
                  includeThirdPlace={crossIncludeThirdPlace}
                  onIncludeThirdPlaceChange={setCrossIncludeThirdPlace}
                  includeConsolationBracket={crossIncludeConsolationBracket}
                  onIncludeConsolationBracketChange={setCrossIncludeConsolationBracket}
                  includeDoubleElimination={crossIncludeDoubleElimination}
                  onIncludeDoubleEliminationChange={setCrossIncludeDoubleElimination}
                  customByeEnabled={crossCustomByeEnabled}
                  onCustomByeEnabledChange={setCrossCustomByeEnabled}
                  customByeSeedRanks={crossCustomByeRanks}
                  onCustomByeSeedRanksChange={setCrossCustomByeRanks}
                  customPlayInEnabled={crossCustomPlayInEnabled}
                  onCustomPlayInEnabledChange={setCrossCustomPlayInEnabled}
                  playInPairs={crossPlayInPairs}
                  onPlayInPairsChange={setCrossPlayInPairs}
                  seedLabels={crossConfigSeedLabels}
                />
              ) : null}
              {!isCrossGroupBracket ? (
                <>
              {groups.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
                    {t('gameDetails.group', { defaultValue: 'Group' })}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g) => {
                      const isSelected = selectedGroupId === g.id;
                      const accent = g.color ? getLeagueGroupColor(g.color) : undefined;
                      const soft = g.color ? getLeagueGroupSoftColor(g.color, '20') : undefined;
                      const groupTotal = getStandingsForGroup(g.id).length;
                      const groupCount = selectedIdsByGroup[g.id]?.size ?? 0;
                      const groupReady =
                        getGroupSetupStatus({
                          selectedCount: groupCount,
                          minParticipants,
                          maxParticipants,
                        }) === 'ready';
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => setSelectedGroupId(g.id)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium transition-all duration-200 ${
                            isSelected
                              ? 'border-primary-500 bg-primary-500/15 dark:bg-primary-400/15 text-primary-700 dark:text-primary-300 ring-1 ring-primary-500/30 dark:ring-primary-400/30'
                              : groupReady
                                ? 'border-emerald-500/40 bg-emerald-500/5 dark:bg-emerald-500/10 text-gray-700 dark:text-gray-300'
                                : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                          style={isSelected && soft ? { backgroundColor: soft, borderColor: accent } : undefined}
                        >
                          {g.color && (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-current/20"
                              style={{ backgroundColor: accent }}
                            />
                          )}
                          <span>{g.name}</span>
                          {groupReady && (
                            <Check
                              className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                              aria-hidden
                            />
                          )}
                          <span
                            className={
                              groupReady
                                ? 'text-gray-500 dark:text-gray-400'
                                : 'text-amber-600 dark:text-amber-400 font-semibold'
                            }
                          >
                            ({groupCount}/{groupTotal})
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {quickSelectOptions.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block text-center">
                    {t('gameDetails.participants', { defaultValue: 'Participants' })}
                  </label>
                  <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 sm:gap-1.5 w-full max-w-xs sm:max-w-sm mx-auto">
                    {quickSelectOptions.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => handleQuickSelectCount(n)}
                        className={`aspect-square rounded-md sm:rounded-lg font-bold text-xs sm:text-sm transition-all duration-200 ${
                          isQuickSelectActive(n)
                            ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/40 scale-105 ring-2 ring-primary-400 ring-offset-1 dark:ring-offset-gray-900'
                            : 'bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 text-gray-700 dark:text-gray-300 hover:from-gray-200 hover:to-gray-100 dark:hover:from-gray-700 dark:hover:to-gray-800 hover:scale-105 active:scale-95 shadow border border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {groupTitle} ({selectedCount}/{filteredStandings.length})
                  </span>
                  {filteredStandings.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {selectedIds.size === Math.min(filteredStandings.length, maxParticipants ?? filteredStandings.length)
                        ? t('common.deselectAll', { defaultValue: 'Deselect all' })
                        : t('common.selectAll', { defaultValue: 'Select all' })}
                    </button>
                  )}
                </div>

                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
                  </div>
                ) : filteredStandings.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                    {t('gameDetails.noParticipantsInGroup', { defaultValue: 'No participants in this group.' })}
                  </p>
                ) : (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                          <th className="w-10 px-2 py-2" />
                          <th className="w-10 px-1 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">
                            {isBracket
                              ? t('gameDetails.bracketSeed', { defaultValue: 'Seed' })
                              : '#'}
                          </th>
                          <th className="text-left py-2 pr-2 font-semibold text-gray-700 dark:text-gray-300">
                            {hasFixedTeams ? t('gameDetails.team') : t('gameDetails.player')}
                          </th>
                          <th className="text-center py-2 font-semibold text-gray-700 dark:text-gray-300">
                            {t('gameResults.winsTiesLosses')}
                          </th>
                          <th className="text-center py-2 px-2 font-semibold text-gray-700 dark:text-gray-300">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStandings.map((standing, index) => {
                          const isSelected = selectedIds.has(standing.id);
                          const accent = selectedGroup?.color
                            ? getLeagueGroupSoftColor(selectedGroup.color, '20')
                            : undefined;
                          const seedDisplay = isSelected && isBracket
                            ? getStandingsForGroup(selectedGroupId)
                                .filter((s) => selectedIds.has(s.id))
                                .findIndex((s) => s.id === standing.id) + 1
                            : index + 1;
                          return (
                            <tr
                              key={standing.id}
                              className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${
                                isSelected ? 'bg-primary-50/50 dark:bg-primary-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                              style={isSelected && accent ? { backgroundColor: accent } : undefined}
                            >
                              <td className="px-2 py-2">
                                <label
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      handleToggle(standing.id);
                                    }
                                  }}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleToggle(standing.id);
                                  }}
                                  className={`cursor-pointer inline-flex items-center justify-center w-5 h-5 rounded border transition-all duration-200 hover:border-primary-400 dark:hover:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/50 focus-within:ring-offset-1 dark:focus-within:ring-offset-gray-900 select-none shrink-0 outline-none ${
                                    isSelected
                                      ? 'bg-primary-500 border-primary-500 dark:bg-primary-500 dark:border-primary-500 text-white'
                                      : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-transparent'
                                  }`}
                                  aria-label={t('common.select', { defaultValue: 'Select' })}
                                  aria-pressed={isSelected}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    readOnly
                                    tabIndex={-1}
                                    className="sr-only pointer-events-none"
                                    aria-hidden
                                  />
                                  <Check size={12} strokeWidth={2.5} className={isSelected ? '' : 'opacity-0'} />
                                </label>
                              </td>
                              <td className="px-1 py-2 text-gray-600 dark:text-gray-400">
                                {isSelected || !isBracket ? seedDisplay : '—'}
                              </td>
                              <td className="py-2 pr-2">
                                {hasFixedTeams && standing.leagueTeam ? (
                                  <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2">
                                      {standing.leagueTeam.players?.slice(0, 3).map((player: { id: string; user?: BasicUser }) => (
                                        <PlayerAvatar
                                          key={player.id}
                                          player={player.user}
                                          extrasmall
                                          showName={false}
                                          fullHideName
                                        />
                                      ))}
                                    </div>
                                    <span className="text-gray-900 dark:text-white">
                                      {standing.leagueTeam.players
                                        ?.map(
                                          (p: { user?: { firstName?: string; lastName?: string } }) =>
                                            [p.user?.firstName, p.user?.lastName].filter(Boolean).join(' ')
                                        )
                                        .filter(Boolean)
                                        .join(', ')}
                                    </span>
                                  </div>
                                ) : standing.user ? (
                                  <div className="flex items-center gap-2">
                                    <PlayerAvatar
                                      player={standing.user}
                                      extrasmall
                                      showName={false}
                                      fullHideName
                                    />
                                    <span className="text-gray-900 dark:text-white">
                                      {[standing.user.firstName, standing.user.lastName].filter(Boolean).join(' ')}
                                    </span>
                                  </div>
                                ) : null}
                              </td>
                              <td className="py-2 text-center text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {standing.wins}-{standing.ties}-{standing.losses}
                              </td>
                              <td className="py-2 px-2 text-center text-gray-700 dark:text-gray-300">
                                {standing.scoreDelta > 0 ? '+' : ''}
                                {standing.scoreDelta}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loading && filteredStandings.length > 0 && !groupMeetsMin(selectedGroupId) && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    {isBracket
                      ? t('gameDetails.bracketMinParticipants', {
                          defaultValue: 'Select between {{min}} and {{max}} teams.',
                          min: BRACKET_MIN_ENTRANTS,
                          max: BRACKET_MAX_ENTRANTS,
                        })
                      : t('gameDetails.playoffMinParticipants', {
                          defaultValue: 'Select at least 4 participants.',
                          count: SESSION_MIN_PARTICIPANTS,
                        })}
                  </p>
                )}
              </div>

              {isBracket && !groupMeetsMin(selectedGroupId) && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                  {t('gameDetails.bracketAdvancedOptionsGateHint', {
                    defaultValue: 'Finish participant selection to unlock bracket structure and advanced options.',
                  })}
                </p>
              )}

              {isBracket && groupMeetsMin(selectedGroupId) && (
                <>
                  <BracketStructureSummary
                    entrantCount={selectedCount}
                    customByeSeedRanks={
                      customByeEnabledByGroup[selectedGroupId]
                        ? customByeRanksByGroup[selectedGroupId]
                        : undefined
                    }
                  />
                  <BracketPhase4CreateOptions
                    entrantCount={selectedCount}
                    includeThirdPlace={getPhase4FlagForGroup(includeThirdPlaceByGroup, selectedGroupId)}
                    onIncludeThirdPlaceChange={(value) =>
                      setIncludeThirdPlaceByGroup((prev) =>
                        setPhase4FlagForGroup(prev, selectedGroupId, value)
                      )
                    }
                    includeConsolationBracket={getPhase4FlagForGroup(
                      includeConsolationBracketByGroup,
                      selectedGroupId
                    )}
                    onIncludeConsolationBracketChange={(value) =>
                      setIncludeConsolationBracketByGroup((prev) =>
                        setPhase4FlagForGroup(prev, selectedGroupId, value)
                      )
                    }
                    includeDoubleElimination={getPhase4FlagForGroup(
                      includeDoubleEliminationByGroup,
                      selectedGroupId
                    )}
                    onIncludeDoubleEliminationChange={(value) =>
                      setIncludeDoubleEliminationByGroup((prev) =>
                        setPhase4FlagForGroup(prev, selectedGroupId, value)
                      )
                    }
                    customByeEnabled={customByeEnabledByGroup[selectedGroupId] ?? false}
                    onCustomByeEnabledChange={(enabled) =>
                      setCustomByeEnabledByGroup((prev) => ({ ...prev, [selectedGroupId]: enabled }))
                    }
                    customByeSeedRanks={customByeRanksByGroup[selectedGroupId] ?? []}
                    onCustomByeSeedRanksChange={(ranks) =>
                      setCustomByeRanksByGroup((prev) => ({ ...prev, [selectedGroupId]: ranks }))
                    }
                    seedLabels={configSeedLabels}
                  />
                  <BracketPlayInPairEditor
                    entrantCount={selectedCount}
                    enabled={customPlayInEnabledByGroup[selectedGroupId] ?? false}
                    onEnabledChange={(v) =>
                      setCustomPlayInEnabledByGroup((prev) => ({ ...prev, [selectedGroupId]: v }))
                    }
                    pairs={playInPairsByGroup[selectedGroupId] ?? []}
                    onPairsChange={(pairs) =>
                      setPlayInPairsByGroup((prev) => ({ ...prev, [selectedGroupId]: pairs }))
                    }
                    customByeSeedRanks={
                      customByeEnabledByGroup[selectedGroupId]
                        ? customByeRanksByGroup[selectedGroupId]
                        : undefined
                    }
                    seedLabels={configSeedLabels}
                  />
                </>
              )}
                </>
              ) : null}
            </div>
          )}

          {step === 'preview' && isBracket && isCrossGroupBracket && crossPreviewPlan && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-center">
                {t('gameDetails.bracketCrossGroupUnequalSummary', {
                  total: crossDerived.totalN,
                  breakdown: crossSummaryBreakdown,
                })}
              </p>
              <BracketPlayoffPreview
                plan={crossPreviewPlan}
                standingsById={standingsById}
                reorderable
                onPlanChange={(next) => setCrossPreviewOrderedIds(next.orderedParticipantIds)}
              />
            </div>
          )}

          {step === 'preview' && isBracket && !isCrossGroupBracket && (
            <div className="space-y-4">
              {groups.map((g) => {
                const count = selectedIdsByGroup[g.id]?.size ?? 0;
                if (count < BRACKET_MIN_ENTRANTS) return null;
                let plan;
                const order = participantIdsForGroupCreate(g.id);
                const planOptions = bracketPlanOptionsFromWizardConfig({
                  customByeEnabled: customByeEnabledByGroup[g.id] ?? false,
                  customByeSeedRanks: customByeRanksByGroup[g.id] ?? [],
                  customPlayInEnabled: customPlayInEnabledByGroup[g.id] ?? false,
                  playInSeedPairs: playInPairsByGroup[g.id] ?? [],
                });
                try {
                  plan = buildBracketPlan(count, order, planOptions);
                } catch {
                  return null;
                }
                return (
                  <div key={g.id} className="space-y-2">
                    <p className="text-sm font-medium text-center flex items-center justify-center gap-2">
                      {g.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: getLeagueGroupColor(g.color) }}
                        />
                      )}
                      {g.name}
                    </p>
                    <BracketPlayoffPreview
                      plan={plan}
                      standingsById={standingsById}
                      groupColor={g.color}
                      reorderable
                      onPlanChange={(next) =>
                        setPreviewOrderedByGroup((prev) => ({
                          ...prev,
                          [g.id]: next.orderedParticipantIds,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}

          {step === 'summary' && (
            <div className="space-y-4">
              {isBracket && (
                <Button
                  variant="outline"
                  type="button"
                  className="w-full"
                  onClick={() => {
                    initPreviewOrders();
                    setPreviewReturnStep('summary');
                    setStep('preview');
                  }}
                >
                  {t('gameDetails.bracketConfirmViewPreview', {
                    defaultValue: 'View bracket preview',
                  })}
                </Button>
              )}
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">{t('gameDetails.playoffFormat')}</dt>
                  <dd className="font-medium text-gray-900 dark:text-white">{formatLabel}</dd>
                </div>
                {isCrossGroupBracket && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">
                      {t('gameDetails.bracketSeasonPlayoff', { defaultValue: 'Season playoff' })}
                    </dt>
                    <dd className="text-gray-900 dark:text-white mt-1">
                      <p>
                        {t('gameDetails.bracketCrossGroupUnequalSummary', {
                          total: crossDerived.totalN,
                          breakdown: crossSummaryBreakdown,
                        })}
                      </p>
                      {crossPreviewPlan && (
                        <div className="mt-2">
                          <BracketStructureSummary
                            entrantCount={crossPreviewPlan.entrantCount}
                            customByeSeedRanks={
                              crossCustomByeEnabled ? crossCustomByeRanks : undefined
                            }
                            className="text-left text-xs"
                          />
                        </div>
                      )}
                      <BracketPlayoffConfirmOptions
                        includeThirdPlace={crossIncludeThirdPlace}
                        includeConsolationBracket={crossIncludeConsolationBracket}
                        includeDoubleElimination={crossIncludeDoubleElimination}
                        customByeEnabled={crossCustomByeEnabled}
                        customByeSeedRanks={crossCustomByeRanks}
                        customPlayInEnabled={crossCustomPlayInEnabled}
                        playInSeedPairs={crossPlayInPairs}
                      />
                      <ul className="list-disc list-inside space-y-0.5 mt-2 text-gray-600 dark:text-gray-400 ml-1">
                        {(crossPreviewOrderedIds ?? crossDerived.globalParticipantIds).map((id, idx) => {
                          const s = standingsById.get(id);
                          const gId = s?.currentGroupId ?? s?.currentGroup?.id;
                          const gName = groups.find((gr) => gr.id === gId)?.name;
                          return (
                            <li key={id}>
                              {getStandingDisplayName(s)} ({idx + 1}
                              {gName ? ` · ${gName}` : ''})
                            </li>
                          );
                        })}
                      </ul>
                    </dd>
                  </div>
                )}
                {!isCrossGroupBracket && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">{t('gameDetails.groupsWithPlayoff', { defaultValue: 'Groups' })}</dt>
                  <dd className="text-gray-900 dark:text-white mt-1 space-y-3">
                    {groups.map((g) => {
                      const participantIds = isBracket
                        ? participantIdsForGroupCreate(g.id)
                        : getOrderedParticipantIds(g.id);
                      if (participantIds.length < minParticipants) return null;
                      const groupStandings = participantIds
                        .map((id) => standingsById.get(id))
                        .filter((s): s is LeagueStanding => !!s);
                      const planOptions =
                        isBracket && participantIds.length >= BRACKET_MIN_ENTRANTS
                          ? bracketPlanOptionsFromWizardConfig({
                              customByeEnabled: customByeEnabledByGroup[g.id] ?? false,
                              customByeSeedRanks: customByeRanksByGroup[g.id] ?? [],
                              customPlayInEnabled: customPlayInEnabledByGroup[g.id] ?? false,
                              playInSeedPairs: playInPairsByGroup[g.id] ?? [],
                            })
                          : undefined;
                      const metrics =
                        isBracket && participantIds.length >= BRACKET_MIN_ENTRANTS
                          ? buildBracketPlan(participantIds.length, participantIds, planOptions)
                          : null;
                      return (
                        <div key={g.id}>
                          <p className="font-medium flex items-center gap-2">
                            {g.color && (
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: getLeagueGroupColor(g.color) }}
                              />
                            )}
                            {g.name} ({participantIds.length})
                          </p>
                          {metrics && (
                            <div className="mt-1">
                              <BracketStructureSummary
                                entrantCount={metrics.entrantCount}
                                customByeSeedRanks={
                                  customByeEnabledByGroup[g.id]
                                    ? customByeRanksByGroup[g.id]
                                    : undefined
                                }
                                className="text-left text-xs"
                              />
                            </div>
                          )}
                          {isBracket && (
                            <BracketPlayoffConfirmOptions
                              includeThirdPlace={getPhase4FlagForGroup(includeThirdPlaceByGroup, g.id)}
                              includeConsolationBracket={getPhase4FlagForGroup(
                                includeConsolationBracketByGroup,
                                g.id
                              )}
                              includeDoubleElimination={getPhase4FlagForGroup(
                                includeDoubleEliminationByGroup,
                                g.id
                              )}
                              customByeEnabled={customByeEnabledByGroup[g.id]}
                              customByeSeedRanks={customByeRanksByGroup[g.id]}
                              customPlayInEnabled={customPlayInEnabledByGroup[g.id]}
                              playInSeedPairs={playInPairsByGroup[g.id]}
                            />
                          )}
                          <ul className="list-disc list-inside space-y-0.5 mt-1 text-gray-600 dark:text-gray-400 ml-1">
                            {groupStandings.map((s, idx) => (
                              <li key={s.id}>
                                {getStandingDisplayName(s)} ({idx + 1})
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </dd>
                </div>
                )}
              </dl>
            </div>
          )}

          {step === 'gameSetup' && !isBracket && (
            <PlayoffGameSetupStep
              gameType={formatChoice}
              onBack={() => setStep('summary')}
              onConfirm={handleSessionGameSetupConfirm}
              submitting={submitting}
            />
          )}

          {step === 'gameSetup' && isBracket && (
            <BracketPlayoffGameSetupStep
              onBack={() => setStep('preview')}
              onConfirm={handleBracketGameSetupConfirm}
              submitting={submitting}
            />
          )}
        </div>

        {step !== 'gameSetup' && (
          <DialogFooter className="flex gap-1 border-t border-gray-200 dark:border-gray-700">
            {step === 'summary' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep(isBracket ? 'gameSetup' : 'config')}
                  className="flex-1"
                  disabled={submitting}
                >
                  {t('common.back', { defaultValue: 'Back' })}
                </Button>
                <Button
                  onClick={isBracket ? handleBracketCreateConfirm : () => setStep('gameSetup')}
                  disabled={isBracket ? submitting || !bracketGameSetup : false}
                  className="flex-1"
                >
                  {isBracket && submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                  ) : (
                    t(isBracket ? 'gameDetails.createPlayoff' : 'common.confirm')
                  )}
                </Button>
              </>
            ) : step === 'preview' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setStep(previewReturnStep === 'summary' ? 'summary' : 'config')}
                  className="flex-1"
                >
                  {t('common.back', { defaultValue: 'Back' })}
                </Button>
                <Button
                  onClick={() => {
                    if (previewReturnStep === 'summary') {
                      setPreviewReturnStep(null);
                      setStep('summary');
                    } else {
                      setStep('gameSetup');
                    }
                  }}
                  className="flex-1"
                >
                  {previewReturnStep === 'summary'
                    ? t('gameDetails.bracketConfirmBackToSummary', { defaultValue: 'Back to confirm' })
                    : t('common.next', { defaultValue: 'Next' })}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={onClose} className="flex-1">
                  {t('common.cancel')}
                </Button>
                <Button onClick={handlePrimaryNext} disabled={!canCreate} className="flex-1">
                  {t('common.next', { defaultValue: 'Next' })}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
