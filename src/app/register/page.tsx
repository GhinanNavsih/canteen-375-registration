"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

type Category = "Santri" | "Mahasiswa" | "Guru/Dosen" | "";

const FORMAL_SCHOOLS = [
  "SMA DU 1 Unggulan BPPT",
  "SMA DU 2 Unggulan BPPT-CIS",
  "SMA DU 3",
  "SMK DU 1",
  "SMK Telekomunikasi DU",
  "MAN 2 Jombang",
  "MA Unggulan Darul Ulum",
  "SMP DU 1 Unggulan",
  "SMP DU 2",
  "SMPN 3 Peterongan (SMP DU 3)",
  "MTsN 2 Jombang",
  "MTs Plus Darul Ulum",
  "MIN Darul Ulum",
  "SD Plus Darul Ulum"
];

const ASRAMA_LIST = [
  "Asrama Induk Al Ghozali",
  "Asrama Induk Raden Rachmat",
  "Asrama Induk Raden Fatah",
  "Asrama Induk Ibnu Sina",
  "Asrama Induk Falastine",
  "Asrama I Al Masyhari",
  "Asrama II Al Khodijah",
  "Asrama III Nusantara",
  "Asrama IV-H Al Insyiroh",
  "Asrama IV-M Ainul Yaqin",
  "Asrama V Haflatul Mubarok",
  "Asrama VI Asyafi'iyah",
  "Asrama VII Al Husna",
  "Asrama VIII Robiatul Adawiyah",
  "Asrama IX Al Kautsar",
  "Asrama X Hurun Iin",
  "Asrama XI Muzamzamah",
  "Asrama XII Bani Umar",
  "Asrama XIII Sulaiman-Bilqis",
  "Asrama XIV Hidayatul Qur'An",
  "Asrama XV Al Falah",
  "Asrama XVI Safarulma",
  "Asrama XVII Arromel",
  "Asrama XVIII Al Hunnain",
  "Asrama XIX Wisma Ka'Bah",
  "Asrama XX Alhambra",
  "Asrama XX1 Ardales",
  "Asrama XXII Pondok Tinggi (Ponti)",
  "Asrama XXIII Baitul Maqdis",
  "Asrama XXIV Al Madinah",
  "Asrama XXV Al As'Adiyah",
  "Asrama XXVI Al Hasyimi",
  "Asrama XXVII Al Furqon",
  "Asrama XXVIII Ar Rifa'I"
];

const FACULTY_MAJOR_MAP: Record<string, string[]> = {
  "Agama Islam": ["S1 Pend. Agama Islam", "S1 Hukum Keluarga", "S1 PGMI"],
  "Ilmu Kesehatan": ["S1 Ilmu Keperawatan", "D3 Keperawatan", "D3 Kebidanan", "Profesi Ners"],
  "Bisnis/Bahasa/Pendidikan": [
    "S1 Administrasi Bisnis",
    "S1 Sastra Inggris",
    "D3 Bahasa Jepang",
    "S1 Pendidikan Matematika",
    "S1 Pendidikan B. Inggris"
  ],
  "Sains & Teknologi": ["S1 Sistem Informasi", "S1 Matematika"],
  "Pascasarjana": ["S2 Manajemen Pend. Islam", "S2 Kesehatan Masyarakat"]
};

export default function RegistrationPage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    fullName: "",
    gender: "",
    dateOfBirth: "",
    email: "",
    category: "" as Category,
    // Santri fields
    unitEducation: "",
    asrama: "",
    // Mahasiswa fields
    phoneNumber: "+62",
    faculty: "",
    major: "",
    residence: "",
    // Guru/Dosen fields
    institution: "",
    workLocation: ""
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    let { name, value } = e.target;

    // Fixed +62 prefix for phone number
    if (name === "phoneNumber") {
      if (!value.startsWith("+62")) {
        value = "+62" + value.replace(/^\+?6?2?/, "");
      }
      // Allow only digits after +62
      const prefix = "+62";
      const rest = value.slice(3).replace(/\D/g, "");
      value = prefix + rest;
    }

    // Auto-format Date of Birth (dd-mm-yyyy)
    if (name === "dateOfBirth") {
      const numbers = value.replace(/\D/g, "");
      const charCount = numbers.length;

      if (charCount <= 2) {
        value = numbers;
      } else if (charCount <= 4) {
        value = `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
      } else {
        value = `${numbers.slice(0, 2)}-${numbers.slice(2, 4)}-${numbers.slice(4, 8)}`;
      }
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const { category, fullName, phoneNumber } = formData;
      let docId = "";

      if (category === "Santri") {
        const timestamp = Math.floor(Date.now() / 1000);
        docId = `${fullName.replace(/\s+/g, "")}_${timestamp}`;
      } else {
        // Remove spaces/dashes from phone number and spaces from name
        const cleanPhone = phoneNumber.replace(/[\s\-]/g, "");
        docId = `${fullName.replace(/\s+/g, "")}_${cleanPhone}`;
      }

      const finalData = {
        ...formData,
        points: 0,
        createdAt: serverTimestamp(),
      };

      await setDoc(doc(db, "Members", docId), finalData);
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError("Pendaftaran gagal. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
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
            />
            <div className="logo-text">
              <h1>Canteen 375</h1>
              <p>Pendaftaran Member Berhasil</p>
            </div>
          </div>
          <div className="success-message">
            <h2>Selamat Datang di Canteen 375!</h2>
            <p>Terima kasih telah mendaftar, {formData.fullName}. Akun member Anda sekarang aktif.</p>
          </div>
          <button className="btn-submit" onClick={() => window.location.reload()}>
            Daftarkan Member Lain
          </button>
        </div>
      </main>
    );
  }

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
            <p>Sehat • Bersih • Nikmat</p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {/* General Fields */}
          <div className="form-group">
            <label htmlFor="fullName">Nama Lengkap</label>
            <input
              type="text"
              id="fullName"
              name="fullName"
              placeholder="Masukkan nama lengkap"
              required
              value={formData.fullName}
              onChange={handleInputChange}
            />
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label htmlFor="gender">Jenis Kelamin</label>
              <select
                id="gender"
                name="gender"
                required
                value={formData.gender}
                onChange={handleInputChange}
              >
                <option value="">Pilih Jenis Kelamin</option>
                <option value="Laki-Laki">Laki-Laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="dateOfBirth">Tanggal Lahir</label>
              <input
                type="text"
                id="dateOfBirth"
                name="dateOfBirth"
                placeholder="dd-mm-yyyy"
                inputMode="numeric"
                maxLength={10}
                required
                value={formData.dateOfBirth}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Alamat Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="contoh@email.com"
              required
              value={formData.email}
              onChange={handleInputChange}
            />
          </div>

          <div className="form-group">
            <label htmlFor="category">Kategori</label>
            <select
              id="category"
              name="category"
              required
              value={formData.category}
              onChange={handleInputChange}
            >
              <option value="">Pilih Kategori</option>
              <option value="Santri">Santri</option>
              <option value="Mahasiswa">Mahasiswa</option>
              <option value="Guru/Dosen">Guru/Dosen</option>
            </select>
          </div>

          {/* Conditional Logic Fields */}
          {formData.category === "Santri" && (
            <div className="conditional-section animate-fade-in">
              <div className="form-group">
                <label htmlFor="unitEducation">Unit Pendidikan</label>
                <select
                  id="unitEducation"
                  name="unitEducation"
                  required
                  value={formData.unitEducation}
                  onChange={handleInputChange}
                >
                  <option value="">Pilih Sekolah</option>
                  {FORMAL_SCHOOLS.map((school) => (
                    <option key={school} value={school}>
                      {school}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="asrama">Asrama</label>
                <select
                  id="asrama"
                  name="asrama"
                  required
                  value={formData.asrama}
                  onChange={handleInputChange}
                >
                  <option value="">Pilih Asrama</option>
                  {ASRAMA_LIST.map((asrama) => (
                    <option key={asrama} value={asrama}>
                      {asrama}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {formData.category === "Mahasiswa" && (
            <div className="conditional-section animate-fade-in">
              <div className="form-group">
                <label htmlFor="phoneNumber">Nomor Telepon</label>
                <input
                  type="text"
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="+628..."
                  inputMode="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="faculty">Fakultas</label>
                <select
                  id="faculty"
                  name="faculty"
                  required
                  value={formData.faculty}
                  onChange={handleInputChange}
                >
                  <option value="">Pilih Fakultas</option>
                  {Object.keys(FACULTY_MAJOR_MAP).map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="major">Program Studi</label>
                <select
                  id="major"
                  name="major"
                  required
                  disabled={!formData.faculty}
                  value={formData.major}
                  onChange={handleInputChange}
                >
                  <option value="">Pilih Program Studi</option>
                  {formData.faculty &&
                    FACULTY_MAJOR_MAP[formData.faculty]?.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="residence">Tempat Tinggal</label>
                <select
                  id="residence"
                  name="residence"
                  required
                  value={formData.residence}
                  onChange={handleInputChange}
                >
                  <option value="">Pilih Tempat Tinggal</option>
                  <option value="Apartemen Mahasiswa">Apartemen Mahasiswa</option>
                  <option value="Asrama Pondok Pesantren">Asrama Pondok Pesantren</option>
                  <option value="Rumah/Kos">Rumah/Kos</option>
                </select>
              </div>
            </div>
          )}

          {formData.category === "Guru/Dosen" && (
            <div className="conditional-section animate-fade-in">
              <div className="form-group">
                <label htmlFor="phoneNumber">Nomor Telepon</label>
                <input
                  type="text"
                  id="phoneNumber"
                  name="phoneNumber"
                  placeholder="+628..."
                  inputMode="tel"
                  required
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="institution">Instansi</label>
                <select
                  id="institution"
                  name="institution"
                  required
                  value={formData.institution}
                  onChange={handleInputChange}
                >
                  <option value="">Pilih Instansi</option>
                  <option value="Unipdu">Unipdu</option>
                  <option value="Kantor Pusat">Kantor Pusat</option>
                  <option value="Unit Kesehatan Pondok (UKP)">Unit Kesehatan Pondok (UKP)</option>
                  <option value="Unit Sekolah Formal">Unit Sekolah Formal</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="workLocation">Lokasi Kerja</label>
                <select
                  id="workLocation"
                  name="workLocation"
                  required
                  value={formData.workLocation}
                  onChange={handleInputChange}
                >
                  <option value="">Pilih Lokasi Kerja</option>
                  {formData.institution === "Unit Sekolah Formal" ? (
                    FORMAL_SCHOOLS.map((school) => (
                      <option key={school} value={school}>
                        {school}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Gedung Rektorat">Gedung Rektorat</option>
                      <option value="Gedung Kampus">Gedung Kampus</option>
                      <option value="Laboratorium">Laboratorium</option>
                      <option value="Islamic Center">Islamic Center</option>
                      <option value="Rumah Sakit Unipdu Medika">Rumah Sakit Unipdu Medika</option>
                      <option value="Kantor Unit">Kantor Unit</option>
                      <option value="Gedung Keterampilan">Gedung Keterampilan</option>
                    </>
                  )}
                </select>
              </div>
            </div>
          )}

          {error && <p style={{ color: "var(--error)", marginBottom: "1rem" }}>{error}</p>}

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? "Mendaftarkan..." : "Daftar Sekarang"}
          </button>
          <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.9rem", color: "var(--primary)" }}>
            Sudah punya akun?{" "}
            <a href="/login" style={{ fontWeight: "700", textDecoration: "underline", cursor: "pointer" }}>
              Login Member
            </a>
          </p>
        </form>
      </div>
    </main>
  );
}
