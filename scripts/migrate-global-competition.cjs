const admin = require('firebase-admin');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {buildWinners, winnerDocumentId} = require('../functions/lib/competitionPolicy');
const {readCompetitionRecords} = require('../functions/lib/competitionRewards');

const periodId = '2026-09';
const projectId = 'point-of-sales-app-25e2b';
const apply = process.argv.includes('--apply');
const fingerprint = (docs) => createHash('sha256').update(JSON.stringify(docs.map((doc) => [doc.id, doc.data()]))).digest('hex');

async function main() {
  if (process.env.FIRESTORE_EMULATOR_HOST) throw new Error('This migration is for the production September period.');
  admin.initializeApp({credential: admin.credential.applicationDefault(), projectId});
  const db = admin.firestore();
  const periodRef = db.collection('competitionRecords').doc(periodId);
  const inspect = async () => {
    const [periods, legacy, canonical, prizes] = await Promise.all([
      db.collection('competitionRecords').get(),
      db.collection('vouchers').where('type', '==', 'competitionReward').get(),
      periodRef.collection('members').get(), db.collection('competitionPrizes').get(),
    ]);
    return {legacyVoucherCount: legacy.size, legacyVoucherHash: fingerprint(legacy.docs),
      historicalPeriodHash: fingerprint(periods.docs.filter((doc) => doc.id < periodId)),
      canonicalCount: canonical.size, prizePeriods: prizes.docs.map((doc) => doc.id)};
  };
  const before = await inspect();
  let metadataChanged = false;
  if (apply) {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(periodRef);
      const prize = await transaction.get(db.collection('competitionPrizes').doc(periodId));
      if (!snapshot.exists) throw new Error('September records are missing.');
      const data = snapshot.data();
      if (data.rankingMode === 'global' && data.winnerCount === 3 && data.schemaVersion === 3) return;
      if (data.status !== 'open' || prize.exists) throw new Error('Period already closing or finalized; review before changing metadata.');
      transaction.update(periodRef, {schemaVersion: 3, rankingMode: 'global', winnerCount: 3});
      metadataChanged = true;
    });
  }
  const records = await readCompetitionRecords(db, periodId);
  const snapshot = await periodRef.get();
  const after = await inspect();
  const data = snapshot.data() || {};
  const report = {projectId, periodId, generatedAt: new Date().toISOString(), apply, metadataChanged,
    metadata: {schemaVersion: data.schemaVersion, rankingMode: data.rankingMode, winnerCount: data.winnerCount, status: data.status},
    before, after, historicalPeriodsUnchanged: before.historicalPeriodHash === after.historicalPeriodHash,
    legacyVouchersUnchanged: before.legacyVoucherHash === after.legacyVoucherHash,
    recordCount: records.length,
    provisionalWinners: buildWinners(periodId, records, 'global').map((winner) => ({...winner, documentId: winnerDocumentId(winner)})),
    note: 'Provisional only. September remains open; no winners or vouchers were issued.',
  };
  console.log(JSON.stringify(report, null, 2));
  const reportIndex = process.argv.indexOf('--report');
  if (reportIndex >= 0) {
    const reportPath = process.argv[reportIndex + 1];
    if (!reportPath) throw new Error('--report requires a path');
    fs.mkdirSync(path.dirname(reportPath), {recursive: true});
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
