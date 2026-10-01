/**
 * Authorization test coverage per agent tool. The registry invariant test
 * (`agentToolRegistry.test.ts`) fails when a registered tool is missing here, and the
 * integration test (`agentToolMatrix.integration.test.ts`) fails when a listed tool has
 * no cases there.
 *
 *   game-matrix     — runs the phase-0 actor × game permission matrix
 *   principal-cases — no game dimension; explicit principal/visibility cases
 *   write-matrix    — write tool: actor × game matrix at propose time AND at confirm time
 *                     (`__tests__/agentWrite.integration.test.ts`)
 *   write-cases     — write tool without a game dimension (create_game): explicit
 *                     principal cases at propose and confirm time (same file)
 *   league-read-matrix / league-write-matrix — phase-4a league-owner tools: actor × game
 *                     matrix (propose + confirm for writes) plus season/fixture principal cases
 *                     (`__tests__/agentLeagueTools.integration.test.ts`, `npm run test:agent-leagues`)
 *   admin-read-cases / admin-write-cases — `scope:'admin'` tools: hidden from non-admins,
 *                     forged calls, admin cases, confirm-time admin re-check
 *                     (`__tests__/agentAdminTools.integration.test.ts`, `npm run test:agent-admin`)
 *   roster-write-matrix — phase-4b organizer roster tools: propose + confirm matrices and
 *                     HTTP-route parity (`__tests__/agentRoster.integration.test.ts`, `npm run test:agent-roster`)
 *   booking-read-cases — phase-7a booking reads: actor × game matrix on linked bookings, own
 *                     receipts, foreign refs (`__tests__/agentBookings.integration.test.ts`,
 *                     `npm run test:agent-bookings`)
 *   booking-write-cases — phase-7c `link_booking_to_game` / `unlink_booking`: propose + confirm
 *                     guards (non-owner, hidden game, foreign ref, club mismatch, strict input),
 *                     server-only times, `bookedByUserId` (`__tests__/agentBookings.integration.test.ts`,
 *                     `npm run test:agent-bookings`)
 *   book-court-cases — phase-7d `book_court`: slotRef verify at propose + confirm (expired, tampered,
 *                     other user), connected check, game guards, live re-check, partial, receipts
 *                     (`__tests__/agentBookCourt.integration.test.ts`, `npm run test:agent-bookings`)
 *   create-with-booking-cases — slice 7d2 `create_game_with_booking`: create guard refused, both
 *                     paths happy, booking fails → nothing created, create fails after booking →
 *                     partial + handoff, partial courts, client post-step validation, critical
 *                     (`__tests__/agentCreateGameWithBooking.integration.test.ts`, `npm run test:agent-bookings`)
 *   slot-read-cases — phase-7b `find_available_slots`: club eligibility, slotRef bound to the
 *                     searcher, confidence per provider (`booking/slotEngine/__tests__/slotEngine.test.ts`,
 *                     `npm run test:agent-slots`)
 *   cancel-game-cases — phase-7e `cancel_game`: actor × game matrix at propose and confirm time,
 *                     HTTP-delete parity (CancelledGame row), results / child games, previews
 *                     (bets, bookings stay active, shared bookings), `cancelBookings` refusal,
 *                     critical tier (`__tests__/agentCancelGame.integration.test.ts`,
 *                     `npm run test:agent-cancel-game`); slice 7g: the with-bookings client plan and its
                     post-step (all cancelled → deleted; partial → kept + unlinked; delete fails)
 *   cancel-booking-cases — slice 7g `cancel_booking`: booker only, foreign ref 404, Weltner / Nspadel
                     refused with a handoff, started refused, client plan from the server row,
                     post-step unlink + mirror CANCELLED, critical (`__tests__/agentCancelBooking.integration.test.ts`,
                     `npm run test:agent-bookings`)
 *   weather-read-cases — slice 9d `get_weather`: actor × game view matrix, day forecast / archive via a
 *                     faked Open-Meteo, unknown city, strict input (`__tests__/agentWeather.integration.test.ts`,
 *                     `npm run test:agent-weather`)
 *   game-chat-read-cases / game-chat-write-cases — slice 9c `summarize_game_chat` / `post_to_game_chat`: access parity with the
 *                     chat API (actor × game), injection data-only shape, post through the app's
 *                     send path, refusals, confirm re-auth (`__tests__/agentGameChat.integration.test.ts`,
 *                     `npm run test:agent-chat`)
 *   results-read-cases / results-write-cases — slice 9b `get_game_results` / `enter_match_score` /
 *                     `finish_results`: visibility + `canModifyResults` parity with the results routes,
 *                     forbidden entity types, stale `baseVersion`, critical finish
 *                     (`__tests__/agentResults.integration.test.ts`, `npm run test:agent-results`)
 *   money-read-cases / money-write-cases — Phase 10 cost split tools: visibility + `getGameCostSummary`
 *                     parity with `GET /games/:id/cost-shares`, `/transactions/owed` and `/wallet`, league
 *                     season price, 7-day guard; `list_cost_shares` (10h): season owner/admin vs refused
 *                     player/stranger, organizer scope, states / totals / payer views, no rows for unsplit
 *                     games, per-currency totals, row parity with `get_game_cost`; writes `mark_my_share_paid` / `confirm_share_received` /
 *                     `pay_my_share_with_coins` / `remind_unpaid_shares`: propose + confirm parity with the
 *                     cost-share POST routes, `set_game_price` with `PUT /games/:id`; stale cards, trainer /
 *                     season owner, frozen, coins (critical, `expect`), price locks and escalation, cooldown
 *                     (`__tests__/agentMoney.integration.test.ts`, `npm run test:agent-money`)
 *   web-read-cases — Phase 13 `web_search` / `web_fetch`: hidden without keys / kill switch, forged
 *                     calls, strict input, personal-data refusal, per-run / per-day / global / budget
 *                     limits, audit rows, URL allowlist, taint (`__tests__/agentWeb.integration.test.ts`,
 *                     `npm run test:agent-web`)
 */
export type AgentToolCoverageKind =
  | 'game-matrix'
  | 'principal-cases'
  | 'write-matrix'
  | 'write-cases'
  | 'league-read-matrix'
  | 'league-write-matrix'
  | 'admin-read-cases'
  | 'admin-write-cases'
  | 'roster-write-matrix'
  | 'booking-read-cases'
  | 'booking-write-cases'
  | 'book-court-cases'
  | 'create-with-booking-cases'
  | 'slot-read-cases'
  | 'cancel-game-cases'
  | 'cancel-booking-cases'
  | 'play-intent-read-cases'
  | 'play-intent-write-cases'
  | 'game-chat-read-cases'
  | 'game-chat-write-cases'
  | 'weather-read-cases'
  | 'results-read-cases'
  | 'results-write-cases'
  | 'money-read-cases'
  | 'money-write-cases'
  | 'web-read-cases';

export const AGENT_TOOL_AUTHZ_COVERAGE: Record<string, AgentToolCoverageKind> = {
  list_my_games: 'game-matrix',
  search_games: 'game-matrix',
  get_game: 'game-matrix',
  get_league_season: 'game-matrix',
  get_league_standings: 'game-matrix',
  search_clubs: 'principal-cases',
  get_club: 'principal-cases',
  list_cities: 'principal-cases',
  search_players: 'principal-cases',
  get_player: 'principal-cases',
  update_game: 'write-matrix',
  invite_players: 'write-matrix',
  join_game: 'write-matrix',
  leave_game: 'write-matrix',
  create_game: 'write-cases',
  get_league_schedule: 'league-read-matrix',
  reschedule_league_fixture: 'league-write-matrix',
  send_league_round_start_message: 'league-write-matrix',
  admin_find_users: 'admin-read-cases',
  admin_get_user: 'admin-read-cases',
  admin_list_pending_events: 'admin-read-cases',
  admin_update_user_flags: 'admin-write-cases',
  admin_update_game: 'admin-write-cases',
  admin_approve_event: 'admin-write-cases',
  admin_decline_event: 'admin-write-cases',
  remove_participant: 'roster-write-matrix',
  set_game_admin: 'roster-write-matrix',
  accept_from_queue: 'roster-write-matrix',
  decline_from_queue: 'roster-write-matrix',
  set_trainer: 'roster-write-matrix',
  list_my_bookings: 'booking-read-cases',
  link_booking_to_game: 'booking-write-cases',
  unlink_booking: 'booking-write-cases',
  book_court: 'book-court-cases',
  create_game_with_booking: 'create-with-booking-cases',
  find_available_slots: 'slot-read-cases',
  cancel_game: 'cancel-game-cases',
  cancel_booking: 'cancel-booking-cases',
  get_my_play_intent: 'play-intent-read-cases',
  list_play_intent_matches: 'play-intent-read-cases',
  set_play_intent: 'play-intent-write-cases',
  cancel_play_intent: 'play-intent-write-cases',
  summarize_game_chat: 'game-chat-read-cases',
  post_to_game_chat: 'game-chat-write-cases',
  get_weather: 'weather-read-cases',
  get_game_results: 'results-read-cases',
  enter_match_score: 'results-write-cases',
  finish_results: 'results-write-cases',
  list_my_cost_balances: 'money-read-cases',
  get_game_cost: 'money-read-cases',
  get_my_wallet: 'money-read-cases',
  list_cost_shares: 'money-read-cases',
  mark_my_share_paid: 'money-write-cases',
  confirm_share_received: 'money-write-cases',
  pay_my_share_with_coins: 'money-write-cases',
  set_game_price: 'money-write-cases',
  remind_unpaid_shares: 'money-write-cases',
  web_search: 'web-read-cases',
  web_fetch: 'web-read-cases',
};
