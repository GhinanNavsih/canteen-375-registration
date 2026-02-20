"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { useMember } from "@/context/MemberContext";
import { Member } from "@/types/member";

export default function LoginPage() {
    const [fullName, setFullName] = useState("");
    const [dateOfBirth, setDateOfBirth] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [allNames, setAllNames] = useState<string[]>([]);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const { loginMember } = useMember();
    const router = useRouter();
    const suggestionRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Fetch all names for autocomplete
        const fetchNames = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "Members"));
                const names = Array.from(new Set(querySnapshot.docs.map(doc => doc.data().fullName as string)));
                setAllNames(names);
            } catch (err) {
                console.error("Error fetching names:", err);
            }
        };
        fetchNames();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setFullName(value);

        if (value.length > 1) {
            const filtered = allNames.filter(name =>
                name.toLowerCase().includes(value.toLowerCase())
            ).slice(0, 5); // Limit to top 5 suggestions
            setSuggestions(filtered);
            setShowSuggestions(filtered.length > 0);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    };

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

                <form onSubmit={handleLogin} style={{ position: "relative" }}>
                    <div className="form-group" style={{ position: "relative" }}>
                        <label htmlFor="fullName">Nama Lengkap</label>
                        <input
                            type="text"
                            id="fullName"
                            placeholder="Masukkan nama lengkap"
                            required
                            autoComplete="off"
                            value={fullName}
                            onChange={handleNameChange}
                            onFocus={() => fullName.length > 1 && suggestions.length > 0 && setShowSuggestions(true)}
                        />
                        {showSuggestions && (
                            <div
                                className="suggestions-dropdown"
                                ref={suggestionRef}
                            >
                                {suggestions.map((name, index) => (
                                    <div
                                        key={index}
                                        className="suggestion-item"
                                        onClick={() => {
                                            setFullName(name);
                                            setShowSuggestions(false);
                                        }}
                                    >
                                        {name}
                                    </div>
                                ))}
                            </div>
                        )}
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

            <style jsx>{`
        .suggestions-dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: white;
          border: 1.5px solid #000;
          border-radius: 12px;
          margin-top: 5px;
          z-index: 1000;
          box-shadow: 0 4px 15px rgba(0,0,0,0.1);
          overflow: hidden;
          animation: slideDown 0.2s ease-out;
        }
        .suggestion-item {
          padding: 10px 15px;
          cursor: pointer;
          font-weight: 500;
          color: #2d241d;
          transition: background 0.2s;
        }
        .suggestion-item:hover {
          background: #faf7f2;
          color: #C51720;
        }
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
        </main>
    );
}
