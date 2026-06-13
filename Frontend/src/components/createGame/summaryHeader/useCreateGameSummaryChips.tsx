import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  MapPin,
  CalendarClock,
  CalendarCheck,
  LayoutGrid,
  Lock,
  Tag,
  Banknote,
  Ban,
  Trophy,
} from 'lucide-react';
import type { Club, Court, EntityType, GenderTeam, PriceCurrency, PriceType } from '@/types';
import type { Sport } from '@shared/sport';
import type { CreateTemplateId } from '@/sport/createFlow';
import { getSportConfig } from '@/sport/sportRegistry';
import { formatDate } from '@/utils/dateFormat';
import { getCurrencySymbol, resolveUserCurrency } from '@/utils/currency';
import { resolveCourtNameParts } from '@/utils/courtDisplayName';
import {
  gameFormatFixedTeamsToggleVisible,
  gameFormatGenderVisible,
} from '@/components/gameFormat/gameFormatTeamsVisibility';
import type { SummaryChipItem } from './CreateGameSummaryBar';
import { SummaryGenderIcon } from './SummaryGenderIcon';
import { SummarySportIcon } from './SummarySportIcon';

interface UseCreateGameSummaryChipsArgs {
  past: Record<string, boolean>;
  entityType: EntityType;
  showSportChip: boolean;
  selectedSport: Sport;
  maxParticipants: number;
  playersPerMatch: number;
  hasFixedTeams: boolean;
  genderTeams: GenderTeam;
  showTemplatePicker: boolean;
  activeTemplateId: CreateTemplateId | null;
  isCustomFormat: boolean;
  clubs: Club[];
  selectedClub: string;
  courts: Court[];
  selectedCourt: string;
  selectedCourtIds?: string[];
  selectedDate: Date;
  selectedTime: string;
  duration: number;
  getDurationLabel: (duration: number) => string;
  playerLevelRange: [number, number];
  isPublic: boolean;
  isRatingGame: boolean;
  gameName: string;
  priceType: PriceType;
  priceTotal: number | undefined;
  priceCurrency: PriceCurrency | undefined;
  defaultCurrency: PriceCurrency | undefined;
  excludeKeys?: string[];
  locationTimeMode?: 'timeSlots' | 'bookings';
  willBookOnCreate?: boolean;
  selectedBookingCount?: number;
  derivedBookingWindow?: string | null;
}

const ICON_SIZE = 12;

export function useCreateGameSummaryChips({
  past,
  entityType,
  showSportChip,
  selectedSport,
  maxParticipants,
  playersPerMatch,
  hasFixedTeams,
  genderTeams,
  showTemplatePicker,
  activeTemplateId,
  isCustomFormat,
  clubs,
  selectedClub,
  courts,
  selectedCourt,
  selectedCourtIds = [],
  selectedDate,
  selectedTime,
  duration,
  getDurationLabel,
  playerLevelRange,
  isPublic,
  isRatingGame,
  gameName,
  priceType,
  priceTotal,
  priceCurrency,
  defaultCurrency,
  excludeKeys = [],
  locationTimeMode = 'timeSlots',
  willBookOnCreate = false,
  selectedBookingCount = 0,
  derivedBookingWindow = null,
}: UseCreateGameSummaryChipsArgs): SummaryChipItem[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const chips: SummaryChipItem[] = [];
    const isMatchEntity = entityType === 'GAME' || entityType === 'LEAGUE';

    if (past.sport && showSportChip) {
      const config = getSportConfig(selectedSport);
      chips.push({
        key: 'sport',
        icon: <SummarySportIcon sport={selectedSport} />,
        label: t(config.labelKey),
      });
    }

    const sportConfig = getSportConfig(selectedSport);
    const showMatchFormat =
      isMatchEntity &&
      sportConfig.allowedPlayerCountsPerMatch.length > 1 &&
      playersPerMatch !== sportConfig.defaultPlayersPerMatch;
    const formatSuffix = showMatchFormat ? ` · ${playersPerMatch === 2 ? '1v1' : '2v2'}` : '';
    const showFixedTeams =
      hasFixedTeams &&
      playersPerMatch === 4 &&
      gameFormatFixedTeamsToggleVisible(entityType, maxParticipants);
    const fixedTeamsSuffix = showFixedTeams ? ` · ${t('games.fixedTeams')}` : '';

    if (past.setup) {
      chips.push({
        key: 'setup',
        icon: <Users size={ICON_SIZE} />,
        label: `${maxParticipants}${formatSuffix}${fixedTeamsSuffix}`,
      });
    }

    if (past.format && showTemplatePicker && (activeTemplateId || isCustomFormat)) {
      chips.push({
        key: 'format',
        icon: <LayoutGrid size={ICON_SIZE} />,
        label: activeTemplateId
          ? t(`createGame.templates.${activeTemplateId}.title`)
          : t('createGame.intent.advanced.title'),
      });
    }

    if (past.format && gameFormatGenderVisible(entityType) && genderTeams !== 'ANY') {
      chips.push({
        key: 'gender',
        scrollKey: 'format',
        icon: <SummaryGenderIcon genderTeams={genderTeams} />,
      });
    }

    const ratingSectionPast = showTemplatePicker ? past.format : past.settings;
    if (
      ratingSectionPast &&
      !isRatingGame &&
      entityType !== 'BAR' &&
      entityType !== 'TRAINING'
    ) {
      chips.push({
        key: 'non-rating',
        scrollKey: showTemplatePicker ? 'format' : 'settings',
        icon: <Ban size={ICON_SIZE} />,
        label: t('games.noRating'),
      });
    }

    if (past.location && selectedClub) {
      const club = clubs.find((c) => c.id === selectedClub);
      if (club) {
        chips.push({
          key: 'location',
          icon: <MapPin size={ICON_SIZE} />,
          label: club.name,
        });
      }
    }

    if (past.time) {
      if (locationTimeMode === 'bookings' && selectedBookingCount > 0) {
        const parts = [
          t('createGame.locationTime.summaryFromBookings', { count: selectedBookingCount }),
        ];
        if (derivedBookingWindow) parts.push(derivedBookingWindow);
        chips.push({
          key: 'time',
          icon: <CalendarCheck size={ICON_SIZE} />,
          label: parts.join(' · '),
        });
      } else {
        const parts: string[] = [formatDate(selectedDate, 'EEE d MMM')];
        if (selectedTime) {
          parts.push(selectedTime);
          if (duration) parts.push(getDurationLabel(duration));
        }
        if (selectedCourt !== 'notBooked' || selectedCourtIds.length > 0) {
          const courtIds = selectedCourtIds.length > 0
            ? selectedCourtIds
            : selectedCourt !== 'notBooked'
              ? [selectedCourt]
              : [];
          const courtLabels = courtIds
            .map((id) => courts.find((c) => c.id === id))
            .filter((court): court is Court => court != null)
            .map((court) => resolveCourtNameParts(court.name, court.integrationCourtName).name);
          if (courtLabels.length === 1) {
            parts.push(courtLabels[0]);
          } else if (courtLabels.length > 1) {
            parts.push(`${courtLabels[0]} +${courtLabels.length - 1}`);
          }
        }
        chips.push({
          key: 'time',
          icon: willBookOnCreate ? <CalendarCheck size={ICON_SIZE} /> : <CalendarClock size={ICON_SIZE} />,
          label: parts.join(' · '),
        });
      }
    }

    if (
      past.participants &&
      entityType !== 'BAR' &&
      entityType !== 'TRAINING'
    ) {
      const [minLevel, maxLevel] = playerLevelRange;
      chips.push({
        key: 'participants',
        icon: <Trophy size={ICON_SIZE} />,
        label: `${minLevel.toFixed(1)}–${maxLevel.toFixed(1)}`,
      });
    }

    if (past.settings && !isPublic) {
      chips.push({
        key: 'private',
        scrollKey: 'settings',
        icon: <Lock size={ICON_SIZE} />,
        label: t('games.private'),
      });
    }

    if (past.name && gameName.trim()) {
      chips.push({
        key: 'name',
        icon: <Tag size={ICON_SIZE} />,
        label: gameName.trim(),
      });
    }

    if (past.price && priceType !== 'NOT_KNOWN') {
      const currency = priceCurrency ?? resolveUserCurrency(defaultCurrency);
      const label =
        priceType === 'FREE'
          ? t('createGame.priceTypeFree')
          : priceTotal != null
            ? `${priceTotal} ${getCurrencySymbol(currency)}`
            : undefined;
      if (label) {
        chips.push({
          key: 'price',
          icon: <Banknote size={ICON_SIZE} />,
          label,
        });
      }
    }

    return chips.filter((chip) => !excludeKeys.includes(chip.key));
  }, [
    past,
    entityType,
    showSportChip,
    selectedSport,
    maxParticipants,
    playersPerMatch,
    hasFixedTeams,
    genderTeams,
    showTemplatePicker,
    activeTemplateId,
    isCustomFormat,
    clubs,
    selectedClub,
    courts,
    selectedCourt,
    selectedCourtIds,
    selectedDate,
    selectedTime,
    duration,
    getDurationLabel,
    playerLevelRange,
    isPublic,
    isRatingGame,
    gameName,
    priceType,
    priceTotal,
    priceCurrency,
    defaultCurrency,
    excludeKeys,
    locationTimeMode,
    willBookOnCreate,
    selectedBookingCount,
    derivedBookingWindow,
    t,
  ]);
}
