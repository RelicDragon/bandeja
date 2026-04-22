import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  Button,
  CreateGameHeader,
  LeagueLocationSection,
  LeagueSeasonSection,
  GameFormatCard,
  GameFormatWizard,
} from '@/components';
import { clubsApi, citiesApi } from '@/api';
import { leaguesApi } from '@/api/leagues';
import { mediaApi } from '@/api/media';
import { Club, City } from '@/types';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { useGameFormat } from '@/hooks/useGameFormat';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';
import { useAuthStore } from '@/store/authStore';
import { maxLeagueSeasonParticipantsCap } from '@/utils/userMaxParticipantsInGame';

export const CreateLeague = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const seasonParticipantsCap = maxLeagueSeasonParticipantsCap(user);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>('');
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  const [seasonName, setSeasonName] = useState(`${currentYear}/${nextYear}`);
  const [playerLevelRange, setPlayerLevelRange] = useState<[number, number]>([1.0, 7.0]);
  const [maxParticipants, setMaxParticipants] = useState<number>(4);
  const [startDate, setStartDate] = useState<Date | null>(null);

  const [pendingSeasonAvatarFiles, setPendingSeasonAvatarFiles] = useState<{ avatar: File; original: File } | null>(null);
  const [isLeagueFormatWizardOpen, setIsLeagueFormatWizardOpen] = useState(false);

  const leagueGameFormat = useGameFormat(
    {
      maxParticipants,
      matchGenerationType: 'HANDMADE',
      scoringMode: 'CLASSIC',
    },
    { skipGenerationParticipantDefaults: true },
  );

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setMaxParticipants((prev) => Math.max(4, Math.min(prev, seasonParticipantsCap)));
  }, [seasonParticipantsCap]);

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await citiesApi.getAll();
        setCities(response.data);
      } catch (error) {
        console.error('Failed to fetch cities:', error);
      }
    };
    fetchCities();
  }, []);

  useEffect(() => {
    const fetchClubs = async () => {
      if (!selectedCityId) {
        setClubs([]);
        setSelectedClubId('');
        return;
      }
      try {
        const response = await clubsApi.getByCityId(selectedCityId);
        setClubs(response.data);
        setSelectedClubId('');
      } catch (error) {
        console.error('Failed to fetch clubs:', error);
      }
    };
    fetchClubs();
  }, [selectedCityId]);

  useBackButtonHandler(() => {
    navigate('/', { replace: true });
    return true;
  });

  const handleCreateLeague = async () => {
    if (!name.trim()) {
      return;
    }

    if (!startDate) {
      return;
    }

    setLoading(true);
    try {
      if (!selectedCityId) {
        return;
      }

      const setup = leagueGameFormat.setupPayload;
      const leagueResponse = await leaguesApi.create({
        ...resultsRoundGenV2Payload,
        name: name.trim(),
        description: description.trim() || undefined,
        cityId: selectedCityId,
        clubId: selectedClubId || undefined,
        season: {
          name: seasonName.trim(),
          minLevel: playerLevelRange[0],
          maxLevel: playerLevelRange[1],
          maxParticipants,
          startDate: startDate.toISOString(),
          gameSeason: {
            fixedNumberOfSets: setup.fixedNumberOfSets,
            maxTotalPointsPerSet: setup.maxTotalPointsPerSet,
            maxPointsPerTeam: setup.maxPointsPerTeam,
            matchTimedCapMinutes: setup.matchTimedCapMinutes,
            winnerOfGame: setup.winnerOfGame,
            winnerOfMatch: setup.winnerOfMatch,
            matchGenerationType: setup.matchGenerationType,
            prohibitMatchesEditing: setup.prohibitMatchesEditing ?? false,
            pointsPerWin: setup.pointsPerWin,
            pointsPerLoose: setup.pointsPerLoose,
            pointsPerTie: setup.pointsPerTie,
            ballsInGames: setup.ballsInGames,
            scoringPreset: setup.scoringPreset ?? undefined,
            scoringMode: leagueGameFormat.scoringMode,
            hasGoldenPoint: setup.hasGoldenPoint ?? false,
            gameType: leagueGameFormat.gameType,
          },
        },
      });

      if (pendingSeasonAvatarFiles && (leagueResponse.data as any)?.seasons?.[0]?.game?.id) {
        try {
          await mediaApi.uploadGameAvatar((leagueResponse.data as any).seasons[0].game.id, pendingSeasonAvatarFiles.avatar, pendingSeasonAvatarFiles.original);
        } catch (avatarError) {
          console.error('Failed to upload season avatar:', avatarError);
        }
      }

      navigate('/', { replace: true });
    } catch (error) {
      console.error('Failed to create league:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeasonAvatarUpload = async (avatarFile: File, originalFile: File) => {
    setPendingSeasonAvatarFiles({ avatar: avatarFile, original: originalFile });
  };

  const handleSeasonAvatarRemove = async () => {
    setPendingSeasonAvatarFiles(null);
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <CreateGameHeader onBack={() => navigate('/', { replace: true })} entityType="LEAGUE" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-6">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('createLeague.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
              placeholder={t('createLeague.namePlaceholder')}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('createLeague.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none resize-none"
              placeholder={t('createLeague.descriptionPlaceholder')}
            />
          </div>

          <LeagueLocationSection
            cities={cities}
            clubs={clubs}
            selectedCityId={selectedCityId}
            selectedClubId={selectedClubId}
            isCityModalOpen={isCityModalOpen}
            isClubModalOpen={isClubModalOpen}
            onSelectCity={setSelectedCityId}
            onSelectClub={setSelectedClubId}
            onOpenCityModal={() => setIsCityModalOpen(true)}
            onCloseCityModal={() => setIsCityModalOpen(false)}
            onOpenClubModal={() => setIsClubModalOpen(true)}
            onCloseClubModal={() => setIsClubModalOpen(false)}
          />

          <LeagueSeasonSection
            seasonName={seasonName}
            playerLevelRange={playerLevelRange}
            maxParticipants={maxParticipants}
            seasonParticipantsCap={seasonParticipantsCap}
            startDate={startDate}
            seasonAvatar={pendingSeasonAvatarFiles ? URL.createObjectURL(pendingSeasonAvatarFiles.avatar) : undefined}
            onSeasonNameChange={setSeasonName}
            onPlayerLevelRangeChange={setPlayerLevelRange}
            onMaxParticipantsChange={setMaxParticipants}
            onStartDateChange={setStartDate}
            onSeasonAvatarUpload={handleSeasonAvatarUpload}
            onSeasonAvatarRemove={handleSeasonAvatarRemove}
            isUploadingAvatar={loading}
          />

          <GameFormatCard
            entityType="LEAGUE_SEASON"
            format={leagueGameFormat}
            generationSlotCount={maxParticipants}
            onOpenWizard={() => setIsLeagueFormatWizardOpen(true)}
          />
          {isLeagueFormatWizardOpen && (
            <GameFormatWizard
              isOpen={isLeagueFormatWizardOpen}
              format={leagueGameFormat}
              wizardEntityType="LEAGUE_SEASON"
              generationSlotCount={maxParticipants}
              onClose={() => setIsLeagueFormatWizardOpen(false)}
            />
          )}

          <Button
            onClick={handleCreateLeague}
            disabled={loading || !name.trim() || !selectedCityId || !startDate}
            className="w-full py-3 text-base font-semibold mt-4 flex items-center justify-center gap-2"
            size="lg"
          >
            {loading ? (
              t('common.loading')
            ) : (
              <>
                <Plus size={20} />
                {t('createLeague.createButton')}
              </>
            )}
          </Button>
        </div>
      </div>

    </div>
  );
};

