const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildWinners, winnerDocumentId, competitionRankingMode} = require('../lib/competitionPolicy');
const {mergeCompetitionRecords} = require('../lib/competitionRewards');
const fixtures = require('./fixtures/competition-policy.json');

for (const fixture of fixtures) {
  test(fixture.name, () => {
    assert.deepEqual(buildWinners(fixture.periodId, fixture.records).map((winner) => ({
      memberId: winner.memberId, rank: winner.rank, prizeAmount: winner.prizeAmount,
      voucherId: winner.voucherId, documentId: winnerDocumentId(winner),
    })), fixture.expected);
  });
}

test('legacy periods and explicit metadata resolve consistently', () => {
  assert.equal(competitionRankingMode('2026-08'), 'category');
  assert.equal(competitionRankingMode('2026-09'), 'global');
  assert.equal(competitionRankingMode('2027-01'), 'global');
  assert.equal(competitionRankingMode('2026-08', {rankingMode: 'global'}), 'global');
  assert.equal(competitionRankingMode('2026-09', {rankingMode: 'invalid'}), 'global');
  const winners = buildWinners('2026-08', fixtures[0].records);
  assert.deepEqual(winners.map((winner) => [winner.memberId, winner.rank]), [
    ['z-member', 1], ['a-member', 1], ['top+6281', 1],
  ]);
});

test('root totals win; canonical metadata and canonical-only records survive', () => {
  const result = mergeCompetitionRecords({a: {customerPoints: 100, amountSpent: 90000}}, [
    {id: 'a', data: () => ({customerPoints: 1, amountSpent: 1, category: 'Santri'})},
    {id: 'b', data: () => ({customerPoints: 5, category: 'Mahasiswa'})},
  ], new Map());
  assert.equal(result[0].customerPoints, 100);
  assert.equal(result[0].amountSpent, 90000);
  assert.equal(result[0].category, 'santri');
  assert.equal(result[1].memberId, 'b');
});
