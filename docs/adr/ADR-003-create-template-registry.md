# ADR-003: Create Template registry sharing (FE + BE)

**Status:** Accepted  
**Date:** 2026-06-06  
**Deciders:** Architecture review (issue #15)  
**Unblocks:** #16 (implementation)  
**Depends on (semantics, not structure):** #10 (generation resolver), #12 (rotation policy)

## Context

Create-game templates are defined twice today:

- Frontend: `Frontend/src/sport/createFlow.ts` (~780 lines) — source of truth for UX, i18n, discovery, participant fit.
- Backend: `Backend/src/sport/sportRegistryCasual.ts` (~750 lines) — parallel copy for rating metadata, officiating lookup, multisport gate scripts, and validation defaults.

Template IDs and fields already drift (FE is a superset). Only badminton has a cross-tier parity test (`badmintonFlow.verify.test.ts`), which parses the BE file as text.

Docs declare FE as source of truth (`docs/CREATE_TEMPLATES_MATRIX.md`), but BE maintains an unsynchronised duplicate.

## Blocker status (#10, #12) at decision time

| Issue | Title | Status | Notes |
| ----- | ----- | ------ | ----- |
| #10 | Honor template `matchGenerationType` in generation resolver | **Open — not implemented** | `resolveCreateTemplateGeneration` still returns `RANDOM` for all large-roster non-Americano templates. |
| #12 | Shared rotation policy module | **Open — not implemented** | `rotationFormats.ts` still duplicated in FE and BE; not yet in `Frontend/shared/`. |

**Registry unification (#16) must not ship before #10 and #12 land.** Consolidating broken generation semantics or divergent rotation policy into one file would bake incorrect behaviour into the single source of truth.

## Decision

**Option A — shared module under `Frontend/shared/`, imported by both tiers.**

Reject Option B (codegen) and Option C (monorepo package `@padelpulse/templates`) for now: unnecessary build complexity and setup cost for a problem already solved by the existing `@shared/*` alias pattern on the frontend.

### Canonical layout (target for #16)

| Module | Location | Contents |
| ------ | -------- | -------- |
| Template registry | `Frontend/shared/createTemplates.ts` | `CreateTemplateId`, `CreateTemplate`, `CREATE_TEMPLATES`, `getTemplate`, `listTemplatesForSport` |
| Create flow config | `Frontend/shared/createFlowConfig.ts` | `CREATE_FLOW_BY_SPORT`, `SportPresetMeta`, `SportRatingModel`, `getStrictValidationForPreset`, `getOfficiatingLevelForGame` |
| Thin FE adapter | `Frontend/src/sport/createFlow.ts` | Re-exports shared registry + FE-only helpers (`listTemplatesForIntent`, `pickDefaultTemplateId`, participant-fit wiring) |
| Thin BE adapter | `Backend/src/sport/sportRegistryCasual.ts` | Re-exports from `@shared/createTemplates` and `@shared/createFlowConfig`; delete duplicate definitions |

### Import mechanism

1. **Frontend** — continue `@shared/*` → `Frontend/shared/*` (existing Vite alias).
2. **Backend** — add tsconfig path alias `@shared/*` → `../Frontend/shared/*` and import the canonical modules directly. **Do not** maintain a second copy under `Backend/src/shared/` for template data (unlike small policy files that still use manual sync today).

Rationale: one physical file eliminates drift; path alias is already proven on FE; BE `rootDir` stays `src/` with imports resolved at compile time via ts-node/tsc.

## Backend consumers and required fields

### Consumers (must keep working after #16)

| Consumer | Path | Uses |
| -------- | ---- | ---- |
| Sport registry | `Backend/src/sport/sportRegistry.ts` | `createTemplates` ID lists, preset meta, rating models |
| Game validation | `Backend/src/utils/validators/validateGameForSport.ts` | Indirect via `getSportConfig` |
| Live scoring rulebook | `Backend/src/services/results/liveScoringEngine/rulebook.ts` | `getOfficiatingLevelForGame`, `getStrictValidationForPreset` |
| Rating services | `Backend/src/services/results/rating.service.ts`, `calculator.service.ts` | `SportRatingModel`, `affectsRating` on templates |
| Multisport gate scripts | `Backend/scripts/tests/multisport-gates.ts`, `multisport-formats-tier-bc.ts`, `multisport-e2e-smoke.ts` | `CREATE_TEMPLATES`, preset/officiating helpers |
| Officiating tests | `Backend/src/shared/officiatingLevel.test.ts` | `getOfficiatingLevelForGame` |

### Fields required on the shared `CreateTemplate` type (BE + FE)

These must live in the shared registry and stay identical on both tiers:

- `id`, `sport`, `tier`
- `scoringPreset`, `gameType`, `matchGenerationType`
- `playersPerMatch`, `suggestedMaxParticipants`, `suggestedCourts`
- `affectsRating`
- `matchTimerEnabled?`, `matchTimedCapMinutes?`, `hasGoldenPoint?`
- `expectedDurationLabelKey?` — BE-only for server-side duration hints in gate tests; optional on FE (ignored by UI)

### Frontend-only fields (stay on FE adapter or optional on shared type)

Not consumed by BE validation or scoring:

- `labelKey`, `descriptionKey`, `badgeLabelKey`, `badgeVariant`
- `inlineConfig` (wizard sub-flow: points-total picker, timed duration options)
- `baselineRounds` (event duration estimation)

FE-only fields may be present on the shared type as optional properties; BE must not branch on them.

## Legacy padel and stored-only template IDs

### Policy

1. **All template IDs that can appear on stored games** (`Game.templateId` / format snapshots) must exist in the shared `CREATE_TEMPLATES` map — including legacy entries — so `getTemplate(id)` round-trips for discovery badges, edit reload, and format matching.
2. **Sport registry `createTemplates` lists** (what the create UI offers) remain a separate, explicit ID array per sport. Legacy IDs are excluded from those lists but retained in `CREATE_TEMPLATES`.
3. **No migration** of stored `templateId` values in this slice. Aliases stay as-is.

### ID classes

| Class | IDs | In create UI | In shared `CREATE_TEMPLATES` | In `createTemplates` sport list |
| ----- | --- | ------------ | ---------------------------- | ------------------------------- |
| Active padel multisport | `PADEL_AMERICANO_*`, `PADEL_MEXICANO_24`, `PADEL_CHALLENGER_POOL`, … | ✓ | ✓ | ✓ |
| Legacy padel match/social | `PADEL_BEST_OF_3`, `PADEL_SINGLE_SET`, `PADEL_AMERICANO`, `PADEL_TIMED` | ✓ (padel match/social tier UX) | ✓ | ✓ (padel only) |
| Stored-only alias | `PADEL_KOTC_11` | ✗ (superseded by `PADEL_CHALLENGER_POOL`) | ✓ | ✗ |
| Stored-only TT | `TT_AMERICANO_11`, `TT_MEXICANO_11`, `TT_SWISS_BOX` | ✗ | ✓ | ✗ |

Padel legacy templates remain **FE-first for UX** but are **not FE-only aliases** — BE must resolve them for games already stored with those IDs.

## CI verification strategy

Goal: fail CI on any FE/BE template drift without text-parsing the backend file.

### Primary gate — shared registry parity test (Frontend Vitest)

Add `Frontend/src/sport/createTemplateRegistry.verify.test.ts` (or generalise `badmintonFlow.verify.test.ts`):

- Import `CREATE_TEMPLATES` and `CREATE_FLOW_BY_SPORT` from `@shared/*` (same modules BE will import).
- For **every sport** in the registry (padel, tennis, table tennis, badminton, pickleball, squash):
  - Assert `getSportConfig(sport).createTemplates` IDs ⊆ `CREATE_TEMPLATES` keys.
  - For each ID in the sport list, deep-compare all **BE-required fields** (table above).
- Assert stored-only legacy IDs exist in `CREATE_TEMPLATES` but are absent from their sport's `createTemplates` list where documented.
- Assert social templates have `affectsRating: false` and match templates `true` (mirrors `G-CASUAL` in `multisport-gates.ts`).

Include in `npm run test:live-scoring` (replacing the badminton-only BE file parse test).

### Secondary gate — backend multisport scripts

Update `multisport-gates.ts` / `multisport-formats-tier-bc.ts` to import `CREATE_TEMPLATES` from `@shared/createTemplates` instead of `sportRegistryCasual`. Existing `G-CASUAL` and per-sport assertions remain; they now exercise the same artifact as FE.

Run via `Backend/scripts/tests/run-all.ts` (already in automated QA).

### Remove

Delete the `readFileSync` + regex parser of `sportRegistryCasual.ts` in `badmintonFlow.verify.test.ts` once the parity test covers all sports.

## Consequences

- **Positive:** Single edit point for template metadata; drift becomes a compile/test failure, not silent gate skew.
- **Positive:** Aligns with `@shared/*` policy modules (`timedCustomPresets`, `officiatingLevel`, …).
- **Negative:** Backend compile depends on a path outside `Backend/src/` — acceptable; same repo, pinned in CI.
- **Follow-up:** After #16, consider migrating remaining small `Backend/src/shared/*` copies to direct `@shared` imports (out of scope for #16).

## Implementation checklist (#16)

1. Land #10 and #12 first.
2. Extract shared modules per layout above.
3. Wire BE tsconfig `@shared` alias; replace `sportRegistryCasual` body with re-exports.
4. Slim `createFlow.ts` to FE adapter.
5. Add all-sports parity test; remove badminton BE file parser.
6. Update `CREATE_TEMPLATES_MATRIX.md` backend parity section to reference `@shared/createTemplates`.
