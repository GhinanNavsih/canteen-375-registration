"use client";

import { useState } from "react";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { signInWithEmailAndPassword, getAuth } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { userIsAdminFromToken } from "@/lib/adminAuth";

export default function LoginForm() {
    const searchParams = useSearchParams();
    const redirect = searchParams.get("redirect") || "/dashboard";
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            console.log("[LOGIN] Starting login for email:", email);

            // Firebase Auth handles credential verification — no manual Firestore read needed.
            const userCred = await signInWithEmailAndPassword(auth, email, password);
            console.log("[LOGIN] Sign-in successful. User UID:", userCred.user.uid);
            console.log("[LOGIN] User email:", userCred.user.email);

            // Check if admin to redirect appropriately
            console.log("[LOGIN] Fetching ID token result...");
            const tokenResult = await userCred.user.getIdTokenResult(false);
            console.log("[LOGIN] Token result obtained");
            console.log("[LOGIN] All claims:", tokenResult.claims);
            console.log("[LOGIN] Admin claim value:", tokenResult.claims.admin);

            const isAdminUser = userIsAdminFromToken(userCred.user, tokenResult.claims as { admin?: boolean });
            console.log("[LOGIN] Is admin user?", isAdminUser);

            // Redirect to /admin/menu for admins, otherwise use the passed redirect or default to /dashboard
            const redirectPath = isAdminUser ? "/admin/menu" : redirect;
            console.log("[LOGIN] Redirecting to:", redirectPath);
            router.push(redirectPath);
        } catch (err: any) {
            console.error(err);
            const code = err.code as string;
            if (
                code === "auth/user-not-found" ||
                code === "auth/wrong-password" ||
                code === "auth/invalid-credential"
            ) {
                setError("Email atau password salah. Silakan coba lagi.");
            } else if (code === "auth/invalid-email") {
                setError("Format email tidak valid.");
            } else if (code === "auth/too-many-requests") {
                setError("Terlalu banyak percobaan. Coba lagi beberapa saat.");
            } else {
                setError("Terjadi kesalahan saat login. Silakan coba lagi.");
            }
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
                        <label htmlFor="email">Alamat Email</label>
                        <input
                            type="email"
                            id="email"
                            placeholder="contoh@email.com"
                            required
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="form-group" style={{ position: "relative" }}>
                        <label htmlFor="password">Password</label>
                        <input
                            type={showPassword ? "text" : "password"}
                            id="password"
                            placeholder="Masukkan password"
                            required
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ paddingRight: "3rem" }}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            style={{
                                position: "absolute",
                                right: "1rem",
                                top: "calc(1.6rem + 22px)",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: "1.2rem",
                                lineHeight: 1,
                                color: "#8d6e63"
                            }}
                            aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                        >
                            {showPassword ? "🙈" : "👁️"}
                        </button>
                    </div>

                    {error && (
                        <p style={{ color: "var(--error)", marginBottom: "1rem", textAlign: "center", fontSize: "0.9rem" }}>
                            {error}
                        </p>
                    )}

                    <button type="submit" className="btn-submit" disabled={loading}>
                        {loading ? "Masuk..." : "Login"}
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
