import { EntityType, Sport } from '@prisma/client';

export const TRAINING_MAX_PARTICIPANTS_MIN = 1;
export const TRAINING_MAX_PARTICIPANTS_MAX = 24;
import { isPresetLegal } from '../../shared/isPresetLegal';
import { ApiError } from '../ApiError';
import { getSportConfig, resolveSport } from '../../sport/sportRegistry';
import { isSportCreatable } from '../multisportFlags';
import {
  GAME_TYPE_TO_ROTATION,
  MATCH_GENERATION_TO_ROTATION,
  gameTypeMatchGenerationMismatch,
  isRotationFormatAllowed,
} from '../../sport/rotationFormats';
import type { GameTypeStr } from './gameFormat';

export type GameSportValidationInput = {
  sport?: unknown;
  entityType?: EntityType | string;
  gameType?: string;
  matchGenerationType?: string;
  maxParticipants?: number;
  minParticipants?: number;
  playersPerMatch?: number;
  scoringPreset?: string | null;
};

export function validateMaxParticipants(n: number, userCap: number): void {
  if (!Number.isFinite(n) || n < 2) {
    throw new ApiError(400, 'maxParticipants must be at least 2');
  }
  if (n === 3) {
    throw new ApiError(400, 'maxParticipants cannot be 3');
  }
  if (n > userCap) {
    const cap = Number.isFinite(userCap) ? String(Math.floor(userCap)) : '';
    throw new ApiError(
      403,
      cap ? `You cannot set more than ${cap} participants` : 'You cannot set that many participants',
    );
  }
}

export function validateTrainingMaxParticipants(n: number): void {
  if (
    !Number.isFinite(n) ||
    Math.floor(n) !== n ||
    n < TRAINING_MAX_PARTICIPANTS_MIN ||
    n > TRAINING_MAX_PARTICIPANTS_MAX
  ) {
    throw new ApiError(
      400,
      `maxParticipants for training must be between ${TRAINING_MAX_PARTICIPANTS_MIN} and ${TRAINING_MAX_PARTICIPANTS_MAX}`,
    );
  }
}

export function validateGameForSport(input: GameSportValidationInput): Sport {
  const sport = resolveSport(input.sport);
  const config = getSportConfig(sport);

  if (!config.implemented || !isSportCreatable(sport)) {
    throw new ApiError(400, `Sport ${sport} is not available yet`);
  }

  const entityType = input.entityType ?? EntityType.GAME;
  if (entityType === EntityType.BAR || entityType === EntityType.TRAINING) {
    const maxParticipants = input.maxParticipants;
    const minParticipants = input.minParticipants;
    if (minParticipants != null && maxParticipants != null && minParticipants > maxParticipants) {
      throw new ApiError(400, 'minParticipants cannot exceed maxParticipants');
    }
    if (entityType === EntityType.TRAINING && maxParticipants != null) {
      validateTrainingMaxParticipants(maxParticipants);
    }
    return sport;
  }

  const maxParticipants = input.maxParticipants;
  const minParticipants = input.minParticipants;
  if (minParticipants != null && maxParticipants != null && minParticipants > maxParticipants) {
    throw new ApiError(400, 'minParticipants cannot exceed maxParticipants');
  }

  const playersPerMatch = input.playersPerMatch;
  if (playersPerMatch != null) {
    const allowed = config.allowedPlayerCountsPerMatch;
    if (!allowed.includes(playersPerMatch)) {
      throw new ApiError(
        400,
        `playersPerMatch ${playersPerMatch} is not allowed for ${sport}. Allowed: ${allowed.join(', ')}`,
      );
    }
  }

  if (
    entityType === EntityType.GAME &&
    maxParticipants != null &&
    playersPerMatch != null
  ) {
    const expectedRoster = playersPerMatch === 2 ? 2 : 4;
    if (maxParticipants !== expectedRoster) {
      throw new ApiError(400, 'Game roster size must match match format (2 for 1v1, 4 for 2v2)');
    }
  }

  const gameType = input.gameType;
  if (gameType && !config.allowedGameTypes.includes(gameType as GameTypeStr)) {
    throw new ApiError(400, `gameType ${gameType} is not allowed for ${sport}`);
  }

  const rot = config.rotationFormats;
  const ppm = playersPerMatch;

  const matchGenerationType = input.matchGenerationType;
  if (matchGenerationType) {
    const rotKey = MATCH_GENERATION_TO_ROTATION[matchGenerationType];
    if (rotKey && !isRotationFormatAllowed(rot, rotKey, ppm)) {
      throw new ApiError(
        400,
        `matchGenerationType ${matchGenerationType} is not allowed for ${sport}`,
      );
    }
  }

  if (gameType) {
    const rotKey = GAME_TYPE_TO_ROTATION[gameType as GameTypeStr];
    if (rotKey && !isRotationFormatAllowed(rot, rotKey, ppm)) {
      throw new ApiError(400, `gameType ${gameType} is not allowed for ${sport}`);
    }
  }

  const pairingErr = gameTypeMatchGenerationMismatch(gameType, matchGenerationType);
  if (pairingErr) {
    throw new ApiError(400, pairingErr);
  }

  const scoringPreset = input.scoringPreset;
  if (scoringPreset != null && scoringPreset !== '') {
    if (
      !isPresetLegal({
        sport,
        preset: scoringPreset,
        allowedScoringPresets: config.allowedScoringPresets,
        gameType,
        matchGenerationType,
      })
    ) {
      throw new ApiError(400, `scoringPreset ${scoringPreset} is not allowed for ${sport}`);
    }
  }

  return sport;
}
