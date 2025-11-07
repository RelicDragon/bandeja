import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { ParticipantRole } from '@prisma/client';

interface Op {
  id: string;
  base_version: number;
  op: 'replace' | 'add' | 'remove';
  path: string;
  value?: any;
  actor: { userId: string };
}

interface ConflictOp {
  opId: string;
  reason: string;
  serverPatch: Array<{ op: string; path: string; value: any }>;
  clientPatch: Array<{ op: string; path: string; value: any }>;
}

interface BatchOpsResult {
  applied: string[];
  headVersion: number;
  serverTime: string;
  conflicts: ConflictOp[];
}

interface ResultsMeta {
  version: number;
  lastBatchTime?: string;
  lastBatchId?: string;
  processedOps?: string[];
}

const processedOps = new Map<string, BatchOpsResult>();

function getValue(obj: any, path: string[]): any {
  let current = obj;
  for (const part of path) {
    if (current === undefined || current === null) return undefined;
    if (Array.isArray(current) && !isNaN(parseInt(part))) {
      current = current[parseInt(part)];
    } else {
      current = current[part];
    }
  }
  return current;
}

function setValue(obj: any, path: string[], value: any): any {
  const [head, ...tail] = path;
  if (tail.length === 0) {
    return { ...obj, [head]: value };
  }
  if (Array.isArray(obj[head])) {
    const arr = [...obj[head]];
    const index = parseInt(head);
    if (isNaN(index)) {
      arr.push(setValue({}, tail, value));
    } else {
      arr[index] = setValue(arr[index] || {}, tail, value);
    }
    return { ...obj, [head]: arr };
  }
  return { ...obj, [head]: setValue(obj[head] || {}, tail, value) };
}

function applyOp(state: any, op: Op): { success: boolean; newState?: any; conflict?: ConflictOp } {
  const pathParts = op.path.split('/').filter(Boolean);

  try {
    if (op.op === 'replace') {
      return { success: true, newState: setValue(state, pathParts, op.value) };
    } else if (op.op === 'add') {
      const parentPath = pathParts.slice(0, -1);
      const parent = parentPath.length > 0 ? getValue(state, parentPath) : state;
      const key = pathParts[pathParts.length - 1];
      
      if (Array.isArray(parent?.[key])) {
        const arr = [...parent[key]];
        arr.push(op.value);
        return { success: true, newState: setValue(state, pathParts, arr) };
      } else if (Array.isArray(parent)) {
        const arr = [...parent];
        arr.push(op.value);
        return { success: true, newState: setValue(state, parentPath, arr) };
      } else if (pathParts.length === 1 && key === 'rounds' && Array.isArray(state.rounds)) {
        const arr = [...state.rounds];
        arr.push(op.value);
        return { success: true, newState: { ...state, rounds: arr } };
      }
      return { success: false };
    } else if (op.op === 'remove') {
      const parentPath = pathParts.slice(0, -1);
      const parent = parentPath.length > 0 ? getValue(state, parentPath) : state;
      const key = pathParts[pathParts.length - 1];
      
      if (Array.isArray(parent)) {
        const index = parseInt(key);
        if (!isNaN(index) && index >= 0 && index < parent.length) {
          const arr = [...parent];
          arr.splice(index, 1);
          return { success: true, newState: setValue(state, parentPath, arr) };
        }
      } else if (parent && typeof parent === 'object') {
        const next = { ...parent };
        delete next[key];
        return { success: true, newState: setValue(state, parentPath, next) };
      }
      return { success: false };
    }
  } catch (error) {
    console.error('Error in applyOp:', error);
    return { success: false };
  }

  return { success: false };
}

function threeWayMerge(
  base: any,
  server: any,
  client: Op
): { success: boolean; merged?: any; conflict?: ConflictOp } {
  const clientResult = applyOp(base, client);
  if (!clientResult.success) {
    return { success: false };
  }

  const serverPath = client.path.split('/').filter(Boolean);
  const serverValue = getValue(server, serverPath);
  const baseValue = getValue(base, serverPath);
  const clientValue = clientResult.newState ? getValue(clientResult.newState, serverPath) : undefined;

  if (JSON.stringify(serverValue) === JSON.stringify(baseValue)) {
    return { success: true, merged: clientResult.newState };
  }

  if (JSON.stringify(serverValue) === JSON.stringify(clientValue)) {
    return { success: true, merged: server };
  }

  return {
    success: false,
    conflict: {
      opId: client.id,
      reason: 'VersionMismatch',
      serverPatch: [{ op: 'replace', path: client.path, value: serverValue }],
      clientPatch: [{ op: client.op, path: client.path, value: client.value }],
    },
  };
}

function parsePath(path: string): {
  roundIndex?: number;
  roundId?: string;
  matchIndex?: number;
  matchId?: string;
  setIndex?: number;
  team?: 'teamA' | 'teamB';
  action?: 'score' | 'players' | 'sets';
} {
  const parts = path.split('/').filter(Boolean);
  const result: any = {};

  if (parts[0] === 'rounds') {
    const roundPart = parts[1];
    if (!isNaN(parseInt(roundPart))) {
      result.roundIndex = parseInt(roundPart);
    } else if (roundPart && roundPart.startsWith('round-')) {
      result.roundId = roundPart;
    }

    if (parts[2] === 'matches') {
      const matchPart = parts[3];
      if (!isNaN(parseInt(matchPart))) {
        result.matchIndex = parseInt(matchPart);
      } else if (matchPart && matchPart.startsWith('match-')) {
        result.matchId = matchPart;
      }

      if (parts[4] === 'sets') {
        const setPart = parts[5];
        if (!isNaN(parseInt(setPart))) {
          result.setIndex = parseInt(setPart);
        }
      } else if (parts[4] === 'teams') {
        const teamPart = parts[5];
        if (teamPart === 'teamA' || teamPart === 'teamB') {
          result.team = teamPart;
        }
        if (parts[6] === 'players') {
          result.action = 'players';
        }
      }
    }
  }

  return result;
}

async function applyOpToDatabase(
  gameId: string,
  op: Op,
  tx: any,
  _roundIndex?: number,
  _matchIndex?: number
): Promise<boolean> {
  const pathInfo = parsePath(op.path);

  try {
    if (op.path === '/reset' && op.op === 'replace') {
      await tx.roundOutcome.deleteMany({
        where: {
          round: {
            gameId,
          },
        },
      });

      await tx.gameOutcome.deleteMany({
        where: { gameId },
      });

      await tx.set.deleteMany({
        where: {
          match: {
            round: {
              gameId,
            },
          },
        },
      });
      
      await tx.teamPlayer.deleteMany({
        where: {
          team: {
            match: {
              round: {
                gameId,
              },
            },
          },
        },
      });
      
      await tx.team.deleteMany({
        where: {
          match: {
            round: {
              gameId,
            },
          },
        },
      });
      
      await tx.match.deleteMany({
        where: {
          round: {
            gameId,
          },
        },
      });
      
      await tx.round.deleteMany({
        where: { gameId },
      });
      
      return true;
    } else if (op.path === '/rounds' && op.op === 'add' && op.value) {
      const roundCount = await tx.round.count({ where: { gameId } });
      await tx.round.create({
        data: {
          gameId,
          roundNumber: roundCount + 1,
          status: 'IN_PROGRESS',
        },
      });
      return true;
    } else if (op.path.includes('/rounds/') && !op.path.includes('/matches') && op.op === 'remove') {
      const round = await tx.round.findFirst({
        where: { gameId },
        orderBy: { roundNumber: 'asc' },
        skip: pathInfo.roundIndex || 0,
      });
      if (round) {
        const deletedRoundNumber = round.roundNumber;
        await tx.round.delete({ where: { id: round.id } });
        
        // Renumber subsequent rounds
        await tx.round.updateMany({
          where: {
            gameId,
            roundNumber: { gt: deletedRoundNumber }
          },
          data: {
            roundNumber: { decrement: 1 }
          }
        });
      }
      return true;
    } else if (op.path.includes('/sets/') && !op.path.includes('/teamA') && !op.path.includes('/teamB')) {
      const round = await tx.round.findFirst({
        where: { gameId },
        orderBy: { roundNumber: 'asc' },
        skip: pathInfo.roundIndex || 0,
      });

      if (!round) return false;

      const match = await tx.match.findFirst({
        where: { roundId: round.id },
        orderBy: { matchNumber: 'asc' },
        skip: pathInfo.matchIndex || 0,
      });

      if (!match) return false;

      if (op.op === 'add' && op.value) {
        await tx.set.create({
          data: {
            matchId: match.id,
            setNumber: await tx.set.count({ where: { matchId: match.id } }) + 1,
            teamAScore: op.value.teamA || 0,
            teamBScore: op.value.teamB || 0,
          },
        });
        return true;
      }

      const set = await tx.set.findFirst({
        where: { matchId: match.id },
        orderBy: { setNumber: 'asc' },
        skip: pathInfo.setIndex || 0,
      });

      if (op.op === 'replace' && op.value) {
        if (set) {
          await tx.set.update({
            where: { id: set.id },
            data: {
              teamAScore: op.value.teamA || set.teamAScore,
              teamBScore: op.value.teamB || set.teamBScore,
            },
          });
        } else {
          await tx.set.create({
            data: {
              matchId: match.id,
              setNumber: (pathInfo.setIndex || 0) + 1,
              teamAScore: op.value.teamA || 0,
              teamBScore: op.value.teamB || 0,
            },
          });
        }
      } else if (op.op === 'remove' && set) {
        const deletedSetNumber = set.setNumber;
        await tx.set.delete({ where: { id: set.id } });
        
        // Renumber subsequent sets in the same match
        await tx.set.updateMany({
          where: {
            matchId: match.id,
            setNumber: { gt: deletedSetNumber }
          },
          data: {
            setNumber: { decrement: 1 }
          }
        });
      }
      return true;
    } else if ((op.path.includes('/teamA') || op.path.includes('/teamB')) && op.path.includes('/matches/')) {
      const round = await tx.round.findFirst({
        where: { gameId },
        orderBy: { roundNumber: 'asc' },
        skip: pathInfo.roundIndex !== undefined ? pathInfo.roundIndex : 0,
      });

      if (!round) {
        console.error(`Round not found for gameId: ${gameId}, roundIndex: ${pathInfo.roundIndex}`);
        return false;
      }

      const match = await tx.match.findFirst({
        where: { roundId: round.id },
        orderBy: { matchNumber: 'asc' },
        skip: pathInfo.matchIndex !== undefined ? pathInfo.matchIndex : 0,
      });

      if (!match) {
        console.error(`Match not found for roundId: ${round.id}, matchIndex: ${pathInfo.matchIndex}`);
        return false;
      }

      const teamNumber = op.path.includes('/teamA') ? 1 : 2;
      const team = await tx.team.findFirst({
        where: {
          matchId: match.id,
          teamNumber,
        },
      });

      if (!team) {
        console.error(`Team not found for matchId: ${match.id}, teamNumber: ${teamNumber}`);
        return false;
      }

      if (op.op === 'add' && op.value) {
        await tx.teamPlayer.upsert({
          where: {
            teamId_userId: {
              teamId: team.id,
              userId: op.value,
            },
          },
          create: {
            teamId: team.id,
            userId: op.value,
          },
          update: {},
        });
        return true;
      } else if (op.op === 'remove') {
        const pathParts = op.path.split('/').filter(Boolean);
        const teamIndex = pathParts.findIndex(p => p === 'teamA' || p === 'teamB');
        if (teamIndex !== -1 && teamIndex + 1 < pathParts.length) {
          const playerId = pathParts[teamIndex + 1];
          if (playerId) {
            await tx.teamPlayer.deleteMany({
              where: {
                teamId: team.id,
                userId: playerId,
              },
            });
            return true;
          }
        }
        return false;
      }
      return false;
    } else if (op.path.includes('/matches') && !op.path.includes('/sets') && !op.path.includes('/teamA') && !op.path.includes('/teamB')) {
      if (op.op === 'add' && op.value) {
        let round = await tx.round.findFirst({
          where: { gameId },
          orderBy: { roundNumber: 'asc' },
          skip: pathInfo.roundIndex !== undefined ? pathInfo.roundIndex : 0,
        });

        if (!round) {
          const roundCount = await tx.round.count({ where: { gameId } });
          round = await tx.round.create({
            data: {
              gameId,
              roundNumber: roundCount + 1,
              status: 'IN_PROGRESS',
            },
          });
        }

        const matchCount = await tx.match.count({ where: { roundId: round.id } });
        const newMatch = await tx.match.create({
          data: {
            roundId: round.id,
            matchNumber: matchCount + 1,
            status: 'IN_PROGRESS',
          },
        });

        await tx.team.create({
          data: {
            matchId: newMatch.id,
            teamNumber: 1,
          },
        });

        await tx.team.create({
          data: {
            matchId: newMatch.id,
            teamNumber: 2,
          },
        });
        return true;
      } else if (op.op === 'remove') {
        const round = await tx.round.findFirst({
          where: { gameId },
          orderBy: { roundNumber: 'asc' },
          skip: pathInfo.roundIndex !== undefined ? pathInfo.roundIndex : 0,
        });

        if (!round) {
          console.error(`Round not found for gameId: ${gameId}, roundIndex: ${pathInfo.roundIndex}`);
          return false;
        }

        const match = await tx.match.findFirst({
          where: { roundId: round.id },
          orderBy: { matchNumber: 'asc' },
          skip: pathInfo.matchIndex !== undefined ? pathInfo.matchIndex : 0,
        });

        if (match) {
          const deletedMatchNumber = match.matchNumber;
          await tx.match.delete({ where: { id: match.id } });
          
          // Renumber subsequent matches in the same round
          await tx.match.updateMany({
            where: {
              roundId: round.id,
              matchNumber: { gt: deletedMatchNumber }
            },
            data: {
              matchNumber: { decrement: 1 }
            }
          });
          return true;
        }
        return false;
      }
      return false;
    }
  } catch (error) {
    console.error('Error applying op to database:', error);
    return false;
  }

  return false;
}

export async function batchOps(
  gameId: string,
  ops: Op[],
  requestUserId: string,
  idempotencyKey: string
): Promise<BatchOpsResult> {
  if (processedOps.has(idempotencyKey)) {
    return processedOps.get(idempotencyKey)!;
  }

  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      participants: true,
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: {
          matches: {
            orderBy: { matchNumber: 'asc' },
            include: {
              teams: {
                orderBy: { teamNumber: 'asc' },
                include: {
                  players: {
                    orderBy: { userId: 'asc' },
                  },
                },
              },
              sets: {
                orderBy: { setNumber: 'asc' },
              },
            },
          },
        },
      },
    },
  });

  if (!game) {
    throw new ApiError(404, 'Game not found');
  }

  const userParticipant = game.participants.find(
    (p: { userId: string; role: ParticipantRole }) => p.userId === requestUserId && (p.role === ParticipantRole.OWNER || p.role === ParticipantRole.ADMIN)
  );

  if (!userParticipant && !game.resultsByAnyone) {
    throw new ApiError(403, 'Only game owners/admins can modify results');
  }

  const resultsMeta: ResultsMeta = ((game.resultsMeta as any) as ResultsMeta) || { version: 0 };
  const currentVersion = resultsMeta.version || 0;
  const applied: string[] = [];
  const conflicts: ConflictOp[] = [];

  const processedOpIds = new Set(resultsMeta.processedOps || []);

  for (const op of ops) {
    if (processedOpIds.has(op.id)) {
      applied.push(op.id);
      continue;
    }

    if (op.base_version < currentVersion) {
      conflicts.push({
        opId: op.id,
        reason: 'VersionMismatch',
        serverPatch: [],
        clientPatch: [{ op: op.op, path: op.path, value: op.value }],
      });
    } else {
      applied.push(op.id);
    }
  }

  const headVersion = applied.length > 0 ? currentVersion + 1 : currentVersion;
  const serverTime = new Date().toISOString();

  if (applied.length > 0) {
    await prisma.$transaction(async (tx) => {
      let isResetOp = false;
      
      // Check if there's a reset operation and revert user stats if needed
      const hasResetOp = ops.some(op => applied.includes(op.id) && !processedOpIds.has(op.id) && op.path === '/reset' && op.op === 'replace');
      
      if (hasResetOp && game.affectsRating) {
        const outcomes = await tx.gameOutcome.findMany({
          where: { gameId },
        });
        
        if (outcomes.length > 0) {
          for (const outcome of outcomes) {
            await tx.user.update({
              where: { id: outcome.userId },
              data: {
                level: outcome.levelBefore,
                reliability: outcome.reliabilityBefore,
                totalPoints: { decrement: outcome.pointsEarned },
                gamesPlayed: { decrement: 1 },
                gamesWon: { decrement: outcome.isWinner ? 1 : 0 },
              },
            });
          }
        }
      }
      
      for (const op of ops) {
        if (applied.includes(op.id) && !processedOpIds.has(op.id)) {
          const isResetOperation = op.path === '/reset' && op.op === 'replace';
          
          const success = await applyOpToDatabase(gameId, op, tx);
          if (success) {
            if (isResetOperation) {
              isResetOp = true;
            }
            console.log(`Successfully applied op ${op.id} to database`, {
              path: op.path,
              op: op.op,
              value: op.value,
              gameId,
            });
          } else {
            console.error(`Failed to apply op ${op.id} to database`, {
              path: op.path,
              op: op.op,
              value: op.value,
              gameId,
            });
          }
        }
      }

      const newResultsMeta: ResultsMeta = {
        version: headVersion,
        lastBatchTime: serverTime,
        lastBatchId: idempotencyKey,
        processedOps: [...(resultsMeta.processedOps || []), ...applied.filter(id => !processedOpIds.has(id))],
      };

      const updateData: any = {
        resultsMeta: newResultsMeta as any,
        resultsStatus: isResetOp ? 'NONE' : 'IN_PROGRESS',
      };

      if (isResetOp) {
        updateData.fixedNumberOfSets = 0;
        updateData.maxTotalPointsPerSet = 0;
        updateData.maxPointsPerTeam = 0;
        
        const { calculateGameStatus } = await import('../../utils/gameStatus');
        updateData.status = calculateGameStatus({
          startTime: game.startTime,
          endTime: game.endTime,
          resultsStatus: 'NONE',
        });
      }

      await tx.game.update({
        where: { id: gameId },
        data: updateData,
      });
    });
  }

  const result: BatchOpsResult = {
    applied,
    headVersion,
    serverTime,
    conflicts,
  };

  processedOps.set(idempotencyKey, result);
  setTimeout(() => processedOps.delete(idempotencyKey), 60000);

  return result;
}
