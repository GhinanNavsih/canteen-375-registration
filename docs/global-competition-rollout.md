# Global monthly competition — September 2026

From `2026-09`, all positive-point participants share one board. Prizes are
Rp50,000 / Rp25,000 / Rp15,000, with fewer prizes when fewer than three members
qualify. Tie order is points, spending, transaction count (descending), then
member ID (ascending, UTF-16 lexical order). Category is audit metadata.

The root monthly map supplies cumulative totals. Canonical member records fill
missing metadata and provide canonical-only participants; never sum both sources.
Old archive categories must come from records, not current profiles. Where an
archive has no category snapshot, the page explains why those participants
cannot be placed in a historical category.

## Finalization and vouchers

`competitionRecords/{period}` and `competitionPrizes/{period}` carry
`rankingMode` (`global` or `category`) and `winnerCount` (3 or 9, the capacity).
Absent mode defaults to category before September 2026, global thereafter.
New global documents use schema version 3; configuration stores `amountsByRank`.
Nested winner IDs are `rank_1`, `rank_2`, `rank_3`. Both implementations produce
`competition_{period}_global_{rank}_{memberHash}` with the same UTF-16 FNV hash.

September finalizes October 1 at 00:00 Asia/Jakarta. Its vouchers expire October
31 at 23:59:59 Asia/Jakarta. They retain the existing single-use claim flow and
Rp10,000 minimum transaction requirement. POS and scheduled finalization share
the period lock and deterministic IDs. A retry reads the stored result; it
does not reissue claimed vouchers. Open months and expired issuance windows
cannot be finalized.

Pre-September periods are never automatically reissued. Old rewards can exist
without a `competitionPrizes` document; POS explains that any extra issuance
requires a separate administrator reconciliation. The category algorithm is
retained for interpreting/testing legacy results. Existing vouchers remain intact.

## Deployment ownership

Only this repository deploys the scheduler, under codebase `member-registration`:

```sh
npm run build --prefix functions
firebase deploy --only functions:member-registration:distributeMonthlyRewards --project point-of-sales-app-25e2b --non-interactive
```

The POS functions directory is retired and excluded from its Firebase config.
Do not deploy that old category scheduler under the default codebase.

The live Firestore rules differ from both saved rule files, including the
administrator list. Deploy the scoped overlay to preserve unrelated permissions:

```sh
# GOOGLE_APPLICATION_CREDENTIALS must point to an authorized local credential.
node scripts/deploy-competition-rules.cjs
node scripts/deploy-competition-rules.cjs --apply
node scripts/migrate-global-competition.cjs --apply --report artifacts/competition-rollout/september-2026.json
```

The rules command reads the latest live rules, changes only competition/voucher
creation validation and leaderboard reads, and checks for a changed ruleset
before releasing. Its output records the previous ruleset for recovery. Do not
replace the full live rules with a stale repository copy.

The metadata migration only updates three fields on September's existing root
document. It is idempotent, refuses a closing/finalized period, fingerprints
legacy vouchers and historical roots, and prints a provisional top three.
It never creates prizes or vouchers. Reports are ignored by Git because they
contain member data. Later customer purchases may change the provisional ranking.

## Verification

```sh
npm run test:competition
npm run lint --prefix functions
npx tsc --noEmit
npm run build
```

Start Firestore/Auth emulators for `demo-global-competition` and then run:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm test --prefix functions
```

The POS tests use the identical `test/fixtures/competition-policy.json` fixture.
Run `flutter test test/global_competition_test.dart test/member_program_integrity_test.dart`.
The Android integration suite uses `integration_test/member_program_emulator_test.dart`
with `RUN_FIREBASE_EMULATOR_TESTS=1` and both emulator host defines. An Android
emulator reaches host services at `10.0.2.2`; its data uses `zTesting_` collections.

After October finalization, inspect September's stored winners, nested rank
documents, and matching vouchers. There should be at most three, with unique
members/ranks and the configured amounts. POS's member-program audit checks
these invariants and reports missing, duplicate, inconsistent, or orphaned prizes.
