# FAQ translation gauntlet

## Execution prompt

Implement the FAQ translation plan end to end. Compare the actual result against Bandeja's existing GameTextTranslationsPanel and gameTextTranslationQueue implementation, with the FAQ plan's acceptance cases as the measurable bar. Use parallel Sol builders for independent pieces. After they finish, give separate harsh critics fresh context and the actual code and rendered UI. Critics must identify concrete failures in permissions, concurrency, durability, translation fidelity, accessibility and usability. Repair findings and repeat criticism and verification until there are no unresolved release-blocking defects. Do not substitute a builder's self-assessment for independent review. Keep this progress document current and report any verification that the environment prevents.

## Progress

- Planning/reference inspection: complete.
- Backend builder (Sol): persistence, API, worker and reader-authorized on-demand requests complete and verified.
- Frontend builder (Sol): modal, reader language selector, asynchronous progress and recovery complete and verified.
- Translation engine builder (Sol): complete; deterministic provider tests passing.
- Independent critics: both cross-review cycles passed after repairs. Each critic reviewed a subsystem they did not build; the lead also inspected the live browser output.
- Integration and verification: 22 FAQ interaction tests plus 64 locale checks, isolated backend suite, both type checks and targeted lint passed. Desktop/mobile/keyboard and real Spanish, Czech and English checks passed. Disposable fixture removed after screenshots; existing E2E user preserved.

## Repair loop

- Round 1 integration review: tightened worker lease expiration, crash-attempt limits and shutdown; restored superseded job reuse across source-setting changes; aligned unique-index migration name.
- Round 1 UX critic: repaired draft-source/status mismatch, late status-read/write race, premature unavailable copy, and inaccessible disabled explanation.
- Round 2 independent critics: repaired close/reopen loading and preference races with deferred-response regression tests and request/preference ownership guards. Fixed oversized all-language batches permanently rejected by queue cap.
- Translation fidelity repairs: guard partial unchanged short prose, retain neutral technical tokens, validate Serbian Latin/Simplified Chinese even for same-language output, and handle Indonesian/Hindi/Thai beyond the chat detector's language coverage.
- Backend verification: named migration applied only to local development database; isolated-schema translator/DB integration suite and backend type check passed. No FAQ migration/schema drift.
- Frontend verification: 11 FAQ interaction tests plus 64 locale checks, targeted lint and type check passed before the reader expansion.

## Reader expansion

User requested flags, an FAQ language selector defaulting to their app language, and automatic generation when selecting an untranslated language. Preserve readable originals while a polite progress message explains the wait, then update in place. Add explicit Original, recovery/retry, and bounded polling. Reader requests must reuse work and never mutate organizer preferences. Shared flag/native-name presentation must remain accessible with text labels. Independent review will challenge rapid language changes, missing preferences, offline recovery, authorization, duplicate work and mobile layout.

- Backend extension: reader authorization, single-locale requests, deduplication, explicit retries, and preference preservation implemented; isolated integration tests passed. Fixed absent-preference normalization in the worker so first-time reader requests can publish.
- Frontend extension: language selector, asynchronous reader state, shared flags and modal polish implemented. Reconnect refresh, status-read/request ownership, failed final-read recovery, built-in language tags and manual/app-locale reselection recovery repaired with deferred-response regressions.
- Completion bar: ready status must be followed by a fresh localized FAQ read; late results for another language/game must be ignored; request failures must not trigger an automatic submission loop.
- Backend critic: idle queue admission still needed a finite batch ceiling. Added a 1,000-new-job ceiling while retaining the 253-job all-language case and idempotent reuse; reject-before-write integration test passed.
- Live browser finding: an unchanged English FAQ pair falsely failed the language validator. Added a narrow high-confidence short-English fallback and exact-source mocked-provider regression; the same source still rejects false Spanish passthrough. Retries remain explicit.
- Visual review: flag cards, native labels, selected-target accents and compact readiness labels improve the organizer modal; removed unlocalized implementation notes from language rows.
- Live final check: Czech reader demand displayed pending with originals, then both translated pairs without navigation. Original retained expanded answers. Mobile width/scroll width both 390px. English no-change retry completed successfully. Saved desktop/mobile screenshots.
- Navigation follow-up: organizer direct FAQ links initialize FAQ tab visibility independently of the General editor. Scalar dependencies, authentication readiness and editor revision ownership prevent premature routing or an old count read overwriting a newer edit. Shell lint/type checks passed; independent review findings addressed.

Status: complete. All requested local implementation and verification finished. No production deployment or commit.

## Shared API contract

GET `/faqs/game/:gameId/translations` returns the usual `{ success, data }` wrapper. `data` is `{ generationEnabled: boolean, selectedLocales: string[], sourceLocaleOverride: string | null, snapshot: string, faqCount: number, locales: Array<{ locale: string, ready: number, pending: number, failed: number, stale: number, missing: number }> }`.

POST the same URL (or `/retry`) with `{ targetLocales: string[], sourceLocaleOverride: string | null, expectedSnapshot: string }`. Return 202 with the same status DTO; validation errors 400, stale snapshot 409, disabled 503, capacity/rate limit 429.

GET FAQ original DTOs stay unchanged, adding optional `sourceRevision: number` and `localizedText: { locale: string, question: string, answer: string, state: 'original' | 'translated' }`. Request locale explicitly with `?locale=`. Original editor never seeds translated content.

Translator contract: `translateFaqPair({ question, answer, targetLocale, sourceLocaleOverride, userId? }): Promise<{ question: string; answer: string; noChange: boolean }>` in `Backend/src/services/faq/faqTranslator.service.ts`. Export `FAQ_TRANSLATION_POLICY_VERSION = 1`. It throws on malformed/invalid outputs. Queue builder owns everything else under Backend except this translator and its tests.
