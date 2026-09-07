const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const clientRequire = createRequire(path.join(__dirname, '../../package.json'));
const {initializeApp, deleteApp} = clientRequire('firebase/app');
const {getAuth, connectAuthEmulator, signInWithEmailAndPassword} = clientRequire('firebase/auth');
const {getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, terminate} = clientRequire('firebase/firestore');
const admin = require('firebase-admin');
const {finalizeCompetitionPeriod} = require('../lib/competitionRewards');
const {competitionRulesOverlay} = require('../../scripts/competition-rules.cjs');
const fixtures = require('./fixtures/competition-policy.json');

test('global finalization and client security in Firestore/Auth emulators', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST,
}, async (t) => {
  const projectId = 'demo-global-competition';
  const app = admin.initializeApp({projectId}, 'competition-tests');
  const db = app.firestore();
  const auth = app.auth();
  const rules = competitionRulesOverlay(fs.readFileSync(path.join(__dirname, '../../firestore.rules'), 'utf8'));
  const upload = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}:securityRules`, {
    method: 'PUT', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({rules: {files: [{name: 'firestore.rules', content: rules}]}}),
  });
  assert.equal(upload.ok, true, await upload.text());
  const clients = [];
  const client = async (role) => {
    const instance = initializeApp({projectId, apiKey: 'demo-key', appId: `demo-${role}`}, `competition-${role}`);
    const store = getFirestore(instance);
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    connectFirestoreEmulator(store, host, Number(port));
    if (role !== 'guest') {
      const uid = `competition-${role}`;
      const email = `${uid}@example.test`;
      try { await auth.createUser({uid, email, password: 'emulator-password-123'}); } catch (error) { if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error; }
      await auth.setCustomUserClaims(uid, role === 'admin' ? {admin: true} : {admin: false});
      const clientAuth = getAuth(instance);
      connectAuthEmulator(clientAuth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, {disableWarnings: true});
      await signInWithEmailAndPassword(clientAuth, email, 'emulator-password-123');
    }
    clients.push([instance, store]);
    return store;
  };
  try {
    const [operator, guest, member] = await Promise.all(['admin', 'guest', 'member'].map(client));
    const periodRef = db.collection('competitionRecords').doc('2026-09');
    const prizeRef = db.collection('competitionPrizes').doc('2026-09');
    await db.recursiveDelete(periodRef);
    await db.recursiveDelete(prizeRef);
    for (const fixture of fixtures) for (const winner of fixture.expected) await db.collection('vouchers').doc(winner.voucherId).delete();
    const data = {periodId: '2026-09', status: 'open', schemaVersion: 3, rankingMode: 'global', winnerCount: 3};
    for (const record of fixtures[1].records) data[record.memberId] = record;
    await periodRef.set(data);
    await periodRef.collection('members').doc('one').set({...fixtures[1].records[0], customerPoints: 1});

    await t.test('concurrent finalizers create three global winners and vouchers once', async () => {
      const counts = await Promise.all([1, 2].map((id) => finalizeCompetitionPeriod(db, '2026-09', `test-${id}`, new Date('2026-10-01T00:00:00Z'))));
      assert.equal(counts.reduce((a, b) => a + b), 3);
      const prize = (await prizeRef.get()).data();
      assert.equal(prize.rankingMode, 'global');
      assert.equal(prize.winnerCount, 3);
      assert.deepEqual(prize.winners.map((w) => w.memberId), ['one', 'two', 'three']);
      assert.deepEqual((await prizeRef.collection('winners').get()).docs.map((d) => d.id), ['rank_1', 'rank_2', 'rank_3']);
      const vouchers = await db.collection('vouchers').where('competitionPrizePeriod', '==', '2026-09').get();
      assert.equal(vouchers.size, 3);
      for (const voucher of vouchers.docs) {
        assert.equal(voucher.data().rankingMode, 'global');
        assert.equal(voucher.data().transactionRequirement, 10000);
        assert.equal(voucher.data().expireDate.toDate().toISOString(), '2026-10-31T16:59:59.000Z');
      }
    });

    await t.test('retries preserve already-claimed vouchers and legacy rewards', async () => {
      const voucher = db.collection('vouchers').doc(fixtures[1].expected[0].voucherId);
      await voucher.update({status: 'CLAIMED', isClaimed: true, valueUsed: 50000, valueRemaining: 0});
      assert.equal(await finalizeCompetitionPeriod(db, '2026-09', 'retry', new Date('2026-10-02')), 0);
      assert.equal((await voucher.get()).data().status, 'CLAIMED');
      const legacyRef = db.collection('competitionRecords').doc('2026-08');
      await legacyRef.set({status: 'open', oldMember: {customerPoints: 100}});
      await db.collection('vouchers').doc('legacy-issued').set({type: 'competitionReward', status: 'READY_TO_CLAIM', value: 50000});
      assert.equal(await finalizeCompetitionPeriod(db, '2026-08', 'legacy', new Date('2026-09-07')), 0);
      assert.equal((await legacyRef.get()).data().status, 'open');
      assert.equal((await db.collection('competitionPrizes').doc('2026-08').get()).exists, false);
      assert.equal((await db.collection('vouchers').doc('legacy-issued').get()).data().value, 50000);
    });

    await t.test('current month and expired issuance fail before locking', async () => {
      await assert.rejects(finalizeCompetitionPeriod(db, '2026-10', 'test', new Date('2026-10-10')));
      await assert.rejects(finalizeCompetitionPeriod(db, '2026-11', 'test', new Date('2027-01-01')));
      assert.equal((await db.collection('competitionRecords').doc('2026-11').get()).exists, false);
    });

    await t.test('public boards and admin-only mutation apply in production/testing paths', async () => {
      assert.equal((await getDoc(doc(guest, 'competitionRecords/2026-09'))).exists(), true);
      assert.equal((await getDoc(doc(guest, 'competitionPrizes/2026-09/winners/rank_1'))).exists(), true);
      await assert.rejects(setDoc(doc(member, 'competitionRecords/2026-09'), {rankingMode: 'global'}, {merge: true}));
      await assert.rejects(setDoc(doc(guest, 'competitionPrizes/2026-09/winners/rank_1'), {}));
      await assert.rejects(setDoc(doc(operator, 'competitionRecords/2026-10'), {rankingMode: 'invalid', winnerCount: 3}));
      await assert.rejects(setDoc(doc(operator, 'competitionRecords/2026-10'), {rankingMode: 'global', winnerCount: -1}));
      await setDoc(doc(operator, 'zTesting_competitionRecords/2026-09'), {rankingMode: 'global', winnerCount: 3});
      await setDoc(doc(operator, 'zTesting_competitionPrizes/2026-09/winners/rank_1'), {rankingMode: 'global', rank: 1, prizeAmount: 50000});
      assert.equal((await getDoc(doc(guest, 'zTesting_competitionPrizes/2026-09/winners/rank_1'))).exists(), true);
      await assert.rejects(setDoc(doc(operator, 'zTesting_competitionPrizes/2026-09/winners/santri_1'), {rank: 1, prizeAmount: 50000}));
    });

    await t.test('old clients cannot create category prizes for global periods; legacy claim updates still work', async () => {
      await assert.rejects(setDoc(doc(operator, 'competitionPrizes/2026-10'), {status: 'finalized', winners: []}));
      await assert.rejects(setDoc(doc(operator, 'vouchers/old-client-global-prize'), {type: 'competitionPrize', competitionPrizePeriod: '2026-10', competitionRank: 1, value: 50000}));
      await updateDoc(doc(operator, 'vouchers/legacy-issued'), {status: 'CLAIMED', isClaimed: true});
      assert.equal((await db.collection('vouchers').doc('legacy-issued').get()).data().status, 'CLAIMED');
    });
  } finally {
    for (const [instance, store] of clients) { await terminate(store); await deleteApp(instance); }
    await app.delete();
  }
});
