# Not shipped / manual-only

Source: former `docs/APP_FUNCTIONALITY.md` §40 plus `Frontend/src/App.tsx` comments.

| Item | Notes |
|------|-------|
| `/rating` route | `App.tsx` comments out `Rating` lazy import and `<Route path="/rating" …>`. No user-facing rating page. |
| `/welcome` | Route exists but is `<Navigate to="/" replace />`. Not a real onboarding page. |
| SPA `/link-to-app` | React route only redirects to `/` or `/login`. QR UI is static `Frontend/public/link-to-app/index.html` at `/link-to-app/`. |
| Virtual goods shop UI | `Backend/src/routes/goods.routes.ts` + `PURCHASE` transactions. No in-app catalog browser in `App.tsx`. |
| External wallet top-up | No payment-provider checkout. Coins enter via admin `NEW_COIN`, bet payouts, P2P `TRANSFER`, or API `PURCHASE`. |
| Full Capacitor OAuth matrix | Apple Sign-In iOS; Google web + Android. Device matrix is manual QA. |
| Telegram OTP / bot flows | `/start` `/auth` `/login` `/my` `/games` in `Backend/src/services/telegram/bot.service.ts`. Manual unless the test env provides deterministic keys. |
| Every sport × template combo | Sample in QA; full set in `Frontend/shared/createTemplates.ts` + `Frontend/src/sport/createTemplates.parity.test.ts`. |
| Holland auction edge timing | Scheduler-driven; manual verification on slow clocks. |
| Watch standalone without phone | `Frontend/ios/App/BandejaWatch Watch App/`. Requires paired iPhone + same account. |
