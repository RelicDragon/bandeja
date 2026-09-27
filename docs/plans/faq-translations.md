# FAQ translations

Status: implemented and reviewed, including reader language selection and on-demand generation. See [verification progress](faq-translations-progress.md).

## Product behavior

Add a **Translate FAQ** button to the top of the organizer FAQ card, beside Create. Keep it available when the FAQ list is collapsed. On narrow screens let the action row wrap. The action covers all saved custom questions and answers for this game/season.

Disable it when there are no saved custom FAQs, while the initial load is pending, or while a create/edit form has unsaved changes. Explain the disabled state: “Add a question first” or “Save your changes before translating.” The built-in fixed-team standings FAQ already uses app translations and is excluded from generation and counts.

### Modal

- Title: **Translate FAQ**.
- Description: “Translate all saved questions and answers. Players will see their app language when available.”
- Source language: **Detect automatically** by default; optional explicit source-language override. Automatic detection applies to each question/answer, so mixed-language originals remain supported.
- Target languages: labeled checkboxes sourced from `APP_UI_LANGUAGES`, with flags, native language names, Select all / Clear selection and a selected count.
- Initial selection: all 11 app languages. English, Russian, Serbian Latin, Spanish, Czech, Arabic, Simplified Chinese, Indonesian, Hindi, Thai, Japanese. If an explicit source language is chosen, remove it from the targets; with automatic detection, let the translator return a validated same-language result.
- Reopening uses the last successfully submitted selection for this game, saved on the server. Opening, toggling, or cancelling never starts generation or changes saved preferences.
- Primary action: **Translate to {count} languages**. Disabled for zero targets, offline state, submission in progress, or generation unavailable. Show the number of saved questions covered before submission.
- Show nonzero per-language counts: ready, pending, failed, needs update and not translated. Counts describe the saved source setting; when changing the source, explain that accurate counts return after submission. Current translations are reused; the action queues only missing, stale, or failed work.
- After submission, keep the modal open and show progress. Closing is allowed: “Translation continues in the background.” Reopening restores server progress. Offer **Retry failed translations** when relevant.
- Use the existing modal/back-button patterns, focus trapping and restoration, Escape, accessible checkbox labels and live progress announcements, mobile scrolling, safe areas, dark mode, and RTL support.

Organizer targets default to all languages. The reader language selector defaults to the user’s resolved app language and offers all supported languages plus Original. Reader choice is local to FAQ viewing; it never changes app language or the organizer’s saved targets.

### Reader and editor display

Keep original `question` and `answer` intact. The editor always edits originals. The reader uses a current translation matching their selected locale, otherwise the original. On initial load or language selection, request missing/stale translation asynchronously; show “Translating into {language}…” with a short waiting explanation while originals remain readable. Poll until ready and update complete pairs in place. Explicit Original never generates work. Ready targets are reused; failed jobs require a user retry. Offline/unavailable/long-running work retains originals and offers recovery. Publish question and answer together for one FAQ/language; never show a translated question with a failed translated answer.

Provide a quiet **Show original / Show translation** control when a different translated pair is available. Set `lang` and `dir="auto"` appropriately. Refetch when the selected language changes; localize built-in standings content with that selected language; translations do not alter FAQ order, IDs, or expansion state.

Saving a changed question or answer invalidates that FAQ’s translated pairs immediately. Old translated content must not remain visible. Show “Needs update” in the organizer modal and regenerate when an organizer submits again or a reader requests that language. New questions follow the same on-demand rule. Reordering does not invalidate translations. Deleting a FAQ cascades to its translations and jobs. This is a one-shot bulk action, not an automatic ongoing translation subscription.

## Existing implementation and reuse

- `Frontend/src/components/GameDetails/FaqEdit.tsx` owns the organizer card; `FaqTab.tsx` renders reader questions.
- `Frontend/src/api/faq.ts` and `Frontend/src/types/index.ts` both define FAQ shapes; consolidate or keep their additive DTOs aligned.
- `Backend/src/routes/faq.routes.ts`, `controllers/faq.controller.ts`, and `services/faq/faq.service.ts` currently implement original-only CRUD.
- `GameFaq` has no translation storage. A backend change and named Prisma migration are required.
- `packages/app-locale` supplies the supported language list and Serbian/Chinese script requirements.
- Existing game-text translation code supplies patterns for durable jobs, leases, source revisions, structured output, validation, usage logging, and locale resolution.
- `GameTextTranslationsPanel` supplies modal and bounded polling patterns. Its API and persistence are specific to game name/description; do not pretend a FAQ question is a game title or attach FAQ work to a game-title job.

## Persistence

1. Add `GameFaq.sourceRevision Int @default(1)`. Increment atomically only when original question or answer actually changes, not on reorder or no-op saves.
2. Add `GameFaqTranslation`: FAQ foreign key with cascading delete, locale, source revision, translation policy version, translated question, translated answer, same-language metadata, timestamps; unique `(faqId, locale)`. Store a successful same-language outcome without mislabeling it as a changed translation.
3. Add `GameFaqTranslationJob`: FAQ foreign key with cascading delete, target locale, source revision, policy version, source override, original-text snapshot, requester for usage attribution, status, attempts, next attempt time, lease owner/expiry and fencing token, error category, timestamps. Use a unique deterministic request identity covering FAQ/revision/locale/policy/source override. Failed rows can be reset by an authorized explicit retry; duplicate requests reuse active or completed work.
4. Add game-scoped FAQ translation preferences: selected locales and optional source-language override, updated only on accepted submission. Absence means all languages and automatic detection. Selection changes do not delete existing translations.

Use a dedicated FAQ translation policy version. Make source override part of validity as well as job identity, so switching an override cannot reuse an incompatible result.

## API contract

All endpoints authenticate. Editor bulk submission and retry use the same game-edit authorization as FAQ creation/reordering, including parent-season and platform-admin rules; archived games are blocked by that gate. Readers follow the existing signed-in game-detail direct-link visibility, including system-game and pending-Event restrictions. In this product, an unlisted/private game is still viewable by direct link; FAQ reads must not introduce a participant-only restriction.

- `GET /faqs/game/:gameId`: retain original fields; add an optional locale-resolved `localizedText` containing question, answer, locale, sourceRevision and state. Use the existing request-locale resolver and explicit locale from the client. Old clients remain compatible.
- `GET /faqs/game/:gameId/translations`: reader-authorized capabilities, saved preferences, source snapshot token, and per-language/per-FAQ status and counts. The snapshot token covers the saved FAQ set and content revisions, not ordering.
- `POST /faqs/game/:gameId/translations`: `{ targetLocales, sourceLocaleOverride: null | locale, expectedSnapshot }`. Validate a nonempty, deduplicated app-language allow-list; validate override and source size. Reject stale snapshots with 409 and refresh the modal rather than unexpectedly translating newly edited content. Transactionally save preferences and enqueue missing/stale/failed pairs; return 202 plus queued/reused counts and status.
- `POST /faqs/game/:gameId/translations/retry`: same validation and snapshot contract; queue only failed pairs among selected targets.
- `POST /faqs/game/:gameId/translations/request`: reader-authorized `{ locale, retry?: boolean }`, one supported language, current source snapshot captured transactionally and saved override respected. Never mutate organizer preferences. Reuse current/pending work, queue missing/stale work, and restart failed jobs only for explicit retry. Archived originals remain unchanged while derived translations can be generated.

Set an explicit shared question/answer size limit for translation (5,000/20,000 characters), validate before queueing, and report any oversized existing originals by FAQ ID. Do not truncate. Rate-limit generation/retry per user and game; cap active jobs and return an actionable busy response without half-saving preferences. An idle queue may accept one larger batch, capped at 1,000 new jobs; reject larger requests before writing anything. Never hold a database transaction open during an AI call.

## Translation execution and consistency

Create a FAQ-specific translator that submits one structured question/answer pair per locale. Reuse the existing AI provider and accounting. Extract only genuinely reusable language/preservation validators from game-text modules; preserve existing title/description behavior and tests.

The prompt treats authored text as data, preserves meaning, line breaks, URLs, numeric facts and names, and specifies Serbian Latin and Simplified Chinese. Validate the complete structured pair, language, size, preserved facts, and same-language claims before publishing. Unsupported output fails the pair rather than creating a partially ready translation.

Run durable work in the existing worker lifecycle with bounded concurrency, finite retries/backoff and lease recovery. Register a dedicated FAQ queue and configuration rather than widening game-name/description database types. Add an explicit FAQ generation enable flag and expose availability to the modal; reads of existing translations continue when generation is disabled.

Before publishing, transactionally verify current FAQ revision, policy/source override, job lease token, and FAQ existence. A stale or deleted source supersedes the job; it cannot overwrite a current result. Recheck mutation authority before accepting work; publication is a service operation against an already accepted source snapshot.

Use bounded polling while organizer or selected reader-language work is pending, plus focus/reconnect refetch. Refresh reader FAQs on selected-locale changes and ignore stale requests after language/game switches. Immediate cross-client socket delivery is outside the first version; do not reuse game-text invalidations without adding FAQ-aware consumers. Closing the modal or restarting the server must not lose work.

## Delivery sequence

1. Shared FAQ DTOs, language/default-selection helper, named migration, source revision handling and locale resolver.
2. FAQ translator, durable job service and worker registration, guarded publication, enable flag and usage reason.
3. Authorized status/submit/retry APIs and additive localized GET; locale-aware frontend API.
4. Header action and modal, selection persistence, source override, progress/error/retry states.
5. Reader translation rendering and original toggle; preserve original editing and built-in FAQ localization.
6. Automated verification, manual UI coverage, and documentation in `docs/domains/games.md` and `docs/UI_TEST_PLAN.md`.

Each slice includes its relevant tests. Existing data requires no generation backfill: translations start when an organizer requests them or a reader opens/selects an untranslated language. Deploy additive storage/backend before the UI.

## Acceptance and verification

- Owner/admin and parent-season permissions succeed; unauthorized users and archived edits fail. FAQ reads match the existing direct-link visibility of game details.
- All targets are initially selected; explicit source is excluded; empty selection cannot submit; accepted selection survives reopening and another device.
- Unsaved drafts are preserved and cannot accidentally become translation input. Built-in standings FAQ is excluded.
- Two simultaneous submissions deduplicate; disconnect/restart resumes jobs; failed targets do not undo successful targets; retry does not redo current successes.
- Source edits during generation, delete during generation, stale snapshots, expired leases and source-override changes cannot publish stale content. Reorder creates no new work.
- Reader locale resolution handles `auto`, regional tags and unsupported locales through existing normalization; Arabic layout and pinned scripts render correctly.
- Readers fall back to current originals for missing/stale/failed translations; editing always opens originals; old API clients still work.
- Translation validation rejects malformed pairs, missing facts and false same-language output; no live paid AI calls in automated tests.
- UI tests cover button placement/collapsed card, modal keyboard/back behavior, narrow screens, dark mode, loading/offline/unavailable states, partial failure, reopening and locale changes.
- Run focused frontend/backend FAQ suites and affected game-text/locale regressions, then repository lint and type checks. All heavy work uses serialized npm scripts or `scripts/run-heavy`; never overlap two heavy commands in one lane.

Verification: 22 focused frontend tests and 64 locale checks, isolated-schema backend integration and mocked translator tests, TypeScript checks, targeted lint, and browser desktop/mobile/keyboard checks. Live Spanish bulk translation and Czech reader-requested translation of two disposable FAQ pairs completed through the real API/worker; localized reads preserved times and court numbers and left originals unchanged. English same-language validation was repaired against a live finding and verified with a deterministic regression and live retry. The reader updated automatically, Original preserved expansion, and the 390px layout had no horizontal overflow. The named migration was applied locally. No production deployment.
