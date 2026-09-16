import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { MapPin } from 'lucide-react';
import {
  CreateGameHeader,
  PlayerLevelSection,
  PriceSection,
  CityModal,
} from '@/components';
import { CreateFlowSportSelector } from '@/components/createGame/CreateFlowSportSelector';
import { CreateGameFooterBar } from '@/components/createGame/CreateGameFooterBar';
import { EventCreatorIntentChips } from '@/components/createEvent/EventCreatorIntentChips';
import { EventKindChips } from '@/components/createEvent/EventKindChips';
import { EventHeroUploader } from '@/components/createEvent/EventHeroUploader';
import { EventVenueFields } from '@/components/createEvent/EventVenueFields';
import { EventDateRangeFields } from '@/components/createEvent/EventDateRangeFields';
import { citiesApi, clubsApi, gamesApi } from '@/api';
import type {
  City,
  Club,
  EventKind,
  Game,
  PriceCurrency,
  PriceType,
  Sport,
} from '@/types';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import {
  getDisplayLevelForSport,
  listCreateFlowSports,
  resolveCreateGameDefaultSport,
} from '@/utils/profileSports';
import { filterClubsBySport } from '@/utils/courtSport';
import { resolveUserCurrency } from '@/utils/currency';
import {
  buildCreateEventPayload,
  createEventSubmitIssue,
  defaultEventDateRange,
  isPlayingClub,
  type EventCreatorIntent,
  type EventHeroPayload,
} from '@/utils/createEventPayload';
import { authoredGameTextForEdit } from '@/utils/gameText/authoredGameTextForEdit';
import { GameTextAuthoredFieldsHint } from '@/components/gameText/GameTextAuthoredFieldsHint';

type CreateEventProps = {
  initialGameData?: Partial<Game>;
};

const getDefaultLevelRange = (level?: number): [number, number] => {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return [1.0, 7.0];
  }
  const minLevel = Math.max(1.0, Math.min(7.0, level - 0.7));
  const maxLevel = Math.max(1.0, Math.min(7.0, level + 0.7));
  return [minLevel, maxLevel];
};

export function CreateEvent({ initialGameData }: CreateEventProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const enabledSports = useMemo(() => listCreateFlowSports(user), [user]);
  const defaultSport = useMemo(() => {
    const hinted = initialGameData?.sport;
    if (hinted && enabledSports.includes(hinted)) return hinted;
    return resolveCreateGameDefaultSport(user);
  }, [enabledSports, initialGameData?.sport, user]);

  const [eventCreatorIntent, setEventCreatorIntent] = useState<EventCreatorIntent | null>(null);
  const [eventKind, setEventKind] = useState<EventKind | null>(null);
  const [selectedSport, setSelectedSport] = useState<Sport>(defaultSport);
  const [playerLevelRange, setPlayerLevelRange] = useState<[number, number]>(() =>
    getDefaultLevelRange(user ? getDisplayLevelForSport(user, defaultSport) : undefined),
  );
  const initialAuthored = authoredGameTextForEdit(initialGameData);
  const [gameName, setGameName] = useState(initialAuthored.name);
  const [description, setDescription] = useState(initialAuthored.description);
  const [eventHeroes, setEventHeroes] = useState<EventHeroPayload[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedCityId, setSelectedCityId] = useState(user?.currentCityId ?? '');
  const [selectedClubId, setSelectedClubId] = useState('');
  const [venueText, setVenueText] = useState('');
  const [isCityModalOpen, setIsCityModalOpen] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const initialRange = defaultEventDateRange(initialGameData?.startTime);
  const [startTime, setStartTime] = useState(initialRange.start);
  const [endTime, setEndTime] = useState(initialRange.end);
  const [priceTotal, setPriceTotal] = useState<number | undefined>(undefined);
  const [priceType, setPriceType] = useState<PriceType>('NOT_KNOWN');
  const [priceCurrency, setPriceCurrency] = useState<PriceCurrency | undefined>(undefined);
  const [externalUrl, setExternalUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const showSportSelector = enabledSports.length > 1;
  const selectedCity = cities.find((c) => c.id === selectedCityId);
  const clubsForSport = useMemo(
    () => filterClubsBySport(clubs.filter(isPlayingClub), selectedSport, selectedClubId || undefined),
    [clubs, selectedSport, selectedClubId],
  );

  useEffect(() => {
    if (!enabledSports.includes(selectedSport)) {
      setSelectedSport(enabledSports[0] ?? 'PADEL');
    }
  }, [enabledSports, selectedSport]);

  useEffect(() => {
    if (!user) return;
    setPlayerLevelRange(getDefaultLevelRange(getDisplayLevelForSport(user, selectedSport)));
  }, [selectedSport, user]);

  useEffect(() => {
    void citiesApi
      .getAll()
      .then((response) => {
        setCities(response.data);
      })
      .catch((error) => {
        console.error('Failed to fetch cities:', error);
      });
  }, []);

  useEffect(() => {
    if (!selectedCityId) {
      setClubs([]);
      setSelectedClubId('');
      return;
    }
    let cancelled = false;
    void clubsApi
      .getByCityId(selectedCityId, 'EVENT')
      .then((response) => {
        if (cancelled) return;
        setClubs((response.data ?? []).filter(isPlayingClub));
        setSelectedClubId((current) => {
          const playing = (response.data ?? []).filter(isPlayingClub);
          return current && playing.some((c) => c.id === current) ? current : '';
        });
      })
      .catch((error) => {
        console.error('Failed to fetch clubs:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCityId]);

  const submitIssue = createEventSubmitIssue({
    eventKind,
    eventCreatorIntent,
    cityId: selectedCityId,
    startTime,
    endTime,
    name: gameName,
    eventHeroes,
  });

  const footerHint =
    submitIssue === 'intent'
      ? t('createEvent.organizerHint')
      : submitIssue === 'kind'
        ? t('createEvent.kindLabel')
        : submitIssue === 'city'
          ? t('createEvent.selectCity')
          : submitIssue === 'dates'
            ? t('createEvent.dateRange')
            : submitIssue === 'name'
              ? t('createEvent.name')
              : submitIssue === 'heroes'
                ? t('createEvent.heroesHint')
                : null;

  const handleCreate = async () => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void handleCreate());
      return;
    }
    if (submitIssue) return;
    if (!eventKind || !eventCreatorIntent) return;
    const url = externalUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      toast.error(t('createEvent.urlInvalid'));
      return;
    }

    setLoading(true);
    try {
      const payload = buildCreateEventPayload({
        eventKind,
        eventCreatorIntent,
        eventHeroes,
        venueText,
        externalUrl,
        sport: selectedSport,
        minLevel: playerLevelRange[0],
        maxLevel: playerLevelRange[1],
        name: gameName,
        description,
        cityId: selectedCityId,
        clubId: selectedClubId,
        startTime,
        endTime,
        priceTotal,
        priceType,
        priceCurrency: priceCurrency ?? resolveUserCurrency(user?.defaultCurrency),
      });
      const gameResponse = await gamesApi.create(payload);
      const gameId = gameResponse.data.id;
      toast.success(t('createEvent.pendingSubmitted'));
      navigate(`/games/${gameId}`);
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <CreateGameHeader onBack={() => navigate('/', { replace: true })} entityType="EVENT" />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-6">
          <EventCreatorIntentChips value={eventCreatorIntent} onChange={setEventCreatorIntent} />
          <EventKindChips value={eventKind} onChange={setEventKind} />
          {showSportSelector ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <CreateFlowSportSelector
                sports={enabledSports}
                value={selectedSport}
                onChange={setSelectedSport}
                defaultSport={defaultSport}
              />
            </div>
          ) : null}
          <PlayerLevelSection
            playerLevelRange={playerLevelRange}
            onPlayerLevelRangeChange={setPlayerLevelRange}
            entityType="EVENT"
          />
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('createEvent.name')}
            </label>
            <input
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder={t('createEvent.namePlaceholder')}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              dir="auto"
            />
            <GameTextAuthoredFieldsHint className="mt-1.5 space-y-0.5" />
          </div>
          <EventHeroUploader heroes={eventHeroes} onChange={setEventHeroes} disabled={loading} />
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('createEvent.description')}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={t('createEvent.descriptionPlaceholder')}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none resize-none"
              dir="auto"
            />
          </div>
          <CityModal
            isOpen={isCityModalOpen}
            onClose={() => setIsCityModalOpen(false)}
            selectedId={selectedCityId}
            onSelect={(id) => {
              setSelectedCityId(id);
              setIsCityModalOpen(false);
            }}
          />
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={18} className="text-gray-500 dark:text-gray-400" />
              <h2 className="section-title">{t('createEvent.selectCity')}</h2>
            </div>
            <button
              type="button"
              onClick={() => setIsCityModalOpen(true)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-start hover:border-primary-500 transition-colors"
            >
              {selectedCity ? selectedCity.name : t('createEvent.selectCity')}
            </button>
          </div>
          <EventVenueFields
            clubs={clubsForSport}
            selectedClubId={selectedClubId}
            venueText={venueText}
            isClubModalOpen={isClubModalOpen}
            cityId={selectedCityId || undefined}
            preferredSport={selectedSport}
            onVenueTextChange={(value) => {
              setVenueText(value);
              if (value.trim()) setSelectedClubId('');
            }}
            onSelectClub={(id) => {
              setSelectedClubId(id);
              setVenueText('');
            }}
            onClearClub={() => setSelectedClubId('')}
            onOpenClubModal={() => setIsClubModalOpen(true)}
            onCloseClubModal={() => setIsClubModalOpen(false)}
            onVenueCityChange={setSelectedCityId}
          />
          <EventDateRangeFields
            startTime={startTime}
            endTime={endTime}
            onStartTimeChange={(date) => {
              setStartTime(date);
              if (date.getTime() >= endTime.getTime()) {
                setEndTime(new Date(date.getTime() + 8 * 60 * 60 * 1000));
              }
            }}
            onEndTimeChange={setEndTime}
          />
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <PriceSection
              embedded
              priceTotal={priceTotal}
              priceType={priceType}
              priceCurrency={priceCurrency}
              defaultCurrency={user?.defaultCurrency as PriceCurrency | undefined}
              onPriceTotalChange={setPriceTotal}
              onPriceTypeChange={setPriceType}
              onPriceCurrencyChange={setPriceCurrency}
            />
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('createEvent.registerUrl')}
            </label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none"
            />
          </div>
        </div>
      </div>
      <CreateGameFooterBar
        label={t('createEvent.create')}
        loading={loading}
        hint={footerHint}
        onCreate={() => void handleCreate()}
      />
    </div>
  );
}
