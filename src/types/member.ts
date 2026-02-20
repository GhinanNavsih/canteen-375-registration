export type Category = "Santri" | "Mahasiswa" | "Guru/Dosen" | "";

export interface Member {
    id: string;
    fullName: string;
    gender: string;
    dateOfBirth: string;
    email: string;
    category: Category;
    points: number;
    createdAt: any;
    // Santri fields
    unitEducation?: string;
    asrama?: string;
    // Mahasiswa fields
    phoneNumber?: string;
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
}
