import { GameType, WinnerOfMatch, WinnerOfGame, MatchGenerationType } from '@/types';
import gameTypeTemplatesData from '@/config/gameTypeTemplates.json';

export interface GameTypeTemplate {
  winnerOfMatch: WinnerOfMatch;
  winnerOfGame: WinnerOfGame;
  matchGenerationType: MatchGenerationType;
  prohibitMatchesEditing?: boolean;
  pointsPerWin?: number;
  pointsPerLoose?: number;
  pointsPerTie?: number;
}

type GameTypeTemplates = Record<GameType, GameTypeTemplate>;

const gameTypeTemplates: GameTypeTemplates = gameTypeTemplatesData as GameTypeTemplates;

export const getGameTypeTemplate = (gameType: GameType): GameTypeTemplate => {
  return gameTypeTemplates[gameType];
};

export const applyGameTypeTemplate = (gameType: GameType) => {
  return getGameTypeTemplate(gameType);
};

