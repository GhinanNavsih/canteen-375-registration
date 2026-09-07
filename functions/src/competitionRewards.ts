import * as admin from "firebase-admin";
import type {DocumentData} from "firebase-admin/firestore";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {setGlobalOptions} from "firebase-functions/v2";
import {buildWinners, competitionRankingMode, CompetitionRecord, GLOBAL_COMPETITION_START, GLOBAL_PRIZES, winnerDocumentId} from "./competitionPolicy";

setGlobalOptions({region: "us-central1"});

function parseIntValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== "string") return fallback;
  const raw = value.trim();
  if (!raw) return fallback;
  if (/^-?\d+$/.test(raw)) {
    const direct = Number(raw);
    return Number.isFinite(direct) ? Math.trunc(direct) : fallback;
  }
  const negative = raw.startsWith("-");
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return fallback;
  const parsed = Number(digits);
  if (!Number.isFinite(parsed)) return fallback;
  return negative ? -Math.trunc(parsed) : Math.trunc(parsed);
}

function normalizeCategory(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized.includes("santri")) return "santri";
  if (normalized.includes("mahasiswa")) return "mahasiswa";
  if (
    normalized.includes("staff") ||
    normalized.includes("staf") ||
    normalized.includes("guru") ||
    normalized.includes("dosen")
  ) {
    return "staff_guru_dosen";
  }
  return "";
}

function displayName(data: Record<string, unknown>): string {
  const value = String(data.fullName ?? data.memberName ?? data.name ?? data.nama ?? "").trim();
  return value.length <= 120 ? value : value.slice(0, 120);
}

function isCompetitionStats(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return ["customerPoints", "points", "amountSpent", "numberOfTransaction"].some(
    (key) => Object.prototype.hasOwnProperty.call(data, key),
  );
}

function recordFromData(
  memberId: string,
  data: Record<string, unknown>,
  profile?: Record<string, unknown>,
): CompetitionRecord {
  return {
    memberId: memberId.trim(),
    memberName: displayName(data) || displayName(profile ?? {}),
    category:
      normalizeCategory(data.category ?? data.memberCategory) ||
      normalizeCategory(profile?.category ?? profile?.memberCategory ?? profile?.role),
    customerPoints: parseIntValue(data.customerPoints ?? data.points),
    amountSpent: parseIntValue(data.amountSpent),
    numberOfTransaction: parseIntValue(data.numberOfTransaction),
  };
}

/**
 * The root monthly map is cumulative. The nested collection was introduced
 * during migration and can contain only post-migration increments. For an
 * overlapping member, keep the root totals and use the nested record only to
 * fill metadata. A nested-only member remains visible as a fallback.
 */
export function mergeCompetitionRecords(
  rootData: DocumentData,
  canonicalDocs: Array<{ id: string; data: () => DocumentData }>,
  profiles: Map<string, Record<string, unknown>>,
): CompetitionRecord[] {
  const records = new Map<string, CompetitionRecord>();

  for (const [memberId, value] of Object.entries(rootData)) {
    if (!isCompetitionStats(value)) continue;
    const id = memberId.trim();
    if (!id) continue;
    records.set(id, recordFromData(id, value, profiles.get(id)));
  }

  for (const doc of canonicalDocs) {
    const id = doc.id.trim();
    if (!id || !isCompetitionStats(doc.data())) continue;
    const canonical = recordFromData(id, doc.data(), profiles.get(id));
    const existing = records.get(id);
    if (!existing) {
      records.set(id, canonical);
      continue;
    }
    records.set(id, {
      ...existing,
      memberName: existing.memberName || canonical.memberName,
      category: existing.category || canonical.category,
    });
  }

  return [...records.values()];
}

function jakartaYearMonth(date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function previousJakartaPeriod(date = new Date()): string {
  const {year, month} = jakartaYearMonth(date);
  const previous = new Date(Date.UTC(year, month - 2, 1));
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`;
}

function followingMonthEnd(periodId: string): Date {
  const [yearText, monthText] = periodId.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  // 23:59:59 on the final Jakarta day of the following month.
  return new Date(Date.UTC(year, month + 1, 0, 16, 59, 59));
}

export async function readCompetitionRecords(
  db: FirebaseFirestore.Firestore,
  periodId: string,
): Promise<CompetitionRecord[]> {
  const periodRef = db.collection("competitionRecords").doc(periodId);
  const [periodSnapshot, canonicalSnapshot, membersSnapshot] = await Promise.all([
    periodRef.get(),
    periodRef.collection("members").get(),
    db.collection("Members").get(),
  ]);
  const profiles = new Map<string, Record<string, unknown>>();
  for (const member of membersSnapshot.docs) {
    profiles.set(member.id.trim(), member.data() as Record<string, unknown>);
  }
  return mergeCompetitionRecords(
    periodSnapshot.data() ?? {},
    canonicalSnapshot.docs,
    profiles,
  );
}

export async function finalizeCompetitionPeriod(
  db: FirebaseFirestore.Firestore,
  periodId: string,
  actorId: string,
  now = new Date(),
): Promise<number> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodId) || periodId > previousJakartaPeriod(now)) {
    throw new Error("The Jakarta competition month has not ended or is invalid.");
  }
  const periodRef = db.collection("competitionRecords").doc(periodId);
  const prizeRef = db.collection("competitionPrizes").doc(periodId);
  const operationId = `finalize_${periodId}`;

  const lockResult = await db.runTransaction(async (transaction) => {
    const periodSnapshot = await transaction.get(periodRef);
    const prizeSnapshot = await transaction.get(prizeRef);
    const periodData = periodSnapshot.data() ?? {};
    const prizeData = prizeSnapshot.data() ?? {};
    const status = String(periodData.status ?? prizeData.status ?? "open").toLowerCase();
    if (status === "finalized" || String(prizeData.status ?? "").toLowerCase() === "finalized") {
      return "already_finalized";
    }
    // Legacy vouchers often lack structured period metadata. Never reissue an
    // old month just because it has no competitionPrizes document.
    if (periodId < GLOBAL_COMPETITION_START || competitionRankingMode(periodId, periodData) !== "global") {
      return "legacy_reconciliation_required";
    }
    if (now >= followingMonthEnd(periodId)) throw new Error("The prize issuance window has ended.");
    const existingOperation = periodData.finalizationOperationId;
    if (
      status === "finalizing" &&
      existingOperation &&
      existingOperation !== operationId
    ) {
      throw new Error("Another administrator is finalizing this competition period.");
    }
    transaction.set(
      periodRef,
      {
        schemaVersion: 3,
        rankingMode: "global",
        winnerCount: 3,
        periodId,
        status: "finalizing",
        finalizationOperationId: operationId,
        finalizationActorId: actorId,
        finalizationStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
    return "locked";
  });

  if (lockResult !== "locked") {
    console.log(`Competition ${periodId}: ${lockResult}. No vouchers issued.`);
    return 0;
  }

  const records = await readCompetitionRecords(db, periodId);
  const winners = buildWinners(periodId, records, "global");
  const expiry = followingMonthEnd(periodId);

  return db.runTransaction(async (transaction) => {
    const periodSnapshot = await transaction.get(periodRef);
    const prizeSnapshot = await transaction.get(prizeRef);
    const periodData = periodSnapshot.data() ?? {};
    const prizeData = prizeSnapshot.data() ?? {};
    if (
      String(periodData.status ?? "").toLowerCase() === "finalized" ||
      String(prizeData.status ?? "").toLowerCase() === "finalized"
    ) {
      return 0;
    }
    if (
      String(periodData.status ?? "").toLowerCase() !== "finalizing" ||
      periodData.rankingMode !== "global" ||
      periodData.finalizationOperationId !== operationId
    ) {
      throw new Error("The competition finalization lock is invalid or expired.");
    }

    const winnerRefs = winners.map((winner) =>
      prizeRef.collection("winners").doc(winnerDocumentId(winner)),
    );
    const voucherRefs = winners.map((winner) =>
      db.collection("vouchers").doc(winner.voucherId),
    );
    const winnerSnapshots = [];
    const voucherSnapshots = [];
    for (const winnerRef of winnerRefs) winnerSnapshots.push(await transaction.get(winnerRef));
    for (const voucherRef of voucherRefs) voucherSnapshots.push(await transaction.get(voucherRef));

    for (let index = 0; index < winners.length; index += 1) {
      const winner = winners[index];
      const winnerSnapshot = winnerSnapshots[index];
      const existingWinner = winnerSnapshot.data() ?? {};
      if (
        winnerSnapshot.exists &&
        (existingWinner.memberId !== winner.memberId ||
          parseIntValue(existingWinner.prizeAmount) !== winner.prizeAmount ||
          existingWinner.voucherId !== winner.voucherId || existingWinner.rankingMode !== "global")
      ) {
        throw new Error(`Stored winner data conflicts for ${winner.category} rank ${winner.rank}.`);
      }

      const voucherSnapshot = voucherSnapshots[index];
      const existingVoucher = voucherSnapshot.data() ?? {};
      if (voucherSnapshot.exists) {
        const status = String(existingVoucher.status ?? "").toUpperCase();
        if (
          existingVoucher.competitionPrizePeriod !== winner.periodId ||
          existingVoucher.rankingMode !== "global" ||
          parseIntValue(existingVoucher.competitionRank) !== winner.rank ||
          existingVoucher.type !== "competitionPrize" ||
          existingVoucher.userId !== winner.memberId ||
          parseIntValue(existingVoucher.value) !== winner.prizeAmount
        ) {
          throw new Error(`Stored prize voucher conflicts for ${winner.voucherId}.`);
        }
        if (["CLAIMED", "DISABLED", "EXPIRED"].includes(status) || existingVoucher.isClaimed === true) {
          throw new Error(`Prize voucher ${winner.voucherId} has already been used or disabled.`);
        }
        if (status !== "READY_TO_CLAIM") {
          throw new Error(`Prize voucher ${winner.voucherId} has an ambiguous status.`);
        }
      }

      transaction.set(
        winnerRefs[index],
        {
          schemaVersion: 3,
          rankingMode: "global",
          periodId: winner.periodId,
          category: winner.category,
          rank: winner.rank,
          memberId: winner.memberId,
          points: winner.customerPoints,
          amountSpent: winner.amountSpent,
          numberOfTransaction: winner.numberOfTransaction,
          prizeAmount: winner.prizeAmount,
          voucherId: winner.voucherId,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        {merge: true},
      );
      if (!voucherSnapshot.exists) {
        transaction.set(
          voucherRefs[index],
          {
            schemaVersion: 3,
            rankingMode: "global",
            voucherId: winner.voucherId,
            type: "competitionPrize",
            competitionPrizePeriod: winner.periodId,
            competitionCategory: winner.category,
            competitionRank: winner.rank,
            userId: winner.memberId,
            nama: winner.memberName,
            value: winner.prizeAmount,
            valueRemaining: winner.prizeAmount,
            valueUsed: 0,
            sekaliPakai: true,
            isActive: true,
            isClaimed: false,
            status: "READY_TO_CLAIM",
            activeDate: admin.firestore.Timestamp.now(),
            expireDate: admin.firestore.Timestamp.fromDate(expiry),
            transactionRequirement: 10000,
            voucherName: `Hadiah Kompetisi Global #${winner.rank}`,
            issuedByOperationId: operationId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          {merge: true},
        );
      }
    }

    transaction.set(
      prizeRef,
      {
        schemaVersion: 3,
        rankingMode: "global",
        winnerCount: 3,
        periodId,
        status: "finalized",
        finalizationOperationId: operationId,
        actorId,
        finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
        prizeExpiry: admin.firestore.Timestamp.fromDate(expiry),
        configuration: {
          schemaVersion: 2,
          amountsByRank: GLOBAL_PRIZES,
        },
        winners: winners.map((winner) => ({
          schemaVersion: 3,
          rankingMode: "global",
          periodId: winner.periodId,
          category: winner.category,
          rank: winner.rank,
          memberId: winner.memberId,
          points: winner.customerPoints,
          amountSpent: winner.amountSpent,
          numberOfTransaction: winner.numberOfTransaction,
          prizeAmount: winner.prizeAmount,
          voucherId: winner.voucherId,
        })),
      },
      {merge: true},
    );
    transaction.update(periodRef, {
      status: "finalized",
      finalizedAt: admin.firestore.FieldValue.serverTimestamp(),
      finalizationOperationId: operationId,
    });
    return winners.length;
  });
}

/**
 * Finalizes the previous Jakarta calendar month at 00:00 on the first day.
 * The deterministic period/voucher IDs and the finalization lock make this
 * safe if Cloud Scheduler retries or an administrator presses finalization
 * manually at the same time.
 */
export const distributeMonthlyRewards = onSchedule(
  {
    schedule: "0 0 1 * *",
    timeZone: "Asia/Jakarta",
    region: "us-central1",
    retryCount: 3,
  },
  async () => {
    const periodId = previousJakartaPeriod();
    console.log(`Starting monthly competition finalization for ${periodId}.`);
    try {
      const count = await finalizeCompetitionPeriod(
        admin.firestore(),
        periodId,
        "scheduled_monthly_finalizer",
      );
      console.log(`Monthly competition finalization complete for ${periodId}: ${count} vouchers issued.`);
    } catch (error) {
      console.error(`Monthly competition finalization failed for ${periodId}.`, error);
      throw error;
    }
  },
);
