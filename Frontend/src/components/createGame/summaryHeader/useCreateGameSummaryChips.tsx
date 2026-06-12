import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  MapPin,
  CalendarClock,
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
import 'bootstrap-icons/font/bootstrap-icons.css';

function SummaryGenderIcon({ genderTeams }: { genderTeams: GenderTeam }) {
  const className = 'text-gray-500 dark:text-gray-400';
  if (genderTeams === 'MIX_PAIRS') {
    return (
      <span className={`inline-flex items-center gap-0.5 ${className}`}>
        <i className="bi bi-gender-male text-[10px]" aria-hidden />
        <i className="bi bi-gender-female -ml-0.5 text-[10px]" aria-hidden />
      </span>
    );
  }
  if (genderTeams === 'MEN' || genderTeams === 'WOMEN') {
    return (
      <i
        className={`bi ${genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-xs ${className}`}
        aria-hidden
      />
    );
  }
  return null;
}

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
}: UseCreateGameSummaryChipsArgs): SummaryChipItem[] {
  const { t } = useTranslation();

  return useMemo(() => {
    const chips: SummaryChipItem[] = [];
    const isMatchEntity = entityType === 'GAME' || entityType === 'LEAGUE';

    if (past.sport && showSportChip) {
      const config = getSportConfig(selectedSport);
      chips.push({
        key: 'sport',
        icon: <span className="text-sm leading-none">{config.icon}</span>,
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
      const parts: string[] = [formatDate(selectedDate, 'EEE d MMM')];
      if (selectedTime) {
        parts.push(selectedTime);
        if (duration) parts.push(getDurationLabel(duration));
      }
      if (selectedCourt !== 'notBooked') {
        const court = courts.find((c) => c.id === selectedCourt);
        if (court) {
          parts.push(resolveCourtNameParts(court.name, court.integrationCourtName).name);
        }
      }
      chips.push({
        key: 'time',
        icon: <CalendarClock size={ICON_SIZE} />,
        label: parts.join(' · '),
      });
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

    return chips;
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
    t,
  ]);
}
