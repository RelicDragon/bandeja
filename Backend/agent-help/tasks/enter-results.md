---
id: enter-results
audience: [player, organizer, season_admin, admin]
requires: []
related: [roles, create-game, create-tournament, create-league-season, ui-map]
verified_against: [Backend/src/utils/parentGamePermissions.ts, Backend/src/services/game/readiness.service.ts, Backend/src/services/game/gameResultsLockedFields.ts, Backend/src/services/results.service.ts, Backend/src/utils/gameStatus.ts, Frontend/src/utils/gameResults.ts, Frontend/src/utils/gameResultsHelpers.ts, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/components/GameDetails/GameResults.tsx, Frontend/src/components/GameDetails/GameResultsEntryEmbedded.tsx, Frontend/src/components/GameDetails/resultsEntry/ResultsFooterActions.tsx, Frontend/src/components/GameDetails/resultsEntry/ResultsActionsMenu.tsx, Frontend/src/components/gameResults/useMatchCardActions.tsx, Frontend/src/components/gameResults/MatchCardControls.tsx, Frontend/src/components/GameDetails/GameSettings.tsx, Frontend/src/components/createGame/GameSettingsSection.tsx, Backend/src/services/league/gameCreation.util.ts, Backend/src/services/agent/tools/results.tools.ts, Backend/src/services/agent/i18n/agentResultsI18n.ts]
---
# Enter results

## Goal

Record the scores of a game, tournament or league fixture and make them final, so standings, player levels (for rated games) and league tables update. Results go through three states: none yet, in progress (scores being entered), and final.

## Who can do this

- **Organizers**: the game's owner and its admins, the season owner and season admins (for league fixtures), and platform admins can always enter, finish, restart and edit results.
- **Players**: a confirmed (PLAYING) player can enter results only when the game has "Results by anyone" turned on. League fixtures always allow it for their players and for the season's players. Tournaments never allow it. Invited, queued, guest or non-playing people (for example a trainer) cannot.
- **How to get the right**: ask the owner to make you an admin ("Promote to Admin"), or to turn on "Results by anyone" in the game's settings before results entry starts (it is locked afterwards). See topic `roles`.
- Nobody can change results of an archived game.

## Steps in the UI

### Start results entry
1. Open the game page. When results have not started and you may enter them, a green "Start Results Entry" button is shown (league seasons have none; their fixtures do).
2. If the game is still upcoming, the app asks "Game Not Started Yet"; tap "Yes, Continue" to go on. Starting marks the game as started.
3. The results board opens with round 1. Generated formats (Americano, Mexicano, Round Robin and others) build the matches automatically; manual formats give empty matches where you tap seats to place players.

### Enter scores
1. On a match card tap "Enter score", type the sets or points, and save ("Save and next" moves to the next match).
2. The match menu ("Match actions") has "Edit lineup", "Change court", "Live score"{gameResults.liveScore} (point-by-point scoring on a separate board), "+ Extra (stats only)" (extra sets that never count for the result or rating) and "Delete match".
3. "Add Round" generates the next round in multi-round formats.
4. If you were offline, a "Unsynced Changes Detected" banner offers "Sync to Server".
5. If two people edit the same match, the most recently saved score wins; a stale save asks you to retry.

### Finish
1. The bar at the bottom shows how many matches are scored and the finish button: "Finish Game" or "Finish Tournament".
2. The confirmation ("Finish Game?" / "Finish Tournament?") lists how many matches have no score, how many have missing players, and how many are ties. Matches without a result are ignored.
3. Confirm. Results become final: standings are calculated, levels change if it is a rating game, bets are settled, and a league fixture updates the season standings.

### Restart or edit
- While scoring is in progress, "Restart"{gameResults.restart} in the bottom bar clears all results and returns the game to setup (roster and settings unlock).
- After finishing, the "Results actions" (⋯) menu has "Edit Results": it reopens scoring with the scores kept, undoes the outcomes and reverses rating changes until you finish again. This is only possible in the app.

## Settings that matter

- **"Results by anyone"**: lets every confirmed player enter results and change the game format. Can be changed only before results start. Not available for tournaments or trainings.
- **"Rating game"**: when on, finishing changes player levels; editing final results reverses those changes.
- **Number of players**: the app only offers "Start Results Entry" when every seat is filled by a confirmed player; with fixed pairs every pair must be complete.
- **Locks after start**: once results entry has started, the roster and the game settings (time, price, level, format, max players, "Results by anyone") cannot be changed. Organizers can still substitute a player in a casual game or tournament. "Restart" removes the lock (and the results).
- **Archiving**: games and tournaments are archived 7 days after their start time, or 2 days after results were finished (club time). League fixtures are archived 2 days after being finished. There is no other deadline: results can be entered after the game ended ("Game has ended. You can still enter results").

## Common mistakes

- **No "Start Results Entry" button**: "Not enough players"{games.results.problems.insufficientPlayers} (confirmed players fewer than seats), "Fixed pairs are not fully set up", or "You cannot edit results"{games.results.problems.noEditAccess} (you are not an organizer and "Results by anyone" is off, or you are not a confirmed player).
- **"Game is archived - results locked"**: the game is too old; results can only be viewed.
- **I'm a player but can't score a tournament**: tournaments only allow organizers.
- **Error that results are finalized and must be reopened before scoring**: the results are final; an organizer must use "Edit Results" in the app first.
- **The board became read-only during scoring**: a player left or a pair broke, so the roster is no longer complete. Fix it with substitution, or use "Restart".
- **Can't change time, price or players**: results entry has started (see Locks above).
- **"Edit Results" missing**: only organizers see it, only on final results, and not on archived games.
- **A training has no score board**: trainings use "Finish Training"{training.finishTraining} instead.

## What the assistant can do

- `get_game_results`: shows the status, each match with sides and scores, standings when final, and whether the user may enter scores.
- `enter_match_score`: saves the score of one match after a confirmation card (warns when it replaces a score or stops live scoring). If results have not started it can start them only for manual formats with one match; for generated formats (Americano, Mexicano, Round Robin, King of the Court and others) the user must tap "Start Results Entry" in the app first. It refuses incomplete or different lineups, matches with extra sets, and final results.
- `finish_results`: makes results final after a confirmation card listing unscored matches, ties, rating changes and bets; it needs at least one scored match.
- Works for games, tournaments and league fixtures; not for trainings, bar meetups, events or a league season itself.
- App only: "Restart", "Edit Results", adding rounds, lineups, live scoring, extra sets, substitutions and "Finish Training"{training.finishTraining}.
