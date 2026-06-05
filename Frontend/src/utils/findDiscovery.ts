import type { TFunction } from 'i18next';
import type { Game } from '@/types';
import {
  CREATE_TEMPLATES,
  type CreateTemplate,
  inferPresetTier,
  isCasualCreateFlowEnabled,
  presetTierMap,
} from '@/sport/createFlow';
import { getSportConfig } from '@/sport/sportRegistry';
import type { Sport } from '@shared/sport';
import { parseGameSport } from '@/utils/gameSport';
import { playersPerMatchOf } from '@/utils/matchFormat';
import { listEnabledSports } from '@/utils/profileSports';
import type { BasicUser, User } from '@/types';

export type FindTierFilter = 'social' | 'match';

export function isFindDiscoveryEnabled(user: User | BasicUser | null | undefined): boolean {
  const enabled = listEnabledSports(user);
  return isCasualCreateFlowEnabled('GAME', enabled);
}

export function resolveGameDiscoveryTier(game: Game): FindTierFilter | null {
  if (game.entityType !== 'GAME') return null;
  const sport = parseGameSport(game.sport);
  const preset = game.scoringPreset;
  if (!preset) return null;

  const tiers = presetTierMap(getSportConfig(sport).presetMeta);
  const tier = tiers.get(preset) ?? inferPresetTier(preset);
  if (tier === 'social') return 'social';
  if (tier === 'match') return 'match';

  if (!game.affectsRating) return 'social';
  if (game.gameType !== 'CLASSIC') return 'social';
  return 'match';
}

export function matchCreateTemplateForGame(game: Game): CreateTemplate | null {
  const sport = parseGameSport(game.sport);
  const ppm = playersPerMatchOf(game);
  for (const id of getSportConfig(sport).createTemplates) {
    const tpl = CREATE_TEMPLATES[id];
    if (tpl.scoringPreset !== game.scoringPreset) continue;
    if (tpl.gameType !== game.gameType) continue;
    if (tpl.matchGenerationType !== (game.matchGenerationType ?? tpl.matchGenerationType)) continue;
    if (tpl.playersPerMatch !== ppm) continue;
    if (tpl.affectsRating !== game.affectsRating) continue;
    return tpl;
  }
  return null;
}

function presetLabelKey(sport: Sport, preset: string): string | null {
  const row = getSportConfig(sport).presetMeta.find((m) => m.preset === preset);
  return row?.labelKey ?? null;
}

export function passesFindTierFilter(game: Game, filterTier: FindTierFilter | undefined): boolean {
  if (!filterTier) return true;
  const tier = resolveGameDiscoveryTier(game);
  if (!tier) return false;
  return tier === filterTier;
}

export function passesFindNoRatingFilter(game: Game, filterNoRating: boolean | undefined): boolean {
  if (!filterNoRating) return true;
  return game.affectsRating === false;
}

export type GameDiscoveryBadgeParts = {
  tier: FindTierFilter;
  tierLabel: string;
  detailLabel?: string;
};

export function buildGameDiscoveryBadgeParts(game: Game, t: TFunction): GameDiscoveryBadgeParts | null {
  const tier = resolveGameDiscoveryTier(game);
  if (!tier) return null;

  const sport = parseGameSport(game.sport);
  const tierLabel = t(`createGame.intent.${tier}.title`);
  const preset = game.scoringPreset;
  const presetLabel =
    preset && presetLabelKey(sport, preset) ? t(presetLabelKey(sport, preset)!) : '';

  let detailLabel: string | undefined;
  if (tier === 'social') {
    if (game.gameType && game.gameType !== 'CLASSIC') {
      detailLabel = t(`games.gameTypes.${game.gameType}`);
    } else if (presetLabel) {
      detailLabel = presetLabel;
    }
  } else if (presetLabel) {
    detailLabel = presetLabel;
  } else if (game.gameType) {
    detailLabel = t(`games.gameTypes.${game.gameType}`);
  }

  return { tier, tierLabel, detailLabel };
}

export function buildGameDiscoveryBadge(game: Game, t: TFunction): string | null {
  const parts = buildGameDiscoveryBadgeParts(game, t);
  if (!parts) return null;
  const joined = [parts.tierLabel, parts.detailLabel].filter(Boolean);
  return joined.join(' · ');
}
