# Game Results API

## Overview

This API allows for progressive saving of game results during gameplay. Results are structured hierarchically:

- **Game** → Contains multiple **Rounds**
- **Round** → Contains multiple **Matches** and **Round Outcomes**
- **Match** → Contains **Teams** and **Sets**
- **Team** → Contains **Players**
- **Set** → Contains scores (teamA : teamB)

## Endpoints

### POST `/api/results/game/:gameId`

Save or update game results progressively.

**Request Body:**
```json
{
  "rounds": [
    {
      "roundNumber": 1,
      "status": "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
      "matches": [
        {
          "matchNumber": 1,
          "status": "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
          "winnerId": "team_id_or_null",
          "teams": [
            {
              "teamNumber": 1,
              "playerIds": ["user_id_1", "user_id_2"],
              "score": 45
            },
            {
              "teamNumber": 2,
              "playerIds": ["user_id_3", "user_id_4"],
              "score": 38
            }
          ],
          "sets": [
            {
              "setNumber": 1,
              "teamAScore": 6,
              "teamBScore": 4
            },
            {
              "setNumber": 2,
              "teamAScore": 7,
              "teamBScore": 5
            }
          ]
        }
      ],
      "outcomes": [
        {
          "userId": "user_id_1",
          "levelChange": 0.15
        },
        {
          "userId": "user_id_2",
          "levelChange": 0.12
        }
      ]
    }
  ],
  "finalOutcomes": [
    {
      "userId": "user_id_1",
      "levelChange": 0.25,
      "reliabilityChange": 0.1,
      "pointsEarned": 10,
      "position": 1,
      "isWinner": true
    }
  ]
}
```

**Notes:**
- You can send this endpoint multiple times during the game to save progress
- Include `finalOutcomes` only when the game is complete to finalize results
- When `finalOutcomes` is included, user ratings will be updated if `game.affectsRating` is true
- Teams can be different for each match (for mixed games like Americano)
- Each set score must be between 0-100

### GET `/api/results/game/:gameId`

Get all results for a game including rounds, matches, teams, sets, and outcomes.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "game_id",
    "rounds": [...],
    "outcomes": [...]
  }
}
```

### GET `/api/results/game/:gameId/generate`

Auto-generate outcomes based on saved match results. Useful for calculating ratings after entering scores.

**Response:**
```json
{
  "success": true,
  "data": {
    "finalOutcomes": [...],
    "roundOutcomes": {
      "0": [...],
      "1": [...]
    }
  }
}
```

### GET `/api/results/round/:roundId`

Get results for a specific round.

### GET `/api/results/match/:matchId`

Get results for a specific match.

### DELETE `/api/results/game/:gameId`

Delete all results for a game and revert user rating changes.

## Game Types

### Classic Game
- Single round by default
- Fixed teams throughout
- Winner determined by match outcome
- Level changes based on win/loss and opponent level

### Americano/Mexicano
- Multiple rounds with mixed teams
- Level changes based on score deltas (win shares)
- No strict winner/loser - ranking by total points
- Teams change each round

### Tournament
- Multiple rounds (e.g., quarterfinals, semifinals, finals)
- Each round has outcomes
- Final game outcome is sum of all round outcomes

## Examples

### Fixed Teams

Games can have predefined teams set by the organizer. When a game has `hasFixedTeams: true`:
- All matches must use the exact team configurations defined in the game
- Team playerIds must match the fixed team's playerIds
- Number of teams in each match must match number of fixed teams

See `FIXED_TEAMS_API.md` for detailed documentation on managing fixed teams.

**Validation Error Example:**
```json
{
  "success": false,
  "message": "Team 1 players do not match fixed team configuration"
}
```

### Simple Classic Game (In Progress)

```json
POST /api/results/game/game_123
{
  "rounds": [
    {
      "roundNumber": 1,
      "status": "IN_PROGRESS",
      "matches": [
        {
          "matchNumber": 1,
          "status": "IN_PROGRESS",
          "teams": [
            {
              "teamNumber": 1,
              "playerIds": ["alice_id", "bob_id"],
              "score": 0
            },
            {
              "teamNumber": 2,
              "playerIds": ["charlie_id", "diana_id"],
              "score": 0
            }
          ],
          "sets": [
            {
              "setNumber": 1,
              "teamAScore": 3,
              "teamBScore": 2
            }
          ]
        }
      ]
    }
  ]
}
```

### Complete Classic Game

```json
POST /api/results/game/game_123
{
  "rounds": [
    {
      "roundNumber": 1,
      "status": "COMPLETED",
      "matches": [
        {
          "matchNumber": 1,
          "status": "COMPLETED",
          "winnerId": "team_1_id",
          "teams": [
            {
              "teamNumber": 1,
              "playerIds": ["alice_id", "bob_id"],
              "score": 12
            },
            {
              "teamNumber": 2,
              "playerIds": ["charlie_id", "diana_id"],
              "score": 8
            }
          ],
          "sets": [
            {
              "setNumber": 1,
              "teamAScore": 6,
              "teamBScore": 4
            },
            {
              "setNumber": 2,
              "teamAScore": 6,
              "teamBScore": 4
            }
          ]
        }
      ]
    }
  ],
  "finalOutcomes": [
    {
      "userId": "alice_id",
      "levelChange": 0.08,
      "reliabilityChange": 0.1,
      "pointsEarned": 10,
      "position": 1,
      "isWinner": true
    },
    {
      "userId": "bob_id",
      "levelChange": 0.08,
      "reliabilityChange": 0.1,
      "pointsEarned": 10,
      "position": 1,
      "isWinner": true
    },
    {
      "userId": "charlie_id",
      "levelChange": -0.05,
      "reliabilityChange": 0.1,
      "pointsEarned": 0,
      "position": 2,
      "isWinner": false
    },
    {
      "userId": "diana_id",
      "levelChange": -0.05,
      "reliabilityChange": 0.1,
      "pointsEarned": 0,
      "position": 2,
      "isWinner": false
    }
  ]
}
```

### Americano Tournament (3 Rounds)

```json
POST /api/results/game/game_456
{
  "rounds": [
    {
      "roundNumber": 1,
      "status": "COMPLETED",
      "matches": [
        {
          "matchNumber": 1,
          "status": "COMPLETED",
          "teams": [
            { "teamNumber": 1, "playerIds": ["alice_id", "bob_id"], "score": 32 },
            { "teamNumber": 2, "playerIds": ["charlie_id", "diana_id"], "score": 28 }
          ],
          "sets": [
            { "setNumber": 1, "teamAScore": 32, "teamBScore": 28 }
          ]
        }
      ],
      "outcomes": [
        { "userId": "alice_id", "levelChange": 0.03 },
        { "userId": "bob_id", "levelChange": 0.03 },
        { "userId": "charlie_id", "levelChange": -0.02 },
        { "userId": "diana_id", "levelChange": -0.02 }
      ]
    },
    {
      "roundNumber": 2,
      "status": "COMPLETED",
      "matches": [
        {
          "matchNumber": 1,
          "status": "COMPLETED",
          "teams": [
            { "teamNumber": 1, "playerIds": ["alice_id", "charlie_id"], "score": 35 },
            { "teamNumber": 2, "playerIds": ["bob_id", "diana_id"], "score": 30 }
          ],
          "sets": [
            { "setNumber": 1, "teamAScore": 35, "teamBScore": 30 }
          ]
        }
      ],
      "outcomes": [
        { "userId": "alice_id", "levelChange": 0.04 },
        { "userId": "charlie_id", "levelChange": 0.04 },
        { "userId": "bob_id", "levelChange": -0.03 },
        { "userId": "diana_id", "levelChange": -0.03 }
      ]
    },
    {
      "roundNumber": 3,
      "status": "COMPLETED",
      "matches": [
        {
          "matchNumber": 1,
          "status": "COMPLETED",
          "teams": [
            { "teamNumber": 1, "playerIds": ["alice_id", "diana_id"], "score": 40 },
            { "teamNumber": 2, "playerIds": ["bob_id", "charlie_id"], "score": 25 }
          ],
          "sets": [
            { "setNumber": 1, "teamAScore": 40, "teamBScore": 25 }
          ]
        }
      ],
      "outcomes": [
        { "userId": "alice_id", "levelChange": 0.05 },
        { "userId": "diana_id", "levelChange": 0.05 },
        { "userId": "bob_id", "levelChange": -0.03 },
        { "userId": "charlie_id", "levelChange": -0.03 }
      ]
    }
  ],
  "finalOutcomes": [
    {
      "userId": "alice_id",
      "levelChange": 0.12,
      "reliabilityChange": 0.1,
      "pointsEarned": 21,
      "position": 1,
      "isWinner": true
    },
    {
      "userId": "charlie_id",
      "levelChange": -0.01,
      "reliabilityChange": 0.1,
      "pointsEarned": 12,
      "position": 2,
      "isWinner": false
    },
    {
      "userId": "diana_id",
      "levelChange": 0.0,
      "reliabilityChange": 0.1,
      "pointsEarned": 11,
      "position": 3,
      "isWinner": false
    },
    {
      "userId": "bob_id",
      "levelChange": -0.03,
      "reliabilityChange": 0.1,
      "pointsEarned": 10,
      "position": 4,
      "isWinner": false
    }
  ]
}
```

## Permission Rules

- Only game `OWNER` or `ADMIN` participants can save/delete results
- Exception: If `game.resultsByAnyone` is `true`, any participant can save results
- Anyone can view results (GET endpoints use `optionalAuth`)

## Rating Calculations

The system supports automatic rating calculation via `/api/results/game/:gameId/generate`:

1. Analyzes all saved matches, teams, and sets
2. Calculates level changes based on game type
3. Returns suggested outcomes
4. You can then submit these outcomes to finalize the game

This is useful when you just want to enter scores and let the system calculate the ratings.

