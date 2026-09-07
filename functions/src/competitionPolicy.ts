// Pure policy shared with the member web app; Dart parity is tested with the
// competition-policy.json fixture in both repositories.
export type CompetitionRankingMode = "category" | "global";
export const GLOBAL_COMPETITION_START = "2026-09";
export const GLOBAL_PRIZES: Record<number, number> = {1: 50000, 2: 25000, 3: 15000};
export const SUPPORTED_CATEGORIES = ["santri", "mahasiswa", "staff_guru_dosen"] as const;
export const LEGACY_PRIZES = Object.fromEntries(SUPPORTED_CATEGORIES.map((category) => [category, GLOBAL_PRIZES]));

export function competitionRankingMode(periodId: string, data: Record<string, unknown> = {}): CompetitionRankingMode {
  if (data.rankingMode === "global" || data.rankingMode === "category") return data.rankingMode;
  return periodId >= GLOBAL_COMPETITION_START ? "global" : "category";
}

export type CompetitionRecord = {
  memberId: string;
  memberName: string;
  category: string;
  customerPoints: number;
  amountSpent: number;
  numberOfTransaction: number;
};

export type CompetitionWinner = CompetitionRecord & {
  periodId: string;
  rankingMode: CompetitionRankingMode;
  rank: number;
  prizeAmount: number;
  voucherId: string;
};

export function sortCompetitionRecords(records: CompetitionRecord[]): CompetitionRecord[] {
  return [...records].sort((a, b) =>
    b.customerPoints - a.customerPoints || b.amountSpent - a.amountSpent ||
    b.numberOfTransaction - a.numberOfTransaction ||
    (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
}

function safeId(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
}

function hashId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) & 0x7fffffff;
  }
  return hash.toString(16);
}

export function prizeVoucherId(periodId: string, category: string, rank: number, memberId: string, mode: CompetitionRankingMode): string {
  if (mode === "global") return `competition_${safeId(periodId)}_global_${rank}_${hashId(memberId)}`;
  // Preserve historical scheduler identifiers. New legacy issuance is guarded.
  const readable = `competition_${safeId(periodId)}_${safeId(category)}_${rank}_${safeId(memberId)}`;
  if (readable.length <= 120 && safeId(periodId) === periodId && safeId(memberId) === memberId) return readable;
  return `competition_${hashId(periodId)}_${hashId(category)}_${rank}_${hashId(memberId)}`;
}

export function winnerDocumentId(winner: Pick<CompetitionWinner, "rankingMode" | "category" | "rank">): string {
  return winner.rankingMode === "global" ? `rank_${winner.rank}` : `${winner.category}_${winner.rank}`;
}

export function buildWinners(periodId: string, records: CompetitionRecord[], mode = competitionRankingMode(periodId)): CompetitionWinner[] {
  const winners: CompetitionWinner[] = [];
  const groups = mode === "global" ? [null] : [...SUPPORTED_CATEGORIES];
  for (const category of groups) {
    const ranked = sortCompetitionRecords(records.filter((record) =>
      record.memberId.trim() !== "" && record.customerPoints > 0 &&
      (category === null || record.category === category)));
    ranked.slice(0, 3).forEach((record, index) => {
      const rank = index + 1;
      winners.push({...record, periodId, rankingMode: mode, rank, prizeAmount: GLOBAL_PRIZES[rank],
        voucherId: prizeVoucherId(periodId, record.category, rank, record.memberId, mode)});
    });
  }
  return winners;
}
