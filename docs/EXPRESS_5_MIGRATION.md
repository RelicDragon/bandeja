# Express 5 migration audit & plan

GitHub issue: [#87 — Deps: Backend migrate Express to v5](https://github.com/RelicDragon/bandeja/issues/87)

**Status (2026-06-11):** Unblocked (#73 closed). Backend on **Express 4.22.2** / **@types/express 4.17.x**. Work not started.

---

## 1. Inventory

| Area | Count / state |
|------|----------------|
| Route files | 43 under `Backend/src/routes/` |
| HTTP route registrations | ~500 `router.(get\|post\|put\|patch\|delete)` |
| App-level routes | 4 (`/health`, `/games/:gameId`, `/webhooks`, `OPTIONS *`) |
| Controllers | ~60 files |
| `asyncHandler` usage | ~500+ wrapped handlers |
| Raw async handlers (no wrapper) | 8 exports in 3 files |
| Middleware | 6 (`auth`, `validate`, `errorHandler`, `recordPresenceActivity`, `e2eTestContext`, `authToken`) |
| Mini Express apps in tests | 1 (`adminPhotoModelRoute.test.ts`) |
| Node engine | `>=24 <25` — satisfies Express 5 (18+) |

### Dependency compatibility (current versions)

| Package | Version | Express 5 |
|---------|---------|-----------|
| `express` | ^4.22.2 | target bump |
| `cors` | ^2.8.6 | OK |
| `helmet` | ^8.2.0 | OK |
| `express-rate-limit` | ^8.5.2 | OK (`express >= 4.11`) |
| `express-validator` | ^7.3.2 | OK |
| `compression`, `morgan`, `multer` | current | OK (generic middleware) |

---

## 2. Breaking-change audit

### Clean — no action expected

| Express 5 removal | Codebase scan |
|-------------------|-----------------|
| `app.del()` | Not used |
| `req.param()` | Not used |
| `res.send(status)` / `res.send(body, status)` | Not used |
| `res.json(body, status)` | Not used |
| `res.sendfile()` | Not used |
| Regex / exotic route paths | Standard `:param` only |
| `req.query` mutation | Read-only everywhere |
| `res.redirect` | Already uses `encodeURIComponent` in OAuth |

### Needs verification

**`app.options('*', …)` in `Backend/src/app.ts`**

Express 5 uses **path-to-regexp v8** — bare `*` is invalid. Likely fix: `app.options('/*splat', …)` or rely on the `cors()` middleware below (which already handles preflight). Test CORS from file:// Admin (`Origin: null`) and normal web clients.

### Type-level (build may break)

**`AuthRequest` widens `params` / `body` / `query` to `any`** in `Backend/src/middleware/auth.ts`.

`@types/express` v5 is stricter. Fix options: use `Request<P, ResBody, ReqBody, ReqQuery>` generics, or a narrow intersection type instead of overriding core fields.

### Async error handling — mostly already safe

| Pattern | Files | Express 5 impact |
|---------|-------|------------------|
| `asyncHandler(...)` | ~60 controllers | Redundant but harmless; keep during migration |
| `try/catch` + `next(err)` | `gameTeam.controller.ts`, all `auth.ts` middleware | Compatible |
| Raw `async` + local `try/catch` | `metatags.controller.ts` | Compatible (errors swallowed locally) |
| Sync handler | `streamLogs` (SSE) | No change |

Express 5 auto-forwards rejected promises from route handlers. No mass `asyncHandler` removal required for the migration itself.

### Special endpoints to smoke-test manually

| Endpoint | Why |
|----------|-----|
| `GET /api/logs/stream` | SSE long-lived connection |
| `GET /auth/google/*` | Redirects |
| `GET /games/:gameId` | Raw HTML `res.send`, unwrapped async |
| `POST /webhooks/replicate` | JSON body parsing |
| Multer uploads (`media`, `story`, `gamePhoto`, `adminAd`) | Multipart + error handler `MulterError` branch |
| Rate-limited auth (`/api/auth/refresh`) | `express-rate-limit` + custom `keyGenerator` |

---

## 3. Migration plan

### Phase 0 — Prep (½ day)

- Branch from `main`
- Record baseline: `npm run lint`, `npm run build`, `npm run test:automated`
- Skim [Express 5 migration guide](https://expressjs.com/en/guide/migrating-5.html)

### Phase 1 — Dependency bump (½ day)

```json
"express": "^5.0.0",
"@types/express": "^5.0.0"
```

```bash
cd Backend && npm install && npm run build
```

Fix TypeScript errors — expect most in `AuthRequest` and `RequestHandler` signatures.

### Phase 2 — App bootstrap fixes (1–2 hours)

1. Fix or remove `app.options('*')` — verify preflight still works via `cors()` alone or update wildcard syntax
2. Confirm middleware order unchanged: `helmet` → CORS → `express.json` → routes → `notFoundHandler` → `errorHandler`
3. Run `adminPhotoModelRoute.test.ts` (mini app + error middleware)

### Phase 3 — Automated verification (½–1 day)

```bash
npm run lint
npm run build
npm run test:automated
```

Triage failures by category:

- Type errors → fix `AuthRequest` / handler types
- Route-not-found → path-to-regexp regression
- 500 on async routes → missing `next(err)` in middleware

### Phase 4 — Targeted manual smoke (½ day)

Priority flows:

1. Register / login / refresh / logout
2. Create game, join, chat message
3. Image upload (avatar + chat media)
4. Admin login + log stream
5. Google OAuth redirect round-trip
6. Game share link `/games/:id` (OG meta HTML)
7. Replicate webhook (or mock POST)

### Phase 5 — Optional cleanup (separate PR, not blocking #87)

- Remove redundant `asyncHandler` where Express 5 native handling suffices
- Tighten `AuthRequest` types with Express 5 generics
- Add integration test for CORS preflight + one async error path

---

## 4. Risk matrix

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| CORS preflight regression | High | Medium | Fix `options('*')`; test Admin `Origin: null` |
| `@types/express` v5 build breaks | Medium | High | Phase 1 `tsc`; fix `AuthRequest` first |
| Path matching edge case | Medium | Low | Standard `:id` routes only |
| Multer / SSE / redirect | Medium | Low | Manual smoke in Phase 4 |
| `test:automated` pre-existing failures | Low | Medium | Document vs regressions |

---

## 5. Effort estimate

| Phase | Time |
|-------|------|
| 0–2 (bump + bootstrap + types) | 1–2 days |
| 3 (automated tests) | 0.5–1 day |
| 4 (manual smoke) | 0.5 day |
| **Total** | **2–3.5 days** |

Low code churn expected — mostly dep bump, one CORS route fix, type fixes. The ~500 routes need audit-by-test, not hand-editing.

---

## 6. Issue #87 checklist

- [ ] Bump `express` ^5 + `@types/express` ^5
- [ ] Fix `app.options('*')` CORS preflight for Express 5 path syntax
- [ ] Resolve `@types/express` v5 TS errors (`AuthRequest`, handlers)
- [ ] `npm run lint` + `npm run build` pass
- [ ] `npm run test:automated` pass
- [ ] Manual smoke: auth, upload, SSE logs, OAuth redirect, `/games/:id` meta, webhook
- [ ] (Optional follow-up) Remove redundant `asyncHandler`

---

## 7. Recommendation

Proceed when there is a 2–3 day window and stable CI — not urgent, but well-scoped. The codebase is in good shape: widespread `asyncHandler`, no deprecated APIs, modern middleware already on v8. Main unknowns: CORS wildcard route and `@types/express` v5 typing friction.
