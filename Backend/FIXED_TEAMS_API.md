# Fixed Teams API

## Overview

Games can now have predefined/fixed teams set by the organizer. When a game has fixed teams, all matches must use those exact team configurations. This ensures consistent team composition throughout the game.

## Database Schema

### GameTeam Model
Represents a predefined team in a game.

Fields:
- `id`: Unique identifier
- `gameId`: Reference to the game
- `teamNumber`: Team number (1, 2, etc.) - unique per game
- `name`: Optional team name
- `players`: Array of GameTeamPlayer
- `createdAt`, `updatedAt`: Timestamps

### GameTeamPlayer Model
Links users to game teams.

Fields:
- `id`: Unique identifier
- `gameTeamId`: Reference to the game team
- `userId`: Reference to the user
- `createdAt`: Timestamp

### Game Model Updates
New field:
- `hasFixedTeams`: Boolean (default: false) - indicates if game uses fixed teams

## API Endpoints

### Set Fixed Teams for a Game

**POST** `/api/game-teams/game/:gameId/teams`

Sets or updates the fixed teams for a game. This will replace any existing team configuration.

**Authentication**: Required (game owner or admin)

**Request Body**:
```json
{
  "teams": [
    {
      "teamNumber": 1,
      "name": "Team Alpha",
      "playerIds": ["user_id_1", "user_id_2"]
    },
    {
      "teamNumber": 2,
      "name": "Team Beta",
      "playerIds": ["user_id_3", "user_id_4"]
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "game_id",
    "hasFixedTeams": true,
    "fixedTeams": [
      {
        "id": "team_id_1",
        "teamNumber": 1,
        "name": "Team Alpha",
        "players": [
          {
            "id": "player_id_1",
            "userId": "user_id_1",
            "user": {
              "id": "user_id_1",
              "firstName": "John",
              "lastName": "Doe",
              "avatar": "/uploads/avatars/john.jpg",
              "level": 4.5
            }
          }
        ]
      }
    ]
  }
}
```

**Validation Rules**:
- Only game owners/admins can set fixed teams
- Cannot set teams after game has started (has rounds)
- All players must be participants in the game
- A player cannot be in multiple teams
- Team numbers must be unique within the game

### Get Fixed Teams for a Game

**GET** `/api/game-teams/game/:gameId/teams`

Retrieves the fixed teams for a game.

**Authentication**: Not required

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "team_id_1",
      "teamNumber": 1,
      "name": "Team Alpha",
      "players": [
        {
          "id": "player_id_1",
          "userId": "user_id_1",
          "user": {
            "id": "user_id_1",
            "firstName": "John",
            "lastName": "Doe",
            "avatar": "/uploads/avatars/john.jpg",
            "level": 4.5
          }
        }
      ],
      "createdAt": "2025-01-15T10:00:00.000Z",
      "updatedAt": "2025-01-15T10:00:00.000Z"
    }
  ]
}
```

**Note**: Returns empty array if game doesn't have fixed teams.

### Delete Fixed Teams

**DELETE** `/api/game-teams/game/:gameId/teams`

Removes all fixed teams from a game and sets `hasFixedTeams` to false.

**Authentication**: Required (game owner or admin)

**Response**:
```json
{
  "success": true,
  "message": "Fixed teams deleted successfully"
}
```

**Validation Rules**:
- Only game owners/admins can delete fixed teams
- Cannot delete teams after game has started (has rounds)

## Integration with Game Results

When saving game results for a game with fixed teams, the system validates that:

1. The number of teams in each match matches the number of fixed teams
2. Each team's `teamNumber` matches one of the fixed team numbers
3. The player IDs in each team exactly match the fixed team's player IDs

**Example Error**:
```json
{
  "success": false,
  "message": "Team 1 players do not match fixed team configuration"
}
```

## Creating a Game with Fixed Teams

When creating a game, you can optionally set `hasFixedTeams` to true:

**POST** `/api/games`
```json
{
  "name": "Championship Match",
  "gameType": "CLASSIC",
  "startTime": "2025-01-20T15:00:00.000Z",
  "endTime": "2025-01-20T17:00:00.000Z",
  "hasFixedTeams": true,
  ...
}
```

After creating the game, use the Set Fixed Teams endpoint to define the teams.

## Usage Flow

1. **Create Game**: Create a game with `hasFixedTeams: true`
2. **Add Participants**: Add all players as participants to the game
3. **Set Fixed Teams**: Use the Set Fixed Teams endpoint to define team compositions
4. **Play Game**: When saving results, the system will validate teams match the fixed configuration
5. **Update Teams**: You can update team configurations before the game starts
6. **Delete Teams**: You can remove fixed teams before the game starts

## Example: Classic Game with Fixed Teams

```javascript
// 1. Create game
const game = await fetch('/api/games', {
  method: 'POST',
  body: JSON.stringify({
    name: "Finals Match",
    gameType: "CLASSIC",
    startTime: "2025-01-20T15:00:00.000Z",
    endTime: "2025-01-20T17:00:00.000Z",
    hasFixedTeams: true,
    maxParticipants: 4
  })
});

// 2. Invite/add players (assume alice, bob, charlie, diana joined)

// 3. Set fixed teams
await fetch(`/api/game-teams/game/${gameId}/teams`, {
  method: 'POST',
  body: JSON.stringify({
    teams: [
      {
        teamNumber: 1,
        name: "North Team",
        playerIds: ["alice_id", "bob_id"]
      },
      {
        teamNumber: 2,
        name: "South Team",
        playerIds: ["charlie_id", "diana_id"]
      }
    ]
  })
});

// 4. Save results (teams must match fixed configuration)
await fetch(`/api/results/game/${gameId}`, {
  method: 'POST',
  body: JSON.stringify({
    rounds: [{
      roundNumber: 1,
      status: "COMPLETED",
      matches: [{
        matchNumber: 1,
        status: "COMPLETED",
        teams: [
          {
            teamNumber: 1,
            playerIds: ["alice_id", "bob_id"],  // Must match fixed team
            score: 12
          },
          {
            teamNumber: 2,
            playerIds: ["charlie_id", "diana_id"],  // Must match fixed team
            score: 8
          }
        ]
      }]
    }]
  })
});
```

## Notes

- Fixed teams are useful for tournaments, leagues, or any game where team composition should remain constant
- For games like Americano/Mexicano where players rotate partners, don't use fixed teams
- The `hasFixedTeams` flag is set automatically when you set fixed teams via the API
- Deleting all rounds will allow you to modify team configurations again

