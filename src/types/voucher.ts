import { Timestamp } from "firebase/firestore";

export interface VoucherGroup {
    id?: string;
    activeDate?: Timestamp;
    createdAt?: Timestamp;
    expireDate?: Timestamp;
    isActive?: boolean;
    status?: "active" | "archived" | string;
    schemaVersion?: number;
    threshold?: number;
    totalClaimed?: number;
    totalParticipants?: number;
    totalRedemptions?: number;
    termsRevision?: number;
    transactionRequirement?: number;
    type: string;
    value?: number;
    voucherGroupId?: string;
    voucherName?: string;
}

export interface Voucher {
    id?: string;
    activeDate?: Timestamp;
    createdAt?: Timestamp;
    expireDate?: Timestamp;
    isActive?: boolean;
    lastUpdatedAt?: Timestamp;
    nama?: string;
    Nama?: string;
    status?: string; // IN_PROGRESS | READY_TO_CLAIM | CLAIMED | EXPIRED | DISABLED
    schemaVersion?: number;
    isClaimed?: boolean;
    threshold?: number;
    transactionRequirement?: number;
    type: string;
    userId: string;
    userPoints?: number;
    value?: number;
    valueRemaining?: number;
    valueUsed?: number;
    voucherGroupId?: string;
    voucherId?: string;
    voucherName?: string;
    competitionPeriod?: string;
    competitionPrizePeriod?: string;
    rankingMode?: "category" | "global";
    competitionCategory?: string;
    competitionRank?: number;
}
