"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onVoucherGroupAchieved = exports.onPointsUpdated = exports.expiredVoucherCleanup = exports.distributeMonthlyRewards = exports.onMemberCreated = exports.birthdayVoucherScheduler = exports.setAdminRole = void 0;
const admin = require("firebase-admin");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
admin.initializeApp();
const db = admin.firestore();
const VOUCHER_COLLECTION = "vouchers";
const VOUCHER_VALUE = 10000;
// ── FUNCTION 0: Set Admin Role via Custom Claim ──────────────────────────────
// Call this ONCE with your own UID (from the Firebase console or a tool) to
// bootstrap admin access. After calling, the user must sign out and back in
// for the new token (with the claim) to be issued.
//
// Usage (from a trusted environment, e.g. Firebase console / curl):
//   firebase functions:call setAdminRole --data '{"uid":"YOUR_UID"}'
exports.setAdminRole = (0, https_1.onCall)({ region: "us-central1" }, async (request) => {
    var _a, _b;
    // Only existing admins can promote others.
    if (((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.admin) !== true) {
        throw new https_1.HttpsError("permission-denied", "Only admins can set roles.");
    }
    const { uid } = request.data;
    if (!uid)
        throw new https_1.HttpsError("invalid-argument", "uid is required.");
    await admin.auth().setCustomUserClaims(uid, { admin: true });
    v2_1.logger.info(`[setAdminRole] Granted admin role to uid: ${uid}`);
    return { success: true };
});
// NOTE: To bootstrap the FIRST admin (chicken-and-egg), run this snippet once
// in the Firebase Admin SDK locally or via a one-time script:
//   const admin = require('firebase-admin');
//   admin.initializeApp();
//   admin.auth().setCustomUserClaims('YOUR_UID', { admin: true });
// SHARED HELPER - Birthday Voucher logic
async function issueBirthdayVoucherIfEligible(memberId, memberData) {
    var _a, _b;
    const dob = (_a = memberData.dateOfBirth) !== null && _a !== void 0 ? _a : "";
    if (!dob) {
        v2_1.logger.warn(`[Birthday Voucher] Member ${memberId} has no dateOfBirth. Skipping.`);
        return false;
    }
    const parts = dob.split("-");
    if (parts.length !== 3) {
        v2_1.logger.warn(`[Birthday Voucher] Member ${memberId} has invalid dateOfBirth format: ${dob}. Skipping.`);
        return false;
    }
    const dobDay = parseInt(parts[0], 10);
    const dobMonth = parseInt(parts[1], 10);
    let finalMonth = dobMonth;
    let finalDay = dobDay;
    if (dobDay > 31) {
        finalMonth = parseInt(parts[1], 10);
        finalDay = parseInt(parts[2], 10);
    }
    const nowUTC = new Date();
    const wibOffset = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(nowUTC.getTime() + wibOffset);
    const todayMonth = nowWIB.getUTCMonth() + 1;
    const todayDay = nowWIB.getUTCDate();
    const todayYear = nowWIB.getUTCFullYear();
    if (finalMonth !== todayMonth || finalDay !== todayDay) {
        return false;
    }
    const existingSnap = await db
        .collection(VOUCHER_COLLECTION)
        .where("userId", "==", memberId)
        .where("type", "==", "BIRTHDAY")
        .where("year", "==", todayYear)
        .limit(1)
        .get();
    if (!existingSnap.empty) {
        v2_1.logger.info(`[Birthday Voucher] Member ${memberId} already has a birthday voucher for ${todayYear}. Skipping.`);
        return false;
    }
    const expireWIB = new Date(Date.UTC(todayYear, nowWIB.getUTCMonth(), todayDay, 16, 59, 59));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = '';
    for (let i = 0; i < 4; i++) {
        randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const voucherId = randomCode;
    await db.collection(VOUCHER_COLLECTION).add({
        userId: memberId,
        userName: (_b = memberData.fullName) !== null && _b !== void 0 ? _b : "",
        voucherName: "Hadiah Ulang Tahun 🎂",
        voucherId: voucherId,
        value: VOUCHER_VALUE,
        status: "READY_TO_CLAIM",
        type: "BIRTHDAY",
        year: todayYear,
        transactionRequirement: 10000,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expireDate: admin.firestore.Timestamp.fromDate(expireWIB),
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    v2_1.logger.info(`[Birthday Voucher] Issued voucher "${voucherId}" for member ${memberId} (${memberData.fullName}).`);
    return true;
}
// FUNCTION 1: Daily Scheduler (Birthday)
exports.birthdayVoucherScheduler = (0, scheduler_1.onSchedule)({
    schedule: "1 17 * * *",
    timeZone: "Asia/Jakarta",
    region: "us-central1",
}, async () => {
    v2_1.logger.info("[Birthday Voucher Scheduler] Starting daily birthday check...");
    const membersSnap = await db.collection("Members").get();
    if (membersSnap.empty)
        return;
    let issued = 0;
    for (const memberDoc of membersSnap.docs) {
        const wasIssued = await issueBirthdayVoucherIfEligible(memberDoc.id, memberDoc.data());
        if (wasIssued)
            issued++;
    }
    v2_1.logger.info(`[Birthday Voucher Scheduler] Done. Issued ${issued} voucher(s).`);
});
// FUNCTION 2: onCreate Trigger (Birthday)
exports.onMemberCreated = (0, firestore_1.onDocumentCreated)({
    document: "Members/{memberId}",
    region: "us-central1",
}, async (event) => {
    var _a;
    const memberId = event.params.memberId;
    const memberData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!memberData)
        return;
    const wasIssued = await issueBirthdayVoucherIfEligible(memberId, memberData);
    if (wasIssued) {
        v2_1.logger.info(`[Birthday Voucher onCreate] Happy Birthday! Voucher issued on registration.`);
    }
});
// FUNCTION 3: Monthly Reward Distribution
exports.distributeMonthlyRewards = (0, scheduler_1.onSchedule)({
    schedule: "0 0 1 * *",
    timeZone: "Asia/Jakarta",
    region: "us-central1"
}, async () => {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
    try {
        const [compDoc, membersSnap] = await Promise.all([
            db.collection("competitionRecords").doc(prevMonthStr).get(),
            db.collection("Members").get(),
        ]);
        if (!compDoc.exists)
            return;
        const records = compDoc.data() || {};
        const memberMap = new Map();
        membersSnap.forEach((doc) => memberMap.set(doc.id, doc.data()));
        const categoriesMap = new Map();
        for (const [memberId, stats] of Object.entries(records)) {
            const memberData = memberMap.get(memberId);
            if (!memberData)
                continue;
            const category = memberData.category || "Umum";
            const points = stats.customerPoints || 0;
            const numberOfTransaction = stats.numberOfTransaction || 0;
            const amountSpent = stats.amountSpent || 0;
            if (points > 0) {
                if (!categoriesMap.has(category))
                    categoriesMap.set(category, []);
                categoriesMap.get(category).push({
                    id: memberId,
                    name: memberData.fullName || memberData.name || "Member",
                    points: points,
                    numberOfTransaction: numberOfTransaction,
                    amountSpent: amountSpent,
                });
            }
        }
        // New prizes apply starting from May 2026 (distributed in June)
        // Anything before May 2026 (e.g., April) uses the old prizes.
        const prizes = prevMonthStr >= "2026-05"
            ? [50000, 25000, 15000]
            : [25000, 15000, 10000];
        const batch = db.batch();
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        let totalVouchers = 0;
        const generateShortId = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let randomCode = '';
            for (let i = 0; i < 4; i++) {
                randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return randomCode;
        };
        for (const [category, participants] of categoriesMap.entries()) {
            participants.sort((a, b) => {
                if (b.points !== a.points)
                    return b.points - a.points;
                if (b.numberOfTransaction !== a.numberOfTransaction)
                    return b.numberOfTransaction - a.numberOfTransaction;
                return b.amountSpent - a.amountSpent;
            });
            const winners = participants.slice(0, 3);
            winners.forEach((winner, index) => {
                const rank = index + 1;
                const prizeValue = prizes[index];
                const shortVoucherId = generateShortId();
                const newVoucherRef = db.collection("vouchers").doc();
                batch.set(newVoucherRef, {
                    userId: winner.id,
                    nama: winner.name,
                    type: "competitionReward",
                    value: prizeValue,
                    status: "READY_TO_CLAIM",
                    transactionRequirement: 10000,
                    activeDate: admin.firestore.Timestamp.fromDate(now),
                    expireDate: admin.firestore.Timestamp.fromDate(currentMonthEnd),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    voucherName: `Juara ${rank} ${category} - ${prevMonthStr}`,
                    voucherId: shortVoucherId,
                });
                totalVouchers++;
            });
        }
        if (totalVouchers > 0)
            await batch.commit();
    }
    catch (error) {
        v2_1.logger.error("Error during reward distribution:", error);
    }
});
// FUNCTION 4: Expired Voucher Cleanup
exports.expiredVoucherCleanup = (0, scheduler_1.onSchedule)({
    schedule: "5 0 * * *",
    timeZone: "Asia/Jakarta",
    region: "us-central1"
}, async () => {
    const now = admin.firestore.Timestamp.now();
    try {
        const expiredSnap = await db.collection(VOUCHER_COLLECTION)
            .where("status", "==", "READY_TO_CLAIM")
            .where("expireDate", "<", now)
            .get();
        if (expiredSnap.empty)
            return;
        const batch = db.batch();
        let count = 0;
        expiredSnap.forEach(doc => {
            batch.update(doc.ref, {
                status: "EXPIRED",
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            count++;
        });
        if (count > 0)
            await batch.commit();
    }
    catch (error) {
        v2_1.logger.error("Error during expired voucher cleanup:", error);
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION HELPERS
// ══════════════════════════════════════════════════════════════════════════════
/**
 * Send an FCM push notification to all devices registered under a member.
 * Automatically cleans up any invalid/expired tokens.
 */
async function sendPushToMember(memberId, title, body, data) {
    var _a, _b;
    const memberSnap = await db.collection("Members").doc(memberId).get();
    if (!memberSnap.exists)
        return;
    const tokens = (_b = (_a = memberSnap.data()) === null || _a === void 0 ? void 0 : _a.fcmTokens) !== null && _b !== void 0 ? _b : [];
    if (tokens.length === 0)
        return;
    const message = {
        tokens,
        notification: { title, body },
        data: data !== null && data !== void 0 ? data : {},
        webpush: {
            notification: {
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
                vibrate: [200, 100, 200],
            },
        },
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    v2_1.logger.info(`[Push] Sent to ${memberId}: ${response.successCount} success, ${response.failureCount} failure`);
    // Clean up invalid tokens
    const tokensToRemove = [];
    response.responses.forEach((res, idx) => {
        if (res.error &&
            (res.error.code === "messaging/registration-token-not-registered" ||
                res.error.code === "messaging/invalid-registration-token")) {
            tokensToRemove.push(tokens[idx]);
        }
    });
    if (tokensToRemove.length > 0) {
        await db
            .collection("Members")
            .doc(memberId)
            .update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove),
        });
        v2_1.logger.info(`[Push] Removed ${tokensToRemove.length} stale token(s) for ${memberId}`);
    }
}
// ── FUNCTION 5: Notify member when points increase ───────────────────────────
// Triggers whenever a Members document is updated.
// Compares old vs new "points" field; if points went up, sends a push
// notification including: points added, new total, and any redeemable vouchers.
exports.onPointsUpdated = (0, firestore_1.onDocumentUpdated)({
    document: "Members/{memberId}",
    region: "us-central1",
}, async (event) => {
    var _a, _b, _c, _d;
    const memberId = event.params.memberId;
    const beforeData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const afterData = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!beforeData || !afterData)
        return;
    const oldPoints = (_c = beforeData.points) !== null && _c !== void 0 ? _c : 0;
    const newPoints = (_d = afterData.points) !== null && _d !== void 0 ? _d : 0;
    const pointsAdded = newPoints - oldPoints;
    // Only fire when points have *increased*
    if (pointsAdded <= 0)
        return;
    v2_1.logger.info(`[onPointsUpdated] ${memberId}: ${oldPoints} → ${newPoints} (+${pointsAdded})`);
    // Query redeemable vouchers (READY_TO_CLAIM) for this member
    const [vouchersSnap, vouchersSingularSnap] = await Promise.all([
        db
            .collection("vouchers")
            .where("userId", "==", memberId)
            .where("status", "==", "READY_TO_CLAIM")
            .get(),
        db
            .collection("voucher")
            .where("userId", "==", memberId)
            .where("status", "==", "READY_TO_CLAIM")
            .get(),
    ]);
    const redeemableVouchers = [];
    const addVoucher = (doc) => {
        var _a, _b;
        const d = doc.data();
        // Only include non-expired vouchers
        const expireDate = (_b = (_a = d.expireDate) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
        if (expireDate && expireDate < new Date())
            return;
        redeemableVouchers.push({
            name: d.voucherName || "Voucher",
            value: d.value || 0,
        });
    };
    vouchersSnap.forEach(addVoucher);
    vouchersSingularSnap.forEach(addVoucher);
    // Build notification body
    let body = `+${pointsAdded} poin! Total poin Anda sekarang: ${newPoints} ⭐`;
    if (redeemableVouchers.length > 0) {
        body += "\n\n🎁 Voucher siap diklaim:";
        redeemableVouchers.forEach((v) => {
            body += `\n• ${v.name} (Rp${v.value.toLocaleString("id-ID")})`;
        });
    }
    await sendPushToMember(memberId, "Poin Bertambah! 🎉", body, {
        type: "points_update",
        pointsAdded: String(pointsAdded),
        newTotal: String(newPoints),
        tag: "points-update",
    });
});
// ── FUNCTION 6: Notify member when they achieve a voucherGroup voucher ───────
// Triggers when a new document is created in the "vouchers" collection.
// If the voucher has a voucherGroupId (meaning it was earned from a campaign),
// send a congratulatory push notification.
exports.onVoucherGroupAchieved = (0, firestore_1.onDocumentCreated)({
    document: "vouchers/{voucherId}",
    region: "us-central1",
}, async (event) => {
    var _a;
    const voucherData = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!voucherData)
        return;
    const memberId = voucherData.userId;
    if (!memberId)
        return;
    // Only notify for voucherGroup-based vouchers (campaign achievements)
    // Skip competition rewards and birthday vouchers — those have their own context.
    const voucherGroupId = voucherData.voucherGroupId;
    if (!voucherGroupId)
        return;
    const voucherName = voucherData.voucherName || "Voucher";
    const value = voucherData.value || 0;
    const status = voucherData.status || "";
    // Only notify if the voucher is ready to claim
    if (status !== "READY_TO_CLAIM")
        return;
    const body = `Selamat! Anda berhasil meraih voucher "${voucherName}" ` +
        `senilai Rp${value.toLocaleString("id-ID")}! ` +
        `Buka aplikasi untuk mengklaim. 🎊`;
    await sendPushToMember(memberId, "Voucher Baru! 🎁", body, {
        type: "voucher_achieved",
        voucherName: voucherName,
        tag: "voucher-achieved",
    });
    v2_1.logger.info(`[onVoucherGroupAchieved] Notified ${memberId} about voucher "${voucherName}"`);
});
//# sourceMappingURL=index.js.map