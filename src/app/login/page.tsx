"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useMember } from "@/hooks/useMember";
import { Member } from "@/types/member";

export default function LoginPage() {
    const [fullName, setFullName] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const { loginMember } = useMember();
    const router = useRouter();

    const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let value = e.target.value;
        const numbers = value.replace(/\D/g, "");
        const charCount = numbers.length;

        if (charCount <= 2) {
            value = numbers;
        } else if (charCount <= 4) {
            value = `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
        } else {
            value = `${numbers.slice(0, 2)}-${numbers.slice(2, 4)}-${numbers.slice(4, 8)}`;
        }
        setDateOfBirth(value);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const q = query(
                collection(db, "Members"),
                where("fullName", "==", fullName),
                where("dateOfBirth", "==", dateOfBirth)
            );

            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                setError("Member tidak ditemukan. Pastikan nama dan tanggal lahir sudah sesuai.");
            } else {
                const doc = querySnapshot.docs[0];
                const memberData = { id: doc.id, ...doc.data() } as Member;
                loginMember(memberData);
                router.push("/dashboard");
            }
        } catch (err) {
            console.error(err);
            setError("Terjadi kesalahan saat login. Silakan coba lagi.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main>
            <div className="container animate-fade-in">
                <div className="logo-container">
                    <Image
                        src="/Logo Canteen 375 (2).png"
                        alt="Canteen 375 Logo"
                        width={100}
                        height={100}
                        className="logo-image"
                        priority
                    />
                    <div className="logo-text">
                        <h1>Canteen 375</h1>
                        <p>Member Login</p>
                    </div>
                </div>

                <form onSubmit={handleLogin}>
                    <div className="form-group">
                        <label htmlFor="fullName">Nama Lengkap</label>
                        <input
                            type="text"
                            id="fullName"
                            placeholder="Masukkan nama lengkap"
                            required
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="dateOfBirth">Tanggal Lahir</label>
                        <input
                            type="text"
                            id="dateOfBirth"
                            placeholder="dd-mm-yyyy"
                            inputMode="numeric"
                            maxLength={10}
                            required
                            value={dateOfBirth}
                            onChange={handleDobChange}
                        />
                    </div>

                    {error && <p style={{ color: "var(--error)", marginBottom: "1rem", textAlign: "center" }}>{error}</p>}

                    <button type="submit" className="btn-submit" disabled={loading}>
                        {loading ? "Mencari Member..." : "Login"}
                    </button>

                    <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.9rem", color: "var(--primary)" }}>
                        Belum jadi member?{" "}
                        <a href="/register" style={{ fontWeight: "700", textDecoration: "underline", cursor: "pointer" }}>
                            Daftar Sekarang
                        </a>
                    </p>
                </form>
            </div>
        </main>
    );
}
