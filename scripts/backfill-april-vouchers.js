/**
 * ONE-TIME BACKFILL SCRIPT
 * ────────────────────────────────────────────────────────────────
 * Issues April 2026 monthly competition cashback vouchers to the
 * top 3 members in each category, using the old prize values:
 *   1st place: Rp25.000
 *   2nd place: Rp15.000
 *   3rd place: Rp10.000
 *
 * Run with:
 *   node scripts/backfill-april-vouchers.js
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS env var pointing to a
 * Firebase service account JSON, OR run from within the functions/
 * directory after `firebase login`.
 * ────────────────────────────────────────────────────────────────
 */

const admin = require("firebase-admin");

// ── Init ──────────────────────────────────────────────────────────
const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "point-of-sales-app-25e2b",
});
const db = admin.firestore(app);

// ── Config ────────────────────────────────────────────────────────
const TARGET_MONTH    = "2026-04";          // The competition month
const PRIZES          = [25000, 15000, 10000]; // Old prize values for April
const VOUCHER_COLLECTION = "vouchers";

// Expire at end of May 2026 (23:59:59 WIB = 16:59:59 UTC on May 31)
const EXPIRE_DATE = new Date(Date.UTC(2026, 4, 31, 16, 59, 59)); // May 31 2026 23:59:59 WIB

// activeDate = May 1 2026 00:00:00 WIB
const ACTIVE_DATE = new Date(Date.UTC(2026, 4, 0, 17, 0, 0)); // May 1 2026 00:00:00 WIB

// ── Helpers ───────────────────────────────────────────────────────
function generateShortId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== Backfill: Monthly Vouchers for ${TARGET_MONTH} ===\n`);

  // 1. Fetch competition records for April 2026
  const compDocRef = db.collection("competitionRecords").doc(TARGET_MONTH);
  const [compDoc, membersSnap] = await Promise.all([
    compDocRef.get(),
    db.collection("Members").get(),
  ]);

  if (!compDoc.exists) {
    console.error(`❌ Document competitionRecords/${TARGET_MONTH} does not exist. Aborting.`);
    process.exit(1);
  }

  // 2. Build member lookup map
  const memberMap = new Map();
  membersSnap.forEach((doc) => memberMap.set(doc.id, doc.data()));
  console.log(`✅ Loaded ${memberMap.size} members.`);

  // 3. Group participants by category
  const records = compDoc.data() || {};
  const categoriesMap = new Map();

  for (const [memberId, stats] of Object.entries(records)) {
    const memberData = memberMap.get(memberId);
    if (!memberData) {
      console.warn(`  ⚠️  Member ${memberId} in competition records not found in Members collection. Skipping.`);
      continue;
    }

    const category = memberData.category || "Umum";
    const points = stats.customerPoints || 0;
    const numberOfTransaction = stats.numberOfTransaction || 0;
    const amountSpent = stats.amountSpent || 0;

    if (points > 0) {
      if (!categoriesMap.has(category)) categoriesMap.set(category, []);
      categoriesMap.get(category).push({
        id: memberId,
        name: memberData.fullName || memberData.name || "Member",
        points,
        numberOfTransaction,
        amountSpent,
      });
    }
  }

  // 4. Sort and pick top 3 per category, then write vouchers
  const batch = db.batch();
  let totalVouchers = 0;

  for (const [category, participants] of categoriesMap.entries()) {
    // Same tie-breaking sort as the cloud function
    participants.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.numberOfTransaction !== a.numberOfTransaction)
        return b.numberOfTransaction - a.numberOfTransaction;
      return b.amountSpent - a.amountSpent;
    });

    const winners = participants.slice(0, 3);
    console.log(`\n📂 Category: ${category}`);

    winners.forEach((winner, index) => {
      const rank = index + 1;
      const prizeValue = PRIZES[index];
      const shortVoucherId = generateShortId();
      const newVoucherRef = db.collection(VOUCHER_COLLECTION).doc();

      console.log(
        `  🏅 Rank ${rank}: ${winner.name} (${winner.id}) — ${winner.points} pts — Prize: Rp${prizeValue.toLocaleString("id-ID")} — VoucherID: ${shortVoucherId}`
      );

      batch.set(newVoucherRef, {
        userId:                winner.id,
        nama:                  winner.name,
        type:                  "competitionReward",
        value:                 prizeValue,
        status:                "READY_TO_CLAIM",
        transactionRequirement: 10000,
        activeDate:            admin.firestore.Timestamp.fromDate(ACTIVE_DATE),
        expireDate:            admin.firestore.Timestamp.fromDate(EXPIRE_DATE),
        createdAt:             admin.firestore.FieldValue.serverTimestamp(),
        lastUpdatedAt:         admin.firestore.FieldValue.serverTimestamp(),
        voucherName:           `Juara ${rank} ${category} - ${TARGET_MONTH}`,
        voucherId:             shortVoucherId,
      });

      totalVouchers++;
    });
  }

  // 5. Commit
  if (totalVouchers === 0) {
    console.log("\n⚠️  No vouchers to create. Check that competition records have members with points > 0.");
    process.exit(0);
  }

  console.log(`\n💾 Writing ${totalVouchers} voucher(s) to Firestore...`);
  await batch.commit();
  console.log(`✅ Done! ${totalVouchers} voucher(s) successfully created.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Script failed:", err);
  process.exit(1);
});
