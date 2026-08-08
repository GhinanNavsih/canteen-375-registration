import { Timestamp } from "firebase/firestore";
import { CompetitionRecord } from "@/types/member";
import { Voucher, VoucherGroup } from "@/types/voucher";

export type CompetitionCategoryKey = "santri" | "mahasiswa" | "staff_guru_dosen";

export function parseProgramNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "string") return fallback;

  const raw = value.trim();
  if (!raw) return fallback;
  const direct = Number(raw);
  if (Number.isFinite(direct)) return Math.trunc(direct);

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
    const candidate = (value as { toDate?: () => Date }).toDate?.();
    return candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate : null;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
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
    memberId,
    memberName: "",
    amountSpent: parseProgramNumber(data.amountSpent),
    points: parseProgramNumber(data.customerPoints ?? data.points),
    numberOfTransaction: parseProgramNumber(data.numberOfTransaction),
    category: String(data.category ?? ""),
    schemaVersion: parseProgramNumber(data.schemaVersion),
  };
}

export function sortCompetitionRecords(records: CompetitionRecord[]): CompetitionRecord[] {
  return [...records].sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.amountSpent !== left.amountSpent) return right.amountSpent - left.amountSpent;
    if (right.numberOfTransaction !== left.numberOfTransaction) {
      return right.numberOfTransaction - left.numberOfTransaction;
    }
    return left.memberId.localeCompare(right.memberId);
  });
}
