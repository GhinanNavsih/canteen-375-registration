export type Category = "Santri" | "Mahasiswa" | "Guru/Dosen/Staff" | "";

export interface Member {
    id: string;      // Firestore document ID (same as uid)
    uid: string;     // Firebase Auth UID — primary identity key
    fullName: string;
    gender: string;
    dateOfBirth: string;
    email: string;
    // Legacy profiles contain several spellings; normalize only when ranking.
    category: Category | string;
    role: "member" | "admin"; // RBAC via Custom Claims
    points: number;
    createdAt: unknown;
    // Santri fields
    unitEducation?: string;
    asrama?: string;
    // Shared optional field — required for Mahasiswa/Guru, optional for Santri
    phoneNumber?: string;
    // Mahasiswa fields
    faculty?: string;
    major?: string;
    residence?: string;
    // Guru/Dosen fields
    institution?: string;
    workLocation?: string;
}

export interface CompetitionRecord {
    amountSpent: number;
    points: number;
    numberOfTransaction: number;
    memberName: string;
    memberId: string;
    category?: string;
    schemaVersion?: number;
}

export interface Feedback {
    id?: string;
    memberId: string;
    memberName: string;
    content: string;
    timestamp: unknown;
    status: string;
}
