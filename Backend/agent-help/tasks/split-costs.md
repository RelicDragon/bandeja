---
id: split-costs
audience: [player, organizer, season_admin, trainer, admin]
requires: []
related: [create-game, create-league-season, create-training, roles, ui-map]
verified_against: [Backend/src/services/gameCost/costSharePermissions.ts, Backend/src/services/gameCost/gameCost.service.ts, Backend/src/services/gameCost/costShareMath.ts, Backend/src/services/agent/tools/money.tools.ts, Backend/src/services/agent/tools/costShares.tools.ts, Frontend/src/components/GameDetails/roster/GameRoster.tsx, Frontend/src/components/GameDetails/roster/RosterYouCard.tsx, Frontend/src/components/GameDetails/roster/RosterMoney.tsx, Frontend/src/components/GameDetails/roster/useRosterCost.ts, Frontend/src/components/GameDetails/cost/CostSettleSheet.tsx, Frontend/src/components/GameDetails/GameInfo.tsx, Frontend/src/components/GameDetails/EditGameInfoModal.tsx, Frontend/src/components/GameDetails/editGameInfo/PriceTab.tsx, Frontend/src/components/createGame/PriceSection.tsx, Frontend/src/components/wallet/WalletOwedSections.tsx, Frontend/src/features/cost/costViewModel.ts, Frontend/src/pages/GameDetailsShell.tsx, Frontend/src/pages/Profile.tsx, Frontend/src/i18n/locales/en/cost.json, Frontend/src/i18n/locales/en/createGame.json, Frontend/src/i18n/locales/en/gameDetails.json, docs/domains/economy.md, docs/domains/agent.md]
---
# Split a game's cost and settle up

## Goal

Record who owes what for a game (usually the court) and who has paid. The app is a ledger only: it never moves real money, there is no card or bank payment. Players pay the organizer outside the app (cash, transfer, a payment app) and mark it; the organizer confirms. Paying with in-app coins is possible only where the platform has switched it on (off by default).

## Who can do this

- **Set or change the price**: the game's owner or game admins (for a league fixture also the season's owner and admins). Not after results entry has started, and not on an archived game.
- **See the split**: players with status playing, the game's owner and admins, and platform admins. People on the waiting list, invitees, chat guests and non-playing participants do not see it.
- **What each person sees**: an ordinary player sees only their own share plus how many players have settled. Organizers and the payer see every player's amount, the total and what is still outstanding.
- **Owe a share**: only players who are playing. The trainer of a training is not playing and owes nothing. Waiting list, invitees and guests owe nothing.
- **The payer** (the person who fronted the money) is the game owner; for a league fixture without an owner, the season owner. The app has no control to change the payer. The payer's own share counts as settled automatically.
- **Mark own share paid**: any player with a share, except the payer.
- **Confirm received, undo it, remind unpaid players, edit one player's amount**: the game's owner and admins (a training's trainer is a game admin), a league season's owner and admins for its fixtures, and platform admins. The payer can also confirm and remind. A player can never confirm their own payment.
- **League season price**: the season's owner or admins, in the app only (season page). Fixtures left at "Not Known" use the season's price.

To get organizer rights, create the game yourself or ask its owner to make you a game admin.

## Steps in the UI

### Set the price (organizer)
1. When creating: in the "Settings & details" step, find the "Price"{createGame.price} section. On an existing game: open the game, tap the price line in the info card (it reads "Price not set"{createGame.priceNotSet} when empty) to open "Edit details" on the "Price"{gameDetails.editTab.price} tab.
2. Pick the "Price Type": "Total"{createGame.priceTypeTotal}, "Per Person", "Per Team", "Free"{createGame.priceTypeFree} or "Not Known".
3. Enter the "Price Amount" and pick the "Currency".
4. Under "How to pay you", tap "Add a way to pay" and choose a method (Bizum, bank transfer, cash, "Something else" and so on), then fill its details. Up to 3 ways. Players see these when they settle.
5. Save. The split appears on the game page as soon as at least one player is playing.

Saved defaults for new games: Profile → "Saved payment details".

### League season price (season owner or admin)
1. Open the league season page, "General"{gameDetails.general} tab.
2. Tap the price line in the info card → "Edit details" → "Price"{gameDetails.editTab.price} tab, set the price type, amount and currency, and save.
3. Each fixture priced "Not Known" now splits by the season's price and uses the season's payment details.

### Where the split shows
On the game page, inside the "Participants"{games.participants} card. Your own card shows "Your share", the amount, its state ("Unpaid"{cost.state.unpaid}, "Marked paid" or "Settled"), and who to pay. Organizers also see each player's amount pill, the total and a line like 2 of 4 settled · €10 outstanding. After results are in (and on league fixtures) the card turns into a compact payment list.

### Pay your share (player)
1. On the game page, in your card in "Participants"{games.participants}, tap "I paid".
2. The sheet "How did you pay?" shows the amount, who to pay and their payment details ("Copy"{cost.sheet.copy} copies one).
3. Tap "Outside the app" if you paid by cash, transfer or an app. Your share becomes "Marked paid" until the organizer confirms.
4. If shown, tap the coins option to send coins instead: the share is settled at once.

Shortcut: Profile → tap your coin balance → "Wallet"{wallet.title}. Under "Owed" tap "Settle"{cost.wallet.settle} to jump straight to the payment sheet; "Owed to you" lists what others owe you ("View"{cost.wallet.view}).

### Confirm received (organizer or payer)
1. On the game page, in "Participants"{games.participants}, tap a player's amount pill. It toggles between received ("Settled") and not received.
2. Tapping it again undoes the confirmation. Confirming works even if the player never tapped "I paid".

### Remind unpaid players (organizer or payer)
Tap "Remind unpaid" in the "Participants"{games.participants} card. Every player who has not settled gets a notification. Once per game every 24 hours. The app also sends one automatic reminder between 1 and 7 days after the results are final.

### Change one player's amount (organizer)
1. Tap ⋮ on the player's row → "Edit {{name}}'s share".
2. Enter the "Amount"{cost.amountLabel}. Leave "Split remainder evenly" on so the others cover the difference and the total still adds up.
3. Tap "Save"{cost.save}.

## Settings that matter

- **"Total"{createGame.priceTypeTotal}**: the amount is the whole game's cost, split evenly between playing players. Cents that don't divide go to the payer.
- **"Per Person"**: everyone playing owes that amount (game total = amount × players).
- **"Per Team"**: shown on the game, but no split is created.
- **"Free"{createGame.priceTypeFree}** and **"Not Known"**: no split. Exception: a league fixture at "Not Known" uses its season's price.
- **Currency and amount**: no currency or an amount of 0 means no split.
- **Roster changes**: when someone joins or leaves, the shares are recalculated (manually edited amounts stay). A player who leaves drops out of the split; a coin payment goes back to them.
- **Final results**: when results become final the amounts are frozen ("Shares fixed at final score"). After that amounts cannot be edited, but paying, confirming and reminding still work.
- **Old games**: a game that ended more than 7 days ago with no split never gets one.
- **Coins**: the coin option appears only when the platform has set a coin rate (off by default), there is a payer, and you have enough coins. A coin payment can't be marked unpaid; it is returned automatically if you leave, are removed, the price is removed or the game is deleted.

## Common mistakes

- **No cost section at all**: the price type is "Per Team", "Free"{createGame.priceTypeFree} or "Not Known"; no currency or amount; nobody is playing yet; it is a league season page (fixtures have splits, the season itself doesn't); or you are on the waiting list, invited, a guest or not playing.
- **I can't see the other players' amounts**: ordinary players only see their own share and the settled count.
- **No "I paid" button**: you are the payer (your share counts as settled), you already paid, or you have no share (not playing, or you are the trainer).
- **Can't change the price**: you are not the owner or a game admin, results entry has already started, or the game is archived. For a league fixture or season, the price is set in the app by the season organizers.
- **Can't edit amounts**: the shares are frozen at final results, or you are not an organizer.
- **"Remind unpaid" is greyed out**: a reminder was sent in the last 24 hours ("You can nudge again in about {{hours}} h"). It is not shown at all once everyone has settled, or to someone who is neither organizer nor payer.
- **Can't untick a player who paid with coins**: coin payments are final.
- **No coin option**: coins are not enabled on the platform, you don't have enough, or the share is already settled.
- **Can't change who the payer is**: the app has no control for that; it is always the owner.
- **A player says they paid but shows "Unpaid"{cost.state.unpaid}**: they haven't tapped "I paid"; the organizer can still confirm them directly.

## What the assistant can do

- `get_game_cost`: the split for one game (only what the user may see), with the reason when there is none.
- `list_my_cost_balances`: what the user owes and what is owed to them, across games.
- `list_cost_shares`: organizer overview across games they run or a league season they manage (by player, totals, payer view).
- `get_my_wallet`: coin balance and whether coins can pay shares.
- `mark_my_share_paid`: mark the user's own share paid outside the app.
- `confirm_share_received`: confirm (or undo) one player's payment, organizer or payer only.
- `pay_my_share_with_coins`: pay the user's own share with coins (always asks for confirmation).
- `set_game_price`: set or change the price of a casual game, tournament, training or bar event. Never a league fixture or season.
- `remind_unpaid_shares`: nudge unpaid players (24-hour limit applies).

Only in the app: league season and league fixture prices, payment methods and their details, editing one player's amount, changing the payer. The assistant never sees payment details such as IBANs or phone numbers; it links the user to the game's cost section instead.
