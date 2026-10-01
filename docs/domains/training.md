# Training

`entityType=TRAINING` is a `Game`. Trainer is **`Game.trainerId`** (FK User, `onDelete: SetNull`). Do not use a participant flag.

Caps (`entityCapabilities`): hasResults, hasBooking, hasLevelBand; no rating ELO, no play-intent radar. Create: [create.md](./create.md) TRAINING chip; invite picker lists trainers only.

## Lifecycle

- Create: only `User.isTrainer` or platform admins (`GameCreateService` → 403 otherwise; also covers Duplicate and rematch). Recurring series: occurrences are generated with `seriesOccurrence: true` and skip the gate — the series was created from a TRAINING that passed it, so **a series keeps generating even if its owner later loses `isTrainer`** (an admin can end the series).
- Optional `trainerId` at create. If unset: pending trainer invite row + accept (`setTrainer` on `game.controller.ts`)
- `canInviteTrainer`: owner/admin while `!trainerId`. A trainer invite (`asTrainer`) requires the **invitee** to have `User.isTrainer` (`ParticipantService.sendInvite` → 403), matching the trainers-only picker
- Manage users **Set as trainer** (`AdminService.setTrainer`, owner only): deliberately allows **any** roster member, not only `isTrainer` users — the UI offers it on every participant row. It grants nothing the owner does not already have (the owner may finish and edit levels too)
- Finish: `finishTraining` in `training.service.ts` → `resultsStatus=FINAL`, `status=FINISHED`, `finishedDate` on first final. Touches `UserSportProfile.lastRatingActivityAt` for PLAYING roster. No ELO. Who: the game's trainer (`Game.trainerId`) or whoever passes `canModifyResults` (owner/admin of the game or its parent, platform admin, PLAYING participant when `resultsByAnyone`) — same as the "Finish Training" button. ARCHIVED → 403
- Undo: `undoTraining` / `TrainingResultsSection` `onUndoTraining`

Scheduler: TRAINING is results-based (no auto-FINISHED). Archive via `gameStatus.ts` end-time rules. See [results.md](./results.md).

## Trainer edits

When FINAL: `TrainingResultsSection` + **`EditLevelModal`**. Trainer/admin sets participant **level** and **reliability** (`updateParticipantLevel`). Level edits and undo are allowed only for the game's trainer (`Game.trainerId`), an OWNER/ADMIN of the game or its parent, or a platform admin; a global `User.isTrainer` alone grants nothing on someone else's training. Every accepted edit stamps the level as confirmed (`approved*`). Writes SET `LevelChangeEvent`. PADEL also mirrors `User.approved*` when confirming ([ratings.md](./ratings.md)).

`User.isTrainer`. Favorite trainer: `User.favoriteTrainerId` (`favoriteTrainer.controller.ts`) — Find filter highlight.

## Reviews

`TrainerReview` on the training game. Submit after training. Profile Reviews tab (`ProfileTrainerReviews`). `trainerReview.service.ts`.

## Find

Training chip + **`TrainersList`** carousel (`Frontend/src/components/home/TrainersList.tsx`) when training filter is on. `GET` trainers: `trainers.routes.ts` / `trainers.controller.ts` / `Frontend/src/api/trainers.ts`.

## Code

- BE: `Backend/src/services/training.service.ts`, `trainerReview.service.ts`, `game.controller.ts` `setTrainer`, `trainers.controller.ts`
- FE: `TrainingResultsSection.tsx`, `EditLevelModal.tsx`, `TrainersList.tsx`, `GameCardTrainerBadge.tsx`
- Schema: `Game.trainerId`, `TrainerReview`
