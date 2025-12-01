import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, CreateGameHeader, LeagueLocationSection, LeagueSeasonSection, GameSetupModal } from '@/components';
import { clubsApi, citiesApi } from '@/api';
import { leaguesApi } from '@/api/leagues';
import { mediaApi } from '@/api/media';
import { Club, City, WinnerOfGame, WinnerOfMatch, MatchGenerationType, ParticipantLevelUpMode } from '@/types';

export const CreateLeague = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
  
  const [isSeasonSetupModalOpen, setIsSeasonSetupModalOpen] = useState(false);
  const [pendingSeasonAvatarFiles, setPendingSeasonAvatarFiles] = useState<{ avatar: File; original: File } | null>(null);
  const [gameSetupSeason, setGameSetupSeason] = useState<{
    fixedNumberOfSets?: number;
    maxTotalPointsPerSet?: number;
    maxPointsPerTeam?: number;
    winnerOfGame?: WinnerOfGame;
    winnerOfMatch?: WinnerOfMatch;
    participantLevelUpMode?: ParticipantLevelUpMode;
    matchGenerationType?: MatchGenerationType;
    prohibitMatchesEditing?: boolean;
    pointsPerWin?: number;
    pointsPerLoose?: number;
    pointsPerTie?: number;
    ballsInGames?: boolean;
  }>({});
  
  const [loading, setLoading] = useState(false);

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

  const handleSeasonSetupConfirm = (params: {
    fixedNumberOfSets: number;
    maxTotalPointsPerSet: number;
    maxPointsPerTeam: number;
    winnerOfGame: WinnerOfGame;
    winnerOfMatch: WinnerOfMatch;
    participantLevelUpMode: ParticipantLevelUpMode;
    matchGenerationType: MatchGenerationType;
    prohibitMatchesEditing?: boolean;
    pointsPerWin: number;
    pointsPerLoose: number;
    pointsPerTie: number;
    ballsInGames: boolean;
  }) => {
    setGameSetupSeason(params);
  };

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

      const leagueResponse = await leaguesApi.create({
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
          gameSeason: Object.keys(gameSetupSeason).length > 0 ? {
            fixedNumberOfSets: gameSetupSeason.fixedNumberOfSets ?? 0,
            maxTotalPointsPerSet: gameSetupSeason.maxTotalPointsPerSet ?? 0,
            maxPointsPerTeam: gameSetupSeason.maxPointsPerTeam ?? 0,
            winnerOfGame: gameSetupSeason.winnerOfGame ?? 'BY_MATCHES_WON',
            winnerOfMatch: gameSetupSeason.winnerOfMatch ?? 'BY_SCORES',
            participantLevelUpMode: gameSetupSeason.participantLevelUpMode ?? 'BY_MATCHES',
            matchGenerationType: gameSetupSeason.matchGenerationType ?? 'HANDMADE',
            prohibitMatchesEditing: gameSetupSeason.prohibitMatchesEditing ?? false,
            pointsPerWin: gameSetupSeason.pointsPerWin ?? 0,
            pointsPerLoose: gameSetupSeason.pointsPerLoose ?? 0,
            pointsPerTie: gameSetupSeason.pointsPerTie ?? 0,
          } : undefined,
        },
      });

      if (pendingSeasonAvatarFiles && (leagueResponse.data as any)?.seasons?.[0]?.game?.id) {
        try {
          await mediaApi.uploadGameAvatar((leagueResponse.data as any).seasons[0].game.id, pendingSeasonAvatarFiles.avatar, pendingSeasonAvatarFiles.original);
        } catch (avatarError) {
          console.error('Failed to upload season avatar:', avatarError);
        }
      }

      navigate('/');
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
      <CreateGameHeader onBack={() => navigate('/')} entityType="LEAGUE" />

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

          <Button
            onClick={() => setIsSeasonSetupModalOpen(true)}
            className="w-full py-3 text-base font-semibold"
            size="lg"
            variant="outline"
          >
            {t('createLeague.gameSetupSeason')}
          </Button>

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

      {isSeasonSetupModalOpen && (
        <GameSetupModal
          isOpen={isSeasonSetupModalOpen}
          entityType="LEAGUE"
          isEditing={true}
          confirmButtonText={t('common.save')}
          initialValues={gameSetupSeason}
          onClose={() => setIsSeasonSetupModalOpen(false)}
          onConfirm={handleSeasonSetupConfirm}
        />
      )}
    </div>
  );
};

