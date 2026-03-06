import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";

admin.initializeApp();
const db = admin.firestore();

const VOUCHER_COLLECTION = "vouchers";
const VOUCHER_VALUE = 10000;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPER
// Checks if a member's birthday is today (WIB) and issues a voucher if so.
// Returns true if a voucher was issued, false otherwise.
// ─────────────────────────────────────────────────────────────────────────────
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

    // Assuming format DD-MM-YYYY based on the registration form
    const dobDay = parseInt(parts[0], 10);
    const dobMonth = parseInt(parts[1], 10);
    // Not strictly needed but parts[2] is the year

    // Fallback check just in case it was stored as YYYY-MM-DD
    let finalMonth = dobMonth;
    let finalDay = dobDay;
    if (dobDay > 31) {
        // If the first part is > 31, it must be the year (YYYY-MM-DD format)
        finalMonth = parseInt(parts[1], 10);
        finalDay = parseInt(parts[2], 10);
    }

    // Get today's date in WIB (UTC+7)
    const nowUTC = new Date();
    const wibOffset = 7 * 60 * 60 * 1000;
    const nowWIB = new Date(nowUTC.getTime() + wibOffset);

    const todayMonth = nowWIB.getUTCMonth() + 1;
    const todayDay = nowWIB.getUTCDate();
    const todayYear = nowWIB.getUTCFullYear();

    // Not their birthday today
    if (finalMonth !== todayMonth || finalDay !== todayDay) {
        return false;
    }

    // Duplicate check: already has a birthday voucher for this year?
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

    // Voucher expires at end of the same WIB day (23:59:59 WIB = 16:59:59 UTC)
    const expireWIB = new Date(
        Date.UTC(todayYear, nowWIB.getUTCMonth(), todayDay, 16, 59, 59)
    );

    // Create a 4-character random alphanumeric code
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
        `[Birthday Voucher] ✅ Issued voucher "${voucherId}" for member ${memberId} (${memberData.fullName}).`
    );
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 1: Daily Scheduler
// Runs every day at 00:01 WIB and checks ALL members.
// ─────────────────────────────────────────────────────────────────────────────
export const birthdayVoucherScheduler = onSchedule(
    {
        schedule: "1 17 * * *", // 00:01 WIB (UTC+7) = 17:01 UTC
        timeZone: "Asia/Jakarta",
        region: "us-central1",
    },
    async () => {
        logger.info("[Birthday Voucher Scheduler] Starting daily birthday check...");

        const membersSnap = await db.collection("Members").get();

        if (membersSnap.empty) {
            logger.info("[Birthday Voucher Scheduler] No members found. Exiting.");
            return;
        }

        let issued = 0;
        for (const memberDoc of membersSnap.docs) {
            const wasIssued = await issueBirthdayVoucherIfEligible(
                memberDoc.id,
                memberDoc.data()
            );
            if (wasIssued) issued++;
        }

        logger.info(`[Birthday Voucher Scheduler] Done. Issued ${issued} voucher(s).`);
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 2: onCreate Trigger
// Fires instantly when a new member registers.
// If they happen to register on their birthday, they get the voucher right away.
// ─────────────────────────────────────────────────────────────────────────────
export const onMemberCreated = onDocumentCreated(
    {
        document: "Members/{memberId}",
        region: "us-central1",
    },
    async (event) => {
        const memberId = event.params.memberId;
        const memberData = event.data?.data();

        if (!memberData) {
            logger.warn(`[Birthday Voucher onCreate] No data found for member ${memberId}.`);
            return;
        }

        logger.info(
            `[Birthday Voucher onCreate] New member registered: ${memberId} (${memberData.fullName}). Checking birthday...`
        );

        const wasIssued = await issueBirthdayVoucherIfEligible(memberId, memberData);

        if (wasIssued) {
            logger.info(
                `[Birthday Voucher onCreate] 🎂 Happy Birthday, ${memberData.fullName}! Voucher issued instantly on registration.`
            );
        } else {
            logger.info(
                `[Birthday Voucher onCreate] Member ${memberData.fullName} registered, but today is not their birthday. No voucher issued.`
            );
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// FUNCTION 3: Monthly Reward Distribution
// Triggers: 1st day of every month at 00:00
// ─────────────────────────────────────────────────────────────────────────────
export const distributeMonthlyRewards = onSchedule(
    {
        schedule: "0 0 1 * *", // 1st day of every month at 00:00
        timeZone: "Asia/Jakarta",
        region: "us-central1"
    },
    async () => {
        // 1. Determine the target month (the month that just finished)
        const now = new Date();
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

        logger.info(`🚀 Starting Monthly Reward distribution for: ${prevMonthStr}`);

        try {
            // 2. Load data from competitionRecords and Members
            const [compDoc, membersSnap] = await Promise.all([
                db.collection("competitionRecords").doc(prevMonthStr).get(),
                db.collection("Members").get(),
            ]);

            if (!compDoc.exists) {
                logger.info("ℹ️ No competition records found for last month. Skipping.");
                return;
            }

            const records = compDoc.data() || {};
            const memberMap = new Map();
            membersSnap.forEach((doc) => memberMap.set(doc.id, doc.data()));

            // 3. Group participants by Category
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

            // 4. Configuration for prizes
            const prizes = [25000, 15000, 10000]; // 1st (25k), 2nd (15k), 3rd (10k)
            const batch = db.batch();
            const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            let totalVouchers = 0;

            // Helper to generate 4-character uppercase alphanumeric ID
            const generateShortId = () => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
                let randomCode = '';
                for (let i = 0; i < 4; i++) {
                    randomCode += chars.charAt(Math.floor(Math.random() * chars.length));
                }
                return randomCode;
            };

            // 5. Process each category and rank members
            for (const [category, participants] of categoriesMap.entries()) {
                // Sort: Highest points first
                participants.sort((a, b) => b.points - a.points);

                const winners = participants.slice(0, 3);
                winners.forEach((winner, index) => {
                    const rank = index + 1;
                    const prizeValue = prizes[index];

                    // Create a random 4-char string for voucherId
                    const shortVoucherId = generateShortId();
                    const newVoucherRef = db.collection("vouchers").doc(); // Keep a strong backend ID

                    batch.set(newVoucherRef, {
                        userId: winner.id,
                        nama: winner.name,
                        type: "competitionReward",
                        value: prizeValue,
                        status: "READY_TO_CLAIM",
                        transactionRequirement: 10000, // Transaction requirement added
                        activeDate: admin.firestore.Timestamp.fromDate(now),
                        expireDate: admin.firestore.Timestamp.fromDate(currentMonthEnd),
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        voucherName: `Juara ${rank} ${category} - ${prevMonthStr}`,
                        voucherId: shortVoucherId, // 4-char format
                    });

                    totalVouchers++;
                });
            }

            // 6. Execute all writes atomicly
            if (totalVouchers > 0) {
                await batch.commit();
                logger.info(`✅ Success! Distributed ${totalVouchers} reward vouchers.`);
            } else {
                logger.info("ℹ️ No eligible winners found this month.");
            }
        } catch (error) {
            logger.error("❌ Error during reward distribution:", error);
        }
    }
);
