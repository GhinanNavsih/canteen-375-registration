const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Compile the actual browser helper in memory; no generated source files.
const filename = path.join(__dirname, '../src/lib/memberProgram.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020},
}).outputText;
const loaded = new Module(filename, module);
loaded.filename = filename;
loaded.paths = module.paths;
loaded.require = (id) => id === '../../functions/src/competitionPolicy'
  ? require('../functions/lib/competitionPolicy') : require(id);
loaded._compile(compiled, filename);
const policy = loaded.exports;
const fixtures = require('../functions/test/fixtures/competition-policy.json');

for (const fixture of fixtures) {
  test('web ranking: ' + fixture.name, () => {
    const records = fixture.records.map((record) => policy.competitionRecordFromData(record.memberId, record));
    const ranking = policy.rankCompetitionRecords(records, policy.competitionRankingMode(fixture.periodId));
    assert.deepEqual(ranking.slice(0, 3).map((record) => record.memberId), fixture.expected.map((winner) => winner.memberId));
  });
}

test('archives use recorded categories and prize versions', () => {
  const missing = policy.competitionRecordFromData('no-snapshot', {customerPoints: 10});
  const santri = policy.competitionRecordFromData('santri', {customerPoints: 5, category: 'Santri'});
  assert.deepEqual(policy.rankCompetitionRecords([missing, santri], 'category', 'Santri').map((r) => r.memberId), ['santri']);
  assert.equal(policy.competitionWinnerFromData('2026-08', {memberId: 'a', rank: 1, prizeAmount: 25000}).rankingMode, 'category');
  assert.equal(policy.competitionWinnerFromData('2026-09', {memberId: 'a', rank: 1, prizeAmount: 50000}).rankingMode, 'global');
  assert.equal(policy.competitionWinnerFromData('2026-09', {memberId: 'a', rank: 4, prizeAmount: 50000}), null);
});

test('rules overlay is repeatable and preserves unrelated permissions', () => {
  const {competitionRulesOverlay} = require('./competition-rules.cjs');
  const baseline = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
  const once = competitionRulesOverlay(baseline);
  assert.equal(competitionRulesOverlay(once), once);
  const adminDefinition = baseline.match(/function isAdmin\(\) \{[\s\S]*?\n    \}/)[0];
  assert.equal(once.includes(adminDefinition), true);
});
