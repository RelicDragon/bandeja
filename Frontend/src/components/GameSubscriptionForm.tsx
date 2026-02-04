import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { enUS, ru, es, sr, Locale } from 'date-fns/locale';
import { Calendar, X, Star } from 'lucide-react';
import { Button, Card, Select, CalendarComponent, PlayerLevelSection } from '@/components';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { TimeRangeSlider } from './TimeRangeSlider';
import { City, Club, EntityType } from '@/types';
import { citiesApi, clubsApi } from '@/api';
import { favoritesApi } from '@/api/favorites';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from '@/api/gameSubscriptions';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings } from '@/utils/displayPreferences';

interface GameSubscriptionFormProps {
  subscription?: {
    id: string;
    cityId: string;
    clubIds: string[];
    entityTypes: string[];
    dayOfWeek: number[];
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    minLevel?: number;
    maxLevel?: number;
    myGenderOnly: boolean;
  };
  userCityId?: string;
  onSave: (data: CreateSubscriptionDto | UpdateSubscriptionDto) => Promise<void>;
  onCancel: () => void;
}

const ALL_DAYS_OF_WEEK = [
  { value: 0 },
  { value: 1 },
  { value: 2 },
  { value: 3 },
  { value: 4 },
  { value: 5 },
  { value: 6 },
];

const ENTITY_TYPES: EntityType[] = ['GAME', 'TOURNAMENT', 'BAR', 'TRAINING'];

const localeMap: Record<string, Locale> = {
  en: enUS,
  ru: ru,
  es: es,
  sr: sr,
};

export const GameSubscriptionForm = ({
  subscription,
  userCityId,
  onSave,
  onCancel,
}: GameSubscriptionFormProps) => {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const displaySettings = useMemo(() => resolveDisplaySettings(user), [user]);
  const locale = useMemo(() => localeMap[i18n.language as keyof typeof localeMap] || enUS, [i18n.language]);
  
  const daysOfWeek = useMemo(() => {
    const baseDays = displaySettings.weekStart === 1
      ? [...ALL_DAYS_OF_WEEK.slice(1), ALL_DAYS_OF_WEEK[0]]
      : ALL_DAYS_OF_WEEK;
    
    return baseDays.map(day => {
      const date = new Date(2024, 0, 7 + day.value);
      const dayName = format(date, 'EEEE', { locale });
      return {
        value: day.value,
        label: dayName.charAt(0).toUpperCase() + dayName.slice(1),
      };
    });
  }, [displaySettings.weekStart, locale]);
  const [cities, setCities] = useState<City[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [favoriteClubIds, setFavoriteClubIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const effectiveUserCityId = userCityId || user?.currentCity?.id || user?.currentCityId;
  const [cityId, setCityId] = useState(subscription?.cityId || effectiveUserCityId || '');
  const [clubIds, setClubIds] = useState<string[]>(subscription?.clubIds || []);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>(
    (subscription?.entityTypes as EntityType[]) || []
  );
  const [dayOfWeek, setDayOfWeek] = useState<number[]>(subscription?.dayOfWeek || []);
  const [startDate, setStartDate] = useState(
    subscription?.startDate ? subscription.startDate.split('T')[0] : ''
  );
  const [endDate, setEndDate] = useState(
    subscription?.endDate ? subscription.endDate.split('T')[0] : ''
  );
  const [playerLevelRange, setPlayerLevelRange] = useState<[number, number]>(() => {
    const min = subscription?.minLevel ?? 1.0;
    const max = subscription?.maxLevel ?? 7.0;
    return [min, max];
  });
  const [myGenderOnly, setMyGenderOnly] = useState(subscription?.myGenderOnly || false);
  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);
  const [timeRange, setTimeRange] = useState<[string, string]>([
    subscription?.startTime || '00:00',
    subscription?.endTime || '24:00',
  ]);
  
  const startDateObj = useMemo(() => startDate ? new Date(startDate) : new Date(), [startDate]);
  const endDateObj = useMemo(() => endDate ? new Date(endDate) : new Date(), [endDate]);

  const dateHint = useMemo(() => {
    if (!startDate && !endDate) {
      return t('gameSubscriptions.dateHintAny');
    }
    if (startDate && !endDate) {
      return `${t('gameSubscriptions.dateHintFrom')} ${format(new Date(startDate), 'PPP', { locale })}`;
    }
    if (!startDate && endDate) {
      return `${t('gameSubscriptions.dateHintBefore')} ${format(new Date(endDate), 'PPP', { locale })}`;
    }
    if (startDate && endDate) {
      const startFormatted = format(new Date(startDate), 'PPP', { locale });
      const endFormatted = format(new Date(endDate), 'PPP', { locale });
      return `${t('gameSubscriptions.dateHintBetween')} ${startFormatted} - ${endFormatted}`;
    }
    return '';
  }, [startDate, endDate, locale, t]);

  const sortedClubs = useMemo(() => {
    return [...clubs].sort((a, b) => {
      const aIsFavorite = favoriteClubIds.includes(a.id);
      const bIsFavorite = favoriteClubIds.includes(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [clubs, favoriteClubIds]);

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
    const fetchFavoriteClubs = async () => {
      try {
        const ids = await favoritesApi.getUserFavoriteClubIds();
        setFavoriteClubIds(ids);
      } catch (error) {
        console.error('Failed to fetch favorite clubs:', error);
      }
    };
    fetchFavoriteClubs();
  }, []);

  useEffect(() => {
    const fetchClubs = async () => {
      if (!cityId) {
        setClubs([]);
        return;
      }
      try {
        const response = await clubsApi.getByCityId(cityId);
        setClubs(response.data);
      } catch (error) {
        console.error('Failed to fetch clubs:', error);
      }
    };
    fetchClubs();
  }, [cityId]);

  useEffect(() => {
    if (!subscription && effectiveUserCityId && !cityId) {
      setCityId(effectiveUserCityId);
    }
  }, [subscription, effectiveUserCityId, cityId]);

  const toggleClub = (clubId: string) => {
    setClubIds(prev =>
      prev.includes(clubId) ? prev.filter(id => id !== clubId) : [...prev, clubId]
    );
  };

  const toggleEntityType = (entityType: EntityType) => {
    setEntityTypes(prev =>
      prev.includes(entityType)
        ? prev.filter(type => type !== entityType)
        : [...prev, entityType]
    );
  };

  const toggleDayOfWeek = (day: number) => {
    setDayOfWeek(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!cityId) {
      return;
    }

    if (endDate && startDate && new Date(endDate) < new Date(startDate)) {
      return;
    }

    setLoading(true);
    try {
      const isUpdate = !!subscription;
      const isFullLevelRange = playerLevelRange[0] === 1.0 && playerLevelRange[1] === 7.0;
      await onSave({
        cityId,
        clubIds: isUpdate ? clubIds : (clubIds.length > 0 ? clubIds : undefined),
        entityTypes: isUpdate ? entityTypes : (entityTypes.length > 0 ? entityTypes : undefined),
        dayOfWeek: isUpdate ? dayOfWeek : (dayOfWeek.length > 0 ? dayOfWeek : undefined),
        startDate: startDate ? startDate : (isUpdate ? null : undefined),
        endDate: endDate ? endDate : (isUpdate ? null : undefined),
        startTime: timeRange[0] !== '00:00' ? timeRange[0] : (isUpdate ? null : undefined),
        endTime: timeRange[1] !== '24:00' ? timeRange[1] : (isUpdate ? null : undefined),
        minLevel: isFullLevelRange ? undefined : playerLevelRange[0],
        maxLevel: isFullLevelRange ? undefined : playerLevelRange[1],
        myGenderOnly,
      } as CreateSubscriptionDto | UpdateSubscriptionDto);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6 md:p-8 bg-white dark:bg-slate-900/50 backdrop-blur-sm border-0 shadow-xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
            {t('gameSubscriptions.city')}
          </label>
          <Select
            options={cities.map(city => ({
              value: city.id,
              label: city.name,
            }))}
            value={cityId}
            onChange={setCityId}
            placeholder={t('gameSubscriptions.city')}
          />
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
            {t('gameSubscriptions.clubs')}
          </label>
          <div className="space-y-1.5 max-h-56 overflow-y-auto bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-inner">
            {sortedClubs.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                {cityId ? t('gameSubscriptions.noClubs') : t('gameSubscriptions.selectCityFirst')}
              </p>
            ) : (
              sortedClubs.map(club => {
                const isFavorite = favoriteClubIds.includes(club.id);
                return (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => toggleClub(club.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 text-left ${
                      clubIds.includes(club.id)
                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 ring-2 ring-primary-400 ring-offset-1 scale-[1.02]'
                        : 'bg-white dark:bg-slate-700/50 border-2 border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="text-sm font-medium flex-1">
                      {club.name}
                    </span>
                    {isFavorite && (
                      <Star
                        size={16}
                        className={`flex-shrink-0 ${
                          clubIds.includes(club.id)
                            ? 'text-yellow-300 fill-yellow-300'
                            : 'text-yellow-500 fill-yellow-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>
          {clubIds.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">
              {t('gameSubscriptions.allClubs')}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
            {t('gameSubscriptions.entityTypes')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {ENTITY_TYPES.map(type => (
              <button
                key={type}
                type="button"
                onClick={() => toggleEntityType(type)}
                className={`p-3 rounded-xl transition-all duration-200 border-2 ${
                  entityTypes.includes(type)
                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 ring-2 ring-primary-400 ring-offset-1 scale-[1.02]'
                    : 'bg-white dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="text-sm font-medium">
                  {t(`games.entityTypes.${type}`)}
                </span>
              </button>
            ))}
          </div>
          {entityTypes.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">
              {t('gameSubscriptions.allEntityTypes')}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
            {t('gameSubscriptions.daysOfWeek')}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {daysOfWeek.map(day => (
              <button
                key={day.value}
                type="button"
                onClick={() => toggleDayOfWeek(day.value)}
                className={`p-3 rounded-xl transition-all duration-200 border-2 ${
                  dayOfWeek.includes(day.value)
                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 ring-2 ring-primary-400 ring-offset-1 scale-[1.02]'
                    : 'bg-white dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                }`}
              >
                <span className="text-sm font-medium">
                  {day.label}
                </span>
              </button>
            ))}
          </div>
          {dayOfWeek.length === 0 && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">
              {t('gameSubscriptions.allDays')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('gameSubscriptions.startDate')}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowStartCalendar(true)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-white transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-between gap-2"
              >
                <span className={startDate ? '' : 'text-slate-500 dark:text-slate-400'}>
                  {startDate ? format(new Date(startDate), 'PPP', { locale }) : t('gameSubscriptions.startDate')}
                </span>
                <div className="flex items-center gap-2">
                  {startDate && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setStartDate('');
                      }}
                      className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <X size={16} className="text-slate-500 dark:text-slate-400" />
                    </div>
                  )}
                  <Calendar size={18} className="text-slate-500 dark:text-slate-400" />
                </div>
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
              {t('gameSubscriptions.endDate')}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEndCalendar(true)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-white transition-all duration-200 shadow-sm hover:shadow-md flex items-center justify-between gap-2"
              >
                <span className={endDate ? '' : 'text-slate-500 dark:text-slate-400'}>
                  {endDate ? format(new Date(endDate), 'PPP', { locale }) : t('gameSubscriptions.endDate')}
                </span>
                <div className="flex items-center gap-2">
                  {endDate && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        setEndDate('');
                      }}
                      className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <X size={16} className="text-slate-500 dark:text-slate-400" />
                    </div>
                  )}
                  <Calendar size={18} className="text-slate-500 dark:text-slate-400" />
                </div>
              </button>
            </div>
          </div>
          {dateHint && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">
              {dateHint}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
            {t('gameSubscriptions.timeRange')}
          </label>
          <TimeRangeSlider
            value={timeRange}
            onChange={setTimeRange}
            hour12={displaySettings.hour12}
          />
          {(timeRange[0] !== '00:00' || timeRange[1] !== '24:00') && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 ml-1">
              {t('gameSubscriptions.timeRangeHint')}
            </p>
          )}
        </div>

        {showStartCalendar && (
          <Dialog open={showStartCalendar} onClose={() => setShowStartCalendar(false)} modalId="game-subscription-calendar-start">
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('gameSubscriptions.startDate')}</DialogTitle>
              </DialogHeader>
              <CalendarComponent
                selectedDate={startDateObj}
                onDateSelect={(date: Date) => {
                  const newStartDate = format(date, 'yyyy-MM-dd');
                  setStartDate(newStartDate);
                  if (endDate && new Date(newStartDate) > new Date(endDate)) {
                    setEndDate('');
                  }
                  setShowStartCalendar(false);
                }}
              />
            </DialogContent>
          </Dialog>
        )}

        {showEndCalendar && (
          <Dialog open={showEndCalendar} onClose={() => setShowEndCalendar(false)} modalId="game-subscription-calendar-end">
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('gameSubscriptions.endDate')}</DialogTitle>
              </DialogHeader>
              <CalendarComponent
                selectedDate={endDateObj}
                onDateSelect={(date: Date) => {
                  setEndDate(format(date, 'yyyy-MM-dd'));
                  setShowEndCalendar(false);
                }}
                minDate={startDate ? new Date(startDate) : undefined}
              />
            </DialogContent>
          </Dialog>
        )}

        <PlayerLevelSection
          playerLevelRange={playerLevelRange}
          onPlayerLevelRangeChange={setPlayerLevelRange}
          entityType="GAME"
        />

        <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setMyGenderOnly(!myGenderOnly)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 border-2 ${
              myGenderOnly
                ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-xl shadow-primary-500/40 ring-2 ring-primary-400 ring-offset-1 scale-[1.02]'
                : 'bg-white dark:bg-slate-700/50 border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <span className="text-sm font-medium">
              {t('gameSubscriptions.myGenderOnly')}
            </span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            className="flex-1 sm:flex-none sm:min-w-[120px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            disabled={loading}
          >
            {t('common.cancel')}
          </Button>
          {!cityId && (
            <p className="text-xs text-amber-600 dark:text-amber-400 text-center sm:text-left flex-1 flex items-center">
              {t('gameSubscriptions.cityRequired')}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            className="flex-1 sm:flex-none sm:min-w-[120px] transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
            disabled={loading || !cityId}
          >
            {loading ? t('common.loading') : t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
};

