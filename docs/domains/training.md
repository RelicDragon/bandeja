# Training

`entityType=TRAINING` is a `Game`. Trainer is **`Game.trainerId`** (FK User, `onDelete: SetNull`). Do not use a participant flag.

Caps (`entityCapabilities`): hasResults, hasBooking, hasLevelBand; no rating ELO, no play-intent radar. Create: [create.md](./create.md) TRAINING chip; invite picker lists trainers only.

## Lifecycle

- Optional `trainerId` at create. If unset: pending trainer invite row + accept (`setTrainer` on `game.controller.ts`)
- `canInviteTrainer`: owner/admin while `!trainerId`
- Finish: `finishTraining` in `training.service.ts` → `resultsStatus=FINAL`, `status=FINISHED`, `finishedDate` on first final. Touches `UserSportProfile.lastRatingActivityAt` for PLAYING roster. No ELO
- Undo: `undoTraining` / `TrainingResultsSection` `onUndoTraining`

Scheduler: TRAINING is results-based (no auto-FINISHED). Archive via `gameStatus.ts` end-time rules. See [results.md](./results.md).

## Trainer edits

When FINAL: `TrainingResultsSection` + **`EditLevelModal`**. Trainer/admin sets participant **level** and **reliability** (`updateParticipantLevel`). Writes SET `LevelChangeEvent`. PADEL also mirrors `User.approved*` when confirming ([ratings.md](./ratings.md)).

`User.isTrainer`. Favorite trainer: `User.favoriteTrainerId` (`favoriteTrainer.controller.ts`) — Find filter highlight.

## Reviews

`TrainerReview` on the training game. Submit after training. Profile Reviews tab (`ProfileTrainerReviews`). `trainerReview.service.ts`.

## Find

Training chip + **`TrainersList`** carousel (`Frontend/src/components/home/TrainersList.tsx`) when training filter is on. `GET` trainers: `trainers.routes.ts` / `trainers.controller.ts` / `Frontend/src/api/trainers.ts`.

## Code

- BE: `Backend/src/services/training.service.ts`, `trainerReview.service.ts`, `game.controller.ts` `setTrainer`, `trainers.controller.ts`
- FE: `TrainingResultsSection.tsx`, `EditLevelModal.tsx`, `TrainersList.tsx`, `GameCardTrainerBadge.tsx`
- Schema: `Game.trainerId`, `TrainerReview`
