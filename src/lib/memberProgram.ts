import { Timestamp } from "firebase/firestore";
import { CompetitionRecord } from "@/types/member";
import { Voucher, VoucherGroup } from "@/types/voucher";
import { competitionRankingMode, type CompetitionRankingMode } from "../../functions/src/competitionPolicy";
export { competitionRankingMode, type CompetitionRankingMode };

export function rankCompetitionRecords(records: CompetitionRecord[], mode: CompetitionRankingMode, category?: unknown): CompetitionRecord[] {
  return sortCompetitionRecords(records.filter((record) =>
    record.memberId.trim() !== "" && record.points > 0 &&
    (mode === "global" || categoryMatches(record.category, category))));
}

export interface CompetitionPrizeWinner {
  memberId: string;
  rank: number;
  prizeAmount: number;
  category: string;
  rankingMode: CompetitionRankingMode;
}

export function competitionWinnerFromData(periodId: string, data: Record<string, unknown>): CompetitionPrizeWinner | null {
  const memberId = String(data.memberId ?? "").trim();
  const rank = parseProgramNumber(data.rank);
  const prizeAmount = parseProgramNumber(data.prizeAmount ?? data.value);
  if (!memberId || rank < 1 || rank > 3 || prizeAmount <= 0) return null;
  return { memberId, rank, prizeAmount, category: normalizeCompetitionCategory(data.category), rankingMode: competitionRankingMode(periodId, data) };
}

export type CompetitionCategoryKey = "santri" | "mahasiswa" | "staff_guru_dosen";

export const SUPPORTED_COMPETITION_CATEGORIES: CompetitionCategoryKey[] = [
  "santri",
  "mahasiswa",
  "staff_guru_dosen",
];

export interface ProgramOrderOption {
  groupName: string;
  optionName: string;
  priceAdjustment: number;
}

export interface ProgramOrderItem {
  namaPesanan: string;
  dineInQuantity: number;
  takeAwayQuantity: number;
  harga: number;
  selectedOptions: ProgramOrderOption[];
  orderedAt?: number;
  menuItemId?: string;
  customerNote?: string;
}

export type PointLedgerEventType = "earn" | "reverse" | "manual_adjustment";
export type PointLedgerStatus = "completed" | "pending" | "unknown";

export interface NormalizedPointTransaction {
  id: string;
  operationId: string;
  memberId: string;
  sourceType: string;
  sourceId: string;
  eventType: PointLedgerEventType | string;
  status: PointLedgerStatus;
  pointsDelta: number;
  grossTotal: number;
  finalBill: number;
  subTotal: number;
  takeAwayFee: number;
  ordinaryVoucherDiscount: number;
  b2bNominal: number;
  eligibleAmount: number;
  timestamp: unknown;
  transactionId: string;
  paymentMethod: string;
  orderItems: ProgramOrderItem[];
  campaignGroupId?: string;
  campaignVoucherId?: string;
  auditFlags: string[];
}

export function parseProgramNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "bigint") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
  if (typeof value !== "string") return fallback;

  const raw = value.trim();
  if (!raw) return fallback;
  // Match the POS Dart parser: integer strings are read directly, while
  // formatted legacy currency strings such as "Rp 10.000" are read by
  // retaining their digits.  Treating "12.5" as 12 here would disagree with
  // the POS parser, which interprets it as the legacy formatted value 125.
  if (/^-?\d+$/.test(raw)) {
    const direct = Number(raw);
    if (Number.isFinite(direct)) return Math.trunc(direct);
  }

  const negative = raw.startsWith("-");
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) return fallback;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? (negative ? -Math.trunc(parsed) : Math.trunc(parsed)) : fallback;
}

export function asProgramDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      const candidate = (value as { toDate?: () => Date }).toDate?.();
      return candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Accept both JavaScript milliseconds and common legacy Unix seconds.
    const milliseconds = Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function optionalProgramNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = parseProgramNumber(value, Number.NaN);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const result = String(value).trim();
    if (result) return result;
  }
  return "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

export function normalizeProgramOrderItems(value: unknown): ProgramOrderItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const data = raw as Record<string, unknown>;
    const selectedOptions = Array.isArray(data.selectedOptions)
      ? data.selectedOptions.flatMap((rawOption) => {
          if (!rawOption || typeof rawOption !== "object") return [];
          const option = rawOption as Record<string, unknown>;
          return [{
            groupName: stringValue(option.groupName, option.group, option.namaGroup),
            optionName: stringValue(option.optionName, option.name, option.namaOption),
            priceAdjustment: optionalProgramNumber(
              option.priceAdjustment,
              option.hargaTambahan,
              option.price,
            ) ?? 0,
          }];
        })
      : [];

    const name = stringValue(data.namaPesanan, data.name, data.menuName);
    if (!name) return [];
    return [{
      namaPesanan: name,
      dineInQuantity: optionalProgramNumber(data.dineInQuantity, data.dineInQty) ?? 0,
      takeAwayQuantity: optionalProgramNumber(data.takeAwayQuantity, data.takeAwayQty) ?? 0,
      harga: optionalProgramNumber(data.harga, data.price, data.unitPrice) ?? 0,
      selectedOptions,
      orderedAt: optionalProgramNumber(data.orderedAt, data.timestamp),
      menuItemId: stringValue(data.menuItemId, data.itemId) || undefined,
      customerNote: stringValue(data.customerNote, data.note) || undefined,
    }];
  });
}

export function normalizePointTransaction(
  id: string,
  data: Record<string, unknown>,
  statusData?: Record<string, unknown>,
): NormalizedPointTransaction {
  const status = statusData ?? {};
  const operationId = stringValue(data.operationId, id);
  const sourceType = stringValue(data.sourceType, status.sourceType);
  const sourceId = stringValue(data.sourceId, status.selfOrderId, statusDocId(status), id);
  const eventType = stringValue(data.eventType, "earn").toLowerCase();
  const rawStatus = stringValue(data.status, data.memberProgramStatus, "completed").toLowerCase();
  const normalizedStatus: PointLedgerStatus =
    rawStatus === "completed" ? "completed" : rawStatus === "pending" ? "pending" : "unknown";

  const finalBill = optionalProgramNumber(
    data.finalBill,
    status.finalTotal,
    status.total,
    data.total,
    data.totalAmount,
    data.grossTotal,
  ) ?? 0;
  const grossTotal = optionalProgramNumber(
    data.grossTotal,
    status.originalTotal,
    status.grossTotal,
    status.totalBeforeDiscount,
    finalBill,
  ) ?? finalBill;
  const b2bNominal = optionalProgramNumber(
    data.b2bNominal,
    data.b2bSponsoredNominal,
    data.programNominal,
    status.b2bNominal,
    status.b2bSponsoredNominal,
    status.programNominal,
  ) ?? 0;
  const eligibleAmount = optionalProgramNumber(
    data.eligibleAmount,
    data.eligibleAmountForPoints,
    status.eligibleAmount,
    status.eligibleAmountForPoints,
  ) ?? Math.max(0, finalBill - Math.max(0, b2bNominal));
  const pointsDelta = optionalProgramNumber(data.pointsDelta, data.pointsAdded, data.pointsAwarded) ?? 0;
  const timestamp = data.eventAt ?? data.timestamp ?? data.createdAt ?? status.settledAt ?? status.waktuPesan;
  const transactionId = stringValue(
    data.transactionId,
    status.transactionId,
    status.customerNumber,
    sourceId,
    id,
  );
  const explicitPaymentMethod = stringValue(
    data.paymentMethod,
    status.paymentMethod,
    status.transactionMethod,
  );
  const paymentMethod = explicitPaymentMethod || (
    sourceType === "self_order"
      ? "Pesanan mandiri"
      : sourceType === "open_bill_settlement"
        ? "Pelunasan tagihan"
        : sourceType === "edit" || sourceType === "edit_reverse"
          ? "Koreksi transaksi"
          : "Pembayaran"
  );
  const ordinaryVoucherDiscount = optionalProgramNumber(
    data.ordinaryVoucherDiscount,
    data.ordinaryVoucherDiscountAmount,
    status.ordinaryVoucherDiscount,
  ) ?? Math.max(0, grossTotal - finalBill);
  const auditFlags = Array.from(new Set([
    ...stringList(data.auditFlags),
    ...stringList(data.memberProgramAuditFlags),
    ...stringList(status.memberProgramAuditFlags),
  ]));

  return {
    id,
    operationId,
    memberId: stringValue(data.memberId, status.memberId),
    sourceType,
    sourceId,
    eventType,
    status: normalizedStatus,
    pointsDelta,
    grossTotal,
    finalBill,
    subTotal: optionalProgramNumber(data.subTotal, status.subTotal, finalBill) ?? finalBill,
    takeAwayFee: optionalProgramNumber(data.takeAwayFee, status.takeAwayFee) ?? 0,
    ordinaryVoucherDiscount,
    b2bNominal: Math.max(0, b2bNominal),
    // Reverse ledger entries intentionally carry negative eligible amounts;
    // clamping them would make the history disagree with the compensating
    // operation written by POS.
    eligibleAmount,
    timestamp,
    transactionId,
    paymentMethod,
    orderItems: normalizeProgramOrderItems(data.orderItems ?? status.orderItems),
    campaignGroupId: stringValue(data.campaignGroupId, status.campaignGroupId) || undefined,
    campaignVoucherId: stringValue(data.campaignVoucherId, status.campaignVoucherId) || undefined,
    auditFlags,
  };
}

function statusDocId(status: Record<string, unknown>): string {
  return stringValue(status.statusDocId, status.orderId, status.id);
}

export function pointEventLabel(event: NormalizedPointTransaction): string {
  if (event.status === "pending") return "Poin menunggu pemrosesan";
  if (event.status === "unknown") return "Transaksi perlu ditinjau";
  if (event.eventType === "reverse") return "Koreksi poin";
  if (event.eventType === "manual_adjustment") return "Penyesuaian poin admin";
  if (event.sourceType === "edit" || event.sourceType === "edit_reverse") return "Koreksi transaksi";
  if (event.sourceType === "self_order") return "Pesanan mandiri";
  if (event.sourceType === "open_bill_settlement") return "Pelunasan tagihan";
  return "Transaksi pembelian";
}

export function competitionMonthLabel(periodId: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(periodId.trim());
  if (!match) return periodId;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return periodId;
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 15, 12)));
}

export function recentCompetitionPeriods(current = jakartaPeriod(), count = 60): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(current);
  if (!match) return [current];
  const year = Number(match[1]);
  const month = Number(match[2]);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function isCompetitionMemberRecordData(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return ["customerPoints", "points", "amountSpent", "numberOfTransaction"].some(
    (key) => Object.prototype.hasOwnProperty.call(data, key),
  );
}

/** Calendar period using the same Asia/Jakarta boundary as the POS. */
export function jakartaPeriod(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : date.toISOString().slice(0, 7);
}

export function normalizeCompetitionCategory(value: unknown): CompetitionCategoryKey | "" {
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

export function competitionCategoryLabel(category: CompetitionCategoryKey | ""): string {
  switch (category) {
    case "santri":
      return "Santri";
    case "mahasiswa":
      return "Mahasiswa";
    case "staff_guru_dosen":
      return "Guru/Dosen/Staff";
    default:
      return "";
  }
}

export function categoryMatches(memberCategory: unknown, selectedCategory: unknown): boolean {
  const selected = normalizeCompetitionCategory(selectedCategory);
  return selected !== "" && normalizeCompetitionCategory(memberCategory) === selected;
}

export function isActiveCashbackCampaign(group: Partial<VoucherGroup>, now = new Date()): boolean {
  const start = asProgramDate(group.activeDate);
  const expiry = asProgramDate(group.expireDate);
  const status = String(group.status ?? "").toLowerCase();
  return (
    group.type === "cashbackCampaign" &&
    group.isActive === true &&
    status === "active" &&
    parseProgramNumber(group.threshold) > 0 &&
    parseProgramNumber(group.value) > 0 &&
    start !== null &&
    expiry !== null &&
    expiry.getTime() >= start.getTime() &&
    now.getTime() >= start.getTime() &&
    now.getTime() <= expiry.getTime()
  );
}

export function voucherStatusIsVisible(status: unknown): boolean {
  const normalized = String(status ?? "").toUpperCase();
  return normalized === "IN_PROGRESS" || normalized === "READY_TO_CLAIM";
}

export function voucherStatusIsHistory(status: unknown): boolean {
  const normalized = String(status ?? "").toUpperCase();
  return normalized === "CLAIMED" || normalized === "EXPIRED" || normalized === "DISABLED";
}

export function isVoucherWithinDates(voucher: Partial<Voucher>, now = new Date()): boolean {
  const start = asProgramDate(voucher.activeDate);
  const expiry = asProgramDate(voucher.expireDate);
  if (expiry && now.getTime() > expiry.getTime()) return false;
  if (start && now.getTime() < start.getTime()) return false;
  return true;
}

export function findCampaignVoucher(vouchers: Voucher[], groupId: string): Voucher | undefined {
  return vouchers
    .filter((voucher) => voucher.voucherGroupId?.trim() === groupId.trim())
    .sort((left, right) => {
      const leftReady = String(left.status ?? "").toUpperCase() === "READY_TO_CLAIM" ? 0 : 1;
      const rightReady = String(right.status ?? "").toUpperCase() === "READY_TO_CLAIM" ? 0 : 1;
      if (leftReady !== rightReady) return leftReady - rightReady;
      return String(left.id ?? "").localeCompare(String(right.id ?? ""));
    })[0];
}

export function competitionRecordFromData(memberId: string, data: Record<string, unknown>): CompetitionRecord {
  return {
    memberId: memberId.trim(),
    memberName: String(data.memberName ?? data.displayName ?? data.name ?? "").trim(),
    amountSpent: parseProgramNumber(data.amountSpent),
    points: parseProgramNumber(data.customerPoints ?? data.points),
    numberOfTransaction: parseProgramNumber(data.numberOfTransaction),
    category: String(data.category ?? data.memberCategory ?? ""),
    schemaVersion: parseProgramNumber(data.schemaVersion),
  };
}

/**
 * Combines the legacy monthly map with the canonical member subcollection.
 *
 * During the schema rollout, canonical records may contain only transactions
 * written after migration while the legacy monthly map still contains the
 * complete cumulative total.  Keep the legacy aggregate for overlapping
 * members, enrich it with canonical metadata, and retain canonical-only
 * members when a legacy key could not be materialized.
 */
export function mergeCompetitionRecords(
  legacyRecords: CompetitionRecord[],
  canonicalRecords: CompetitionRecord[],
): CompetitionRecord[] {
  const byMemberId = new Map<string, CompetitionRecord>();

  for (const record of legacyRecords) {
    byMemberId.set(record.memberId, record);
  }

  for (const record of canonicalRecords) {
    const existing = byMemberId.get(record.memberId);
    if (!existing) {
      byMemberId.set(record.memberId, record);
      continue;
    }

    byMemberId.set(record.memberId, {
      ...existing,
      memberName: existing.memberName || record.memberName,
      category: existing.category || record.category,
      schemaVersion: Math.max(existing.schemaVersion ?? 0, record.schemaVersion ?? 0),
    });
  }

  return sortCompetitionRecords(Array.from(byMemberId.values()));
}

export function sortCompetitionRecords(records: CompetitionRecord[]): CompetitionRecord[] {
  return [...records].sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.amountSpent !== left.amountSpent) return right.amountSpent - left.amountSpent;
    if (right.numberOfTransaction !== left.numberOfTransaction) {
      return right.numberOfTransaction - left.numberOfTransaction;
    }
    // POS uses Dart's plain String.compareTo for the final tie-breaker.
    // Avoid localeCompare here because browser locale settings could change
    // the order of otherwise equal members.
    return left.memberId < right.memberId ? -1 : left.memberId > right.memberId ? 1 : 0;
  });
}
