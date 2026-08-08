import * as admin from "firebase-admin";
import type { DocumentData, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

admin.initializeApp();
const db = admin.firestore();

type TriggerBase = {
    document: string;
    params: Record<string, string | undefined>;
};
type CreatedTriggerEvent = TriggerBase & { data?: { data: () => DocumentData } };
type UpdatedTriggerEvent = TriggerBase & {
    data?: {
        before: { data: () => DocumentData };
        after: { data: () => DocumentData };
    };
};

// Helper to get collection name with optional testing prefix
const getCol = (name: string, eventPath: string) => {
    return eventPath.startsWith("zTesting_") ? `zTesting_${name}` : name;
};

const VOUCHER_COLLECTION = "vouchers";
const VOUCHER_VALUE = 10000;

function parsePointNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value !== "string") return fallback;
    const raw = value.trim();
    if (!raw) return fallback;
    if (/^-?\d+$/.test(raw)) {
        const direct = Number(raw);
        if (Number.isFinite(direct)) return Math.trunc(direct);
    }
    const negative = raw.startsWith("-");
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits) return fallback;
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) return fallback;
    return negative ? -Math.trunc(parsed) : Math.trunc(parsed);
}

// ── FUNCTION 0: Set Admin Role via Custom Claim ──────────────────────────────
export const setAdminRole = onCall(
    { region: "us-central1" },
    async (request) => {
        if (request.auth?.token?.admin !== true) {
            throw new HttpsError("permission-denied", "Only admins can set roles.");
        }
        const { uid } = request.data as { uid: string };
        if (!uid) throw new HttpsError("invalid-argument", "uid is required.");
        await admin.auth().setCustomUserClaims(uid, { admin: true });
        logger.info(`[setAdminRole] Granted admin role to uid: ${uid}`);
        return { success: true };
    }
);

// SHARED HELPER - Birthday Voucher logic
async function issueBirthdayVoucherIfEligible(
    eventPath: string,
    memberId: string,
    memberData: admin.firestore.DocumentData
): Promise<boolean> {
    const dob: string = memberData.dateOfBirth ?? "";
    if (!dob) return false;

    const parts = dob.split("-");
    if (parts.length !== 3) return false;

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

    if (finalMonth !== todayMonth || finalDay !== todayDay) return false;

    const existingSnap = await db
        .collection(getCol(VOUCHER_COLLECTION, eventPath))
        .where("userId", "==", memberId)
        .where("type", "==", "BIRTHDAY")
        .where("year", "==", todayYear)
        .limit(1)
        .get();

    if (!existingSnap.empty) return false;

    const expireWIB = new Date(Date.UTC(todayYear, nowWIB.getUTCMonth(), todayDay, 16, 59, 59));
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = '';
    for (let i = 0; i < 4; i++) { randomCode += chars.charAt(Math.floor(Math.random() * chars.length)); }
    const voucherId = randomCode;

    await db.collection(getCol(VOUCHER_COLLECTION, eventPath)).add({
        userId: memberId,
        userName: memberData.fullName ?? "",
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

    logger.info(`[Birthday Voucher] Issued voucher "${voucherId}" for ${memberId}`);
    return true;
}

// FUNCTION 1: Daily Scheduler (Birthday)
export const birthdayVoucherScheduler = onSchedule(
    { schedule: "1 17 * * *", timeZone: "Asia/Jakarta", region: "us-central1" },
    async () => {
        const membersSnap = await db.collection("Members").get();
        for (const memberDoc of membersSnap.docs) {
            await issueBirthdayVoucherIfEligible("Members", memberDoc.id, memberDoc.data());
        }
    }
);

// SHARED LOGIC for onMemberCreated
async function onMemberCreatedLogic(event: CreatedTriggerEvent) {
    const memberId = event.params.memberId;
    const memberData = event.data?.data();
    if (!memberId || !memberData) return;
    await issueBirthdayVoucherIfEligible(event.document, memberId, memberData);
}

export const onMemberCreated = onDocumentCreated({ document: "Members/{memberId}", region: "us-central1" }, onMemberCreatedLogic);
export const onMemberCreatedTesting = onDocumentCreated({ document: "zTesting_Members/{memberId}", region: "us-central1" }, onMemberCreatedLogic);

// FUNCTION 3: Monthly Reward Distribution
//
// Monthly competition finalization is owned by the POS
// MemberProgramService.  This scheduled function intentionally remains
// deployed as a no-op for backwards-compatible function names: issuing a
// reward here would race the POS transaction and create duplicate prizes.
export const distributeMonthlyRewards = onSchedule(
    { schedule: "0 0 1 * *", timeZone: "Asia/Jakarta", region: "us-central1" },
    async () => {
        logger.info("Monthly rewards are finalized transactionally by the POS; scheduled legacy issuer skipped.");
    }
);

// FUNCTION 4: Expired Voucher Cleanup
export const expiredVoucherCleanup = onSchedule(
    { schedule: "5 0 * * *", timeZone: "Asia/Jakarta", region: "us-central1" },
    async () => {
        const now = admin.firestore.Timestamp.now();
        const expiredSnap = await db.collection(VOUCHER_COLLECTION).where("status", "==", "READY_TO_CLAIM").where("expireDate", "<", now).get();
        const batch = db.batch();
        expiredSnap.forEach(doc => batch.update(doc.ref, { status: "EXPIRED", lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        await batch.commit();
    }
);

// PUSH NOTIFICATION HELPERS
async function sendPushToMember(eventPath: string, memberId: string, title: string, body: string, data?: Record<string, string>) {
    const memberSnap = await db.collection(getCol("Members", eventPath)).doc(memberId).get();
    if (!memberSnap.exists) return;
    const tokens: string[] = memberSnap.data()?.fcmTokens ?? [];
    if (tokens.length === 0) return;
    const message: admin.messaging.MulticastMessage = { tokens, notification: { title, body }, data: data ?? {} };
    const response = await admin.messaging().sendEachForMulticast(message);
    const tokensToRemove: string[] = [];
    response.responses.forEach((res, idx) => {
        if (res.error && (res.error.code === "messaging/registration-token-not-registered" || res.error.code === "messaging/invalid-registration-token")) {
            tokensToRemove.push(tokens[idx]);
        }
    });
    if (tokensToRemove.length > 0) {
        await db.collection(getCol("Members", eventPath)).doc(memberId).update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove) });
    }
}

// SHARED LOGIC for onPointsUpdated
async function onPointsUpdatedLogic(event: UpdatedTriggerEvent) {
    const memberId = event.params.memberId;
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    if (!memberId || !beforeData || !afterData) return;
    const oldPoints = parsePointNumber(beforeData.points);
    const newPoints = parsePointNumber(afterData.points);
    const pointsAdded = newPoints - oldPoints;
    if (pointsAdded <= 0) return;
    const [vouchersSnap, vouchersSingularSnap] = await Promise.all([
        db.collection(getCol("vouchers", event.document)).where("userId", "==", memberId).where("status", "==", "READY_TO_CLAIM").get(),
        db.collection(getCol("voucher", event.document)).where("userId", "==", memberId).where("status", "==", "READY_TO_CLAIM").get(),
    ]);

    const redeemableVouchers: { name: string; value: number }[] = [];
    const addVoucher = (doc: QueryDocumentSnapshot<DocumentData>) => {
        const d = doc.data();
        const expireDate = d.expireDate?.toDate?.();
        if (expireDate && expireDate < new Date()) return;
        redeemableVouchers.push({ name: d.voucherName || "Voucher", value: d.value || 0 });
    };
    vouchersSnap.forEach(addVoucher);
    vouchersSingularSnap.forEach(addVoucher);

    let body = `+${pointsAdded} poin! Total poin: ${newPoints} ⭐`;
    if (redeemableVouchers.length > 0) {
        body += "\n\n🎁 Voucher siap diklaim:";
        redeemableVouchers.forEach((v) => {
            body += `\n• ${v.name} (Rp${v.value.toLocaleString("id-ID")})`;
        });
    }
    await sendPushToMember(event.document, memberId, "Poin Bertambah! 🎉", body, { type: "points_update" });
}

export const onPointsUpdated = onDocumentUpdated({ document: "Members/{memberId}", region: "us-central1" }, onPointsUpdatedLogic);
export const onPointsUpdatedTesting = onDocumentUpdated({ document: "zTesting_Members/{memberId}", region: "us-central1" }, onPointsUpdatedLogic);

// SHARED LOGIC for onVoucherGroupAchieved
async function onVoucherGroupAchievedLogic(event: CreatedTriggerEvent) {
    const data = event.data?.data();
    if (!data || !data.userId || !data.voucherGroupId || data.status !== "READY_TO_CLAIM") return;
    const body = `Selamat! Anda berhasil meraih voucher "${data.voucherName}"! 🎊`;
    await sendPushToMember(event.document, data.userId, "Voucher Baru! 🎁", body, { type: "voucher_achieved" });
}

export const onVoucherGroupAchieved = onDocumentCreated({ document: "vouchers/{voucherId}", region: "us-central1" }, onVoucherGroupAchievedLogic);
export const onVoucherGroupAchievedTesting = onDocumentCreated({ document: "zTesting_vouchers/{voucherId}", region: "us-central1" }, onVoucherGroupAchievedLogic);

// Campaign vouchers are normally created as IN_PROGRESS and later transition
// to READY_TO_CLAIM inside the POS checkout transaction.  Notify that
// transition without writing any campaign or points state from Functions.
async function onVoucherGroupUpdatedLogic(event: UpdatedTriggerEvent) {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || !after.userId || !after.voucherGroupId) return;
    const beforeStatus = String(before.status ?? "").toUpperCase();
    const afterStatus = String(after.status ?? "").toUpperCase();
    if (beforeStatus === "READY_TO_CLAIM" || afterStatus !== "READY_TO_CLAIM") return;
    const body = `Selamat! Anda berhasil meraih voucher "${after.voucherName ?? "Voucher"}"! 🎊`;
    await sendPushToMember(event.document, String(after.userId), "Voucher Baru! 🎁", body, { type: "voucher_achieved" });
}

export const onVoucherGroupUpdated = onDocumentUpdated({ document: "vouchers/{voucherId}", region: "us-central1" }, onVoucherGroupUpdatedLogic);
export const onVoucherGroupUpdatedTesting = onDocumentUpdated({ document: "zTesting_vouchers/{voucherId}", region: "us-central1" }, onVoucherGroupUpdatedLogic);

// SHARED LOGIC for onTransactionStatusCreated
//
// The POS now writes pointTransactions/{operationId}, competition member
// records, and campaign progress in the same transaction as the sale.  A
// status-trigger projection here would award points a second time, so these
// legacy triggers are deliberately inert.  Keeping the exports avoids a
// breaking function deletion during deployment.
async function onTransactionStatusCreatedLogic(event: CreatedTriggerEvent) {
    logger.debug("Legacy transaction-created point projection skipped", {
        document: event.document,
    });
}

export const onTransactionStatusCreated = onDocumentCreated({ document: "{path=**}/Status/{statusId}", region: "us-central1" }, onTransactionStatusCreatedLogic);
export const onTransactionStatusCreatedTesting = onDocumentCreated({ document: "zTesting_Status/{statusId}", region: "us-central1" }, onTransactionStatusCreatedLogic);
export const onSelfOrderCreatedTesting = onDocumentCreated({ document: "zTesting_SelfOrders/{statusId}", region: "us-central1" }, onTransactionStatusCreatedLogic);

// SHARED LOGIC for onTransactionStatusUpdated
async function onTransactionStatusUpdatedLogic(event: UpdatedTriggerEvent) {
    logger.debug("Legacy transaction-updated point projection skipped", {
        document: event.document,
    });
}

export const onTransactionStatusUpdated = onDocumentUpdated({ document: "{path=**}/Status/{statusId}", region: "us-central1" }, onTransactionStatusUpdatedLogic);
export const onTransactionStatusUpdatedTesting = onDocumentUpdated({ document: "zTesting_Status/{statusId}", region: "us-central1" }, onTransactionStatusUpdatedLogic);
export const onSelfOrderUpdatedTesting = onDocumentUpdated({ document: "zTesting_SelfOrders/{statusId}", region: "us-central1" }, onTransactionStatusUpdatedLogic);
