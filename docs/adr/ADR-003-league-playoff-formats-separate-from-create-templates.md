# ADR-003: League and playoff formats stay separate from Create Template registry

**Status:** Accepted  
**Date:** 2026-06-06  
**Decides:** GitHub issue #18  
**Related:** #15 (FE/BE registry sharing), #16 (registry consolidation), `PLAN_SPORT_SCORING_FORMATS.md` Track 4

## Context

Casual game create uses a **Create Template** registry (`CreateTemplateId`, `tier: social | match`) for Social/Match/Advanced UX. League and playoff flows configure formats differently:

| Flow | UX | Format source today |
|------|-----|---------------------|
| Casual create | Template picker + optional Advanced wizard | `createFlow.ts` / `sportRegistryCasual.ts` |
| League season create | `useGameFormat` wizard only (HANDMADE/CLASSIC defaults) | `CreateLeague.tsx` — no template picker |
| Session playoff | Game-type choice (WINNER_COURT \| AMERICANO) + format wizard | FE `playoffTemplates.ts`; BE `PLAYOFF_GAME_TYPE_TEMPLATES` |
| Bracket playoff | CLASSIC 2-team; inherits season fixture | `BracketPlayoffGameSetupStep` + season `gameSeason` |

Issue #18 asked whether league/playoff formats should join the unified registry (#16) or remain a separate path.

## Decision

**Keep league and playoff formats separate from the Create Template registry.** Do not add `league` / `playoff` template tiers to `CREATE_TEMPLATES`.

## Rationale

1. **Different lifecycle.** Create templates bundle one-shot event shape (suggested roster/courts, `affectsRating`, Social/Match intent). League formats are **season-level defaults** copied to fixtures; playoffs are **round-scoped** with hard constraints (session: rotation only; bracket: CLASSIC head-to-head only).

2. **Different abstraction shape.** `CreateTemplate` fields (`suggestedMaxParticipants`, `suggestedCourts`, `tier`, `affectsRating`) do not apply to season defaults or playoff structural seeds. `PLAYOFF_GAME_TYPE_TEMPLATES` maps `gameType` → winner/scoring/generation fields — partial overlap with templates, not the same type.

3. **Constraint-driven, not catalog-driven.** Playoff game types are gated by `getSportConfig(sport).rotationFormats` (e.g. AMERICANO disallowed for tennis). League regular season is CLASSIC + HANDMADE only. These are filtered wizards, not “pick from template list.”

4. **Scope isolation for #16.** Registry consolidation (#16) targets FE/BE drift on **casual** templates (~750 duplicated lines). Extending tiers to league/playoff before #16 lands adds scope without user-facing benefit in casual create UX.

5. **Small, bounded sync surface.** Manual sync points are explicit and few (see below). Unification would require new tier model, league-specific template IDs, playoff wizard refactor, and cross-entity template resolution — high cost for marginal drift reduction.

## Maintenance burden and sync points

When changing scoring presets, rotation policy, or playoff defaults, verify **all** of:

| Sync point | Location | What must stay aligned |
|------------|----------|------------------------|
| Playoff structural defaults (BE) | `Backend/src/services/league/gameCreation.util.ts` → `PLAYOFF_GAME_TYPE_TEMPLATES` | `winnerOfMatch`, `winnerOfGame`, `matchGenerationType`, `fixedNumberOfSets`, `ballsInGames` for WINNER_COURT and AMERICANO |
| Playoff game-type seeds (FE) | `Frontend/src/components/GameDetails/playoffTemplates.ts` → `PLAYOFF_GAME_TYPE_SEEDS` | Same `gameType` keys as BE templates |
| Session AMERICANO scoring per sport (FE) | `playoffTemplates.ts` → `SESSION_AMERICANO_SCORING` | `scoringPreset` + `maxTotalPointsPerSet` per sport; must be in sport `allowedScoringPresets` |
| Rotation gating | `sportRegistry` → `rotationFormats` (FE + BE) | Which playoff game types are offered per sport |
| Sport allowlists | `validateGameForSport` + `allowedScoringPresets` | Any preset used in league fixture or playoff setup |
| League fixture wizard | `CreateLeague.tsx`, `useGameFormat`, `useClampGameFormatToSport` | Match-tier classic presets only; no social/rotation templates |
| Multisport rollout | `docs/PLAN_SPORT_SCORING_FORMATS.md` Track 4, suggested defaults table | Season + playoff preset choices per sport |

**Recommended hygiene (no registry unification):**

- Add a small cross-tier test asserting FE `PLAYOFF_GAME_TYPE_SEEDS` keys match BE `PLAYOFF_GAME_TYPE_TEMPLATES` keys (when #16 CI parity pattern exists).
- When enabling AMERICANO playoffs for a sport (L2), update `SESSION_AMERICANO_SCORING` and confirm BE preset resolution — do not add a create template.

## Consequences

- #16 implementation scope unchanged: casual templates only.
- League/playoff multisport work continues via Track 4 in `PLAN_SPORT_SCORING_FORMATS.md`.
- Future reviews should not re-propose full registry unification unless product adds template-picker UX to league create or expands playoff to arbitrary casual templates.

## Revisit triggers

Reopen this decision if:

- Product requires Social/Match template picker on league season create.
- Playoff flows need arbitrary casual templates (e.g. Mexicano session playoff).
- FE/BE playoff seed drift causes a production bug despite allowlist validation.
