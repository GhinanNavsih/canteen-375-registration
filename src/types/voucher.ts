import { Timestamp } from "firebase/firestore";

export interface VoucherGroup {
    id?: string;
    activeDate: Timestamp;
    createdAt: Timestamp;
    expireDate: Timestamp;
    isActive: boolean;
    threshold: number;
    totalClaimed: number;
    totalParticipants: number;
    transactionRequirement?: number;
    type: string;
    value: number;
    voucherGroupId: string;
    voucherName: string;
}

export interface Voucher {
    id?: string;
    activeDate: Timestamp;
    createdAt: Timestamp;
    expireDate: Timestamp;
    isActive: boolean;
    lastUpdatedAt: Timestamp;
    nama?: string;
    Nama?: string;
    status: string; // "IN_PROGRESS" | "READY_TO_CLAIM" | "CLAIMED"
    threshold: number;
    transactionRequirement?: number;
    type: string;
    userId: string;
    userPoints: number;
    value: number;
    voucherGroupId: string;
    voucherId?: string;
    voucherName: string;
}
