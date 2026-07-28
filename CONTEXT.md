# PadelPulse

Multisport game scheduling and league competition.

## Language

### League season (fixed teams)

**Team withdrawal**:
A franchise (`LeagueParticipant` of type TEAM) leaving the remaining regular-season competition while staying on the standings for history.
_Avoid_: DNS, remove from group, delete participant, forfeit (alone)

**Technical win**:
An automatic match/fixture win awarded to the opponent of a withdrawn team for an unfinished regular-season fixture.
_Avoid_: walkover (prefer for playoff bracket only unless shared implementation), WO as product copy unless UI needs it

**Technical loss**:
The corresponding automatic loss recorded for the withdrawn team on that unfinished fixture.
_Avoid_: technical loose

**Played result**:
A fixture outcome already decided before withdrawal; it is kept and not rewritten when the team withdraws.
_Avoid_: annulled result, retroactive walkover

**Neutral technical result**:
A technical win/loss that updates W/L (and standings points from those) but adds no set/game score delta and applies no rating / level change.
_Avoid_: scored walkover, rated forfeit

**Standings place**:
Ordinal among active (non-withdrawn) participants only; withdrawn rows appear after them with no place.
_Avoid_: rank including withdrawn, hidden withdrawn row

**Unfinished fixture**:
A regular-season fixture whose `resultsStatus` is not FINAL; on team withdrawal it is overwritten with a neutral technical result for the opponent.
_Avoid_: leaving IN_PROGRESS for manual finish

**Withdrawal finality**:
Team withdrawal is irreversible in product; technical results stay FINAL.
_Avoid_: undo withdraw, reopen technical fixtures

**Withdrawal scope (rounds)**:
Withdrawal auto-settles unfinished REGULAR fixtures only; PLAYOFF slots are out of scope for this action.
_Avoid_: auto playoff walkover on withdraw, blocking withdraw after bracket

**Withdrawal eligibility**:
Only TEAM participants in fixed-team league seasons.
_Avoid_: USER withdrawal, singles forfeit via this flow

**Withdrawal authority**:
Season editors with the same permission as mid-season player swap (`canEditGame`).
_Avoid_: player self-withdraw, admin-only gate

**Results vs withdrawn**:
Fixtures against a withdrawn team (played or technical) remain full standings inputs for active teams — wins, H2H, and mini-table.
_Avoid_: annulling games vs withdrawn for ranking
