import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

admin.initializeApp();
const db = admin.firestore();

const VOUCHER_COLLECTION = "vouchers";
const VOUCHER_VALUE = 10000;

// SHARED HELPER - Birthday Voucher logic
async function issueBirthdayVoucherIfEligible(
    memberId: string,
    memberData: admin.firestore.DocumentData
): Promise<boolean> {
    const dob: string = memberData.dateOfBirth ?? "";
    if (!dob) {
        logger.warn(`[Birthday Voucher] Member ${memberId} has no dateOfBirth. Skipping.`);
        return false;
    }

    const parts = dob.split("-");
    if (parts.length !== 3) {
        logger.warn(`[Birthday Voucher] Member ${memberId} has invalid dateOfBirth format: ${dob}. Skipping.`);
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
        logger.info(
            `[Birthday Voucher] Member ${memberId} already has a birthday voucher for ${todayYear}. Skipping.`
        );
        return false;
    }

    const expireWIB = new Date(
        Date.UTC(todayYear, nowWIB.getUTCMonth(), todayDay, 16, 59, 59)
    );

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomCode = '';
    for (let i = 0; i < 4; i++) {
        randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const voucherId = randomCode;

    await db.collection(VOUCHER_COLLECTION).add({
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

    logger.info(
        `[Birthday Voucher] Issued voucher "${voucherId}" for member ${memberId} (${memberData.fullName}).`
    );
    return true;
}

// FUNCTION 1: Daily Scheduler (Birthday)
export const birthdayVoucherScheduler = onSchedule(
    {
        schedule: "1 17 * * *", 
        timeZone: "Asia/Jakarta",
        region: "us-central1",
    },
    async () => {
        logger.info("[Birthday Voucher Scheduler] Starting daily birthday check...");
        const membersSnap = await db.collection("Members").get();
        if (membersSnap.empty) return;

        let issued = 0;
        for (const memberDoc of membersSnap.docs) {
            const wasIssued = await issueBirthdayVoucherIfEligible(memberDoc.id, memberDoc.data());
            if (wasIssued) issued++;
        }
        logger.info(`[Birthday Voucher Scheduler] Done. Issued ${issued} voucher(s).`);
    }
);

// FUNCTION 2: onCreate Trigger (Birthday)
export const onMemberCreated = onDocumentCreated(
    {
        document: "Members/{memberId}",
        region: "us-central1",
    },
    async (event) => {
        const memberId = event.params.memberId;
        const memberData = event.data?.data();
        if (!memberData) return;

        const wasIssued = await issueBirthdayVoucherIfEligible(memberId, memberData);
        if (wasIssued) {
            logger.info(`[Birthday Voucher onCreate] Happy Birthday! Voucher issued on registration.`);
        }
    }
);

// FUNCTION 3: Monthly Reward Distribution
export const distributeMonthlyRewards = onSchedule(
    {
        schedule: "0 0 1 * *", 
        timeZone: "Asia/Jakarta",
        region: "us-central1"
    },
    async () => {
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

        try {
            const [compDoc, membersSnap] = await Promise.all([
                db.collection("competitionRecords").doc(prevMonthStr).get(),
                db.collection("Members").get(),
            ]);

            if (!compDoc.exists) return;

            const records = compDoc.data() || {};
            const memberMap = new Map();
            membersSnap.forEach((doc) => memberMap.set(doc.id, doc.data()));

            const categoriesMap = new Map<string, any[]>();
            for (const [memberId, stats] of Object.entries(records)) {
                const memberData = memberMap.get(memberId);
                if (!memberData) continue;
                const category = memberData.category || "Umum";
                const points = (stats as any).customerPoints || 0;
                if (points > 0) {
                    if (!categoriesMap.has(category)) categoriesMap.set(category, []);
                    categoriesMap.get(category)!.push({
                        id: memberId,
                        name: memberData.fullName || memberData.name || "Member",
                        points: points,
                    });
                }
            }

            const prizes = [25000, 15000, 10000];
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
                participants.sort((a, b) => b.points - a.points);
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

            if (totalVouchers > 0) await batch.commit();
        } catch (error) {
            logger.error("Error during reward distribution:", error);
        }
    }
);

// FUNCTION 4: Expired Voucher Cleanup
export const expiredVoucherCleanup = onSchedule(
    {
        schedule: "5 0 * * *", 
        timeZone: "Asia/Jakarta",
        region: "us-central1"
    },
    async () => {
        const now = admin.firestore.Timestamp.now();
        try {
            const expiredSnap = await db.collection(VOUCHER_COLLECTION)
                .where("status", "==", "READY_TO_CLAIM")
                .where("expireDate", "<", now)
                .get();

            if (expiredSnap.empty) return;

            const batch = db.batch();
            let count = 0;
            expiredSnap.forEach(doc => {
                batch.update(doc.ref, {
                    status: "EXPIRED",
                    lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                count++;
            });
            if (count > 0) await batch.commit();
        } catch (error) {
            logger.error("Error during expired voucher cleanup:", error);
        }
    }
);
