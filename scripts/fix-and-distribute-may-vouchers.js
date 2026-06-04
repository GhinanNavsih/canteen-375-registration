/**
 * MAINTENANCE SCRIPT: Fix and Distribute May 2026 Competition Vouchers
 * ────────────────────────────────────────────────────────────────
 * Run in dry-run mode:
 *   node scripts/fix-and-distribute-may-vouchers.js
 *
 * Run and apply changes:
 *   node scripts/fix-and-distribute-may-vouchers.js --commit
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
const TARGET_MONTH = "2026-05";          // May 2026
const PRIZES = [50000, 25000, 15000];    // Prizes
const VOUCHER_COLLECTION = "vouchers";

// Dates for May 2026 competition vouchers:
// Active: June 1st 2026 00:00:00 WIB = May 31 2026 17:00:00 UTC
const ACTIVE_DATE = new Date(Date.UTC(2026, 4, 31, 17, 0, 0));
// Expire: June 30th 2026 23:59:59 WIB = June 30 2026 16:59:59 UTC
const EXPIRE_DATE = new Date(Date.UTC(2026, 5, 30, 16, 59, 59));

const isCommit = process.argv.includes("--commit");

// Helper to generate a 4-digit code
function generateShortId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function main() {
  console.log(`\n=== Monthly Competition Voucher Repair Tool ===`);
  console.log(`Target Month: ${TARGET_MONTH}`);
  console.log(`Mode: ${isCommit ? "🚨 LIVE COMMIT" : "🔍 DRY RUN (Pass --commit to save changes)"}\n`);

  // 1. Fetch competition records, members, and existing vouchers
  console.log("Fetching competition records, members, and vouchers...");
  const [compDoc, membersSnap, vouchersSnap] = await Promise.all([
    db.collection("competitionRecords").doc(TARGET_MONTH).get(),
    db.collection("Members").get(),
    db.collection(VOUCHER_COLLECTION).get()
  ]);

  console.log(`✅ Fetched ${membersSnap.size} members.`);
  console.log(`✅ Fetched ${vouchersSnap.size} total vouchers.`);

  // 2. Build member lookup map
  const memberMap = new Map();
  membersSnap.forEach((doc) => memberMap.set(doc.id, doc.data()));

  // 3. Process existing vouchers to find failed/invalid ones (missing expireDate) or ones created on/after June 1st
  const failedVouchers = [];
  const validVouchers = [];

  vouchersSnap.forEach((doc) => {
    const data = doc.data();
    if (data.type === "competitionReward") {
      const createdAtDate = data.createdAt ? data.createdAt.toDate() : null;
      
      // Vouchers created on or after June 1st, 2026
      if (createdAtDate && createdAtDate >= new Date("2026-06-01T00:00:00Z")) {
        if (!data.expireDate || !data.voucherId) {
          failedVouchers.push({ id: doc.id, ref: doc.ref, data });
        } else {
          validVouchers.push({ id: doc.id, ref: doc.ref, data });
        }
      }
    }
  });

  console.log(`\nFound ${failedVouchers.length} failed/invalid competition reward voucher(s) created in June 2026.`);
  console.log(`Found ${validVouchers.length} valid competition reward voucher(s) created in June 2026.`);

  // 4. Calculate the correct winners for May 2026
  if (!compDoc.exists) {
    console.error(`❌ competitionRecords/${TARGET_MONTH} does not exist. Cannot distribute vouchers.`);
    process.exit(1);
  }

  const records = compDoc.data() || {};
  const categoriesMap = new Map();

  for (const [memberId, stats] of Object.entries(records)) {
    const memberData = memberMap.get(memberId);
    if (!memberData) {
      console.warn(`  ⚠️  Member ${memberId} in competition records not found in Members collection. Skipping.`);
      continue;
    }

    let category = memberData.category || "Umum";
    if (category === "Guru/Dosen") {
      category = "Guru/Dosen/Staff";
    }
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

  console.log("\nCalculating correct winners per category for May 2026...");
  const correctWinners = [];
  for (const [category, participants] of categoriesMap.entries()) {
    // Correct sorting logic with tie-breakers
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
      console.log(
        `  🏅 Rank ${rank}: ${winner.name} (${winner.id}) — ${winner.points} pts, ${winner.numberOfTransaction} txs, Rp${winner.amountSpent.toLocaleString("id-ID")} spent — Prize: Rp${prizeValue.toLocaleString("id-ID")}`
      );
      correctWinners.push({
        userId: winner.id,
        nama: winner.name,
        rank,
        category,
        value: prizeValue,
        voucherName: `Juara ${rank} ${category} - ${TARGET_MONTH}`
      });
    });
  }

  // 5. Formulate changes (deletes/writes)
  const batch = db.batch();
  let writeCount = 0;
  let deleteCount = 0;

  // We should clean up/delete all failed vouchers created in June to avoid duplicate entries and crashes
  if (failedVouchers.length > 0) {
    console.log("\n🧹 Proposed deletion of failed/invalid vouchers:");
    failedVouchers.forEach((v) => {
      console.log(`  🗑️  Delete invalid voucher ${v.id} (user: ${v.data.userId}, name: ${v.data.voucherName})`);
      if (isCommit) {
        batch.delete(v.ref);
      }
      deleteCount++;
    });
  }

  // Determine which of the correct winners already have valid vouchers
  console.log("\n📦 Proposed creation of correct vouchers for May 2026:");
  for (const winner of correctWinners) {
    const alreadyExists = validVouchers.some(
      (v) => v.data.userId === winner.userId && v.data.voucherName === winner.voucherName
    );

    if (alreadyExists) {
      console.log(`  ✅ Voucher already exists for ${winner.nama} (${winner.voucherName})`);
    } else {
      const shortCode = generateShortId();
      const newVoucherRef = db.collection(VOUCHER_COLLECTION).doc();
      console.log(`  ➕ Create voucher for ${winner.nama} (${winner.userId}) — ${winner.voucherName} — Prize: Rp${winner.value.toLocaleString("id-ID")} — VoucherID: ${shortCode}`);
      
      if (isCommit) {
        batch.set(newVoucherRef, {
          userId: winner.userId,
          nama: winner.nama,
          Nama: winner.nama,
          userName: winner.nama,
          type: "competitionReward",
          value: winner.value,
          status: "READY_TO_CLAIM",
          transactionRequirement: 10000,
          activeDate: admin.firestore.Timestamp.fromDate(ACTIVE_DATE),
          expireDate: admin.firestore.Timestamp.fromDate(EXPIRE_DATE),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          voucherName: winner.voucherName,
          voucherId: shortCode,
        });
      }
      writeCount++;
    }
  }

  if (deleteCount === 0 && writeCount === 0) {
    console.log("\n🎉 Database is already in a clean, complete, and correct state!");
    process.exit(0);
  }

  if (isCommit) {
    console.log(`\n💾 Committing changes to Firestore (${deleteCount} deletes, ${writeCount} writes)...`);
    await batch.commit();
    console.log("✅ Database changes successfully committed!\n");
  } else {
    console.log(`\n🔍 Dry-run finished. Total proposed actions: ${deleteCount} deletes, ${writeCount} writes.`);
    console.log("Run with `node scripts/fix-and-distribute-may-vouchers.js --commit` to execute these changes.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Maintenance script failed:", err);
  process.exit(1);
});
