# PANDUAN LENGKAP PRODUKSI FINAL (TANPA VS CODE & TANPA AKUN DEMO)
## SUKA LATTE ATTENDANCE SYSTEM — Versi 1.1 (HTML, CSS, & Vanilla JS)

Seluruh file produksi final Anda berada di folder **Unduhan (`Downloads`)**:
`/Users/oki.vidyapgmail.com/Downloads/SUKA-LATTE-ATTENDANCE`

Versi ini adalah **Versi Produksi Final** sesuai spesifikasi Anda:
- **0% Mode Demo / 0% Akun Dummy**: Seluruh akun contoh, tombol simulasi GPS, dan tombol reset demo telah dihapus permanen.
- **Wajib Login Akun Google**: Menjaga privasi identitas setiap karyawan menggunakan Google OAuth resmi.
- **Persetujuan Login Pertama oleh Admin**:
  - Akun Google pertama milik pemilik otomatis dikunci menjadi **satu-satunya Super Admin**.
  - Akun Google karyawan baru yang login pertama kali akan masuk ke **Antrean Persetujuan Admin/Super Admin**.
  - Setelah disetujui satu kali, saat akun Google yang sama (maupun akun lain yang sudah disetujui) login kembali, sistem akan **langsung mempersilakan masuk otomatis**.
- **Semua Pengaturan Diedit Langsung di Aplikasi (Tanpa VS Code)**: Super Admin dan Admin dapat mengedit profil karyawan, jadwal shift, koordinat & radius GPS outlet, aturan absensi, koreksi kehadiran, kalender libur/izin, dan branding langsung dari menu **Control Panel**.
- **Isolasi Ketat Anggota (Deep-Access Protection)**: Anggota **hanya** bisa melakukan Check In / Check Out selfie langsung dan mengecek riwayat absensinya sendiri, serta diblokir penuh (di level database PostgreSQL RLS dan aplikasi) dari menu pengelola maupun fitur edit apa pun.

---

## Langkah 1 — Setup Database & Private Storage di Supabase

1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan buat project baru (disarankan region **Southeast Asia / Singapore**).
2. Di sidebar kiri Supabase, klik **SQL Editor → New Query**.
3. Buka file `supabase/migrations/001_suka_latte_schema.sql` dari folder `SUKA-LATTE-ATTENDANCE` (bisa dibuka dengan aplikasi TextEdit bawaan Mac), salin seluruh isinya, tempelkan ke **SQL Editor** Supabase, lalu klik **Run**.
   - Script ini otomatis membuat seluruh tabel produksi, indeks tunggal `idx_single_super_admin`, fungsi validasi server WITA (`Asia/Makassar`), kebijakan isolasi **Row Level Security (RLS)**, serta Private Storage Bucket `attendance-photos-private` (`public = false`).
4. Buka menu **Project Settings → API** di Supabase, lalu siapkan dua nilai berikut:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key** (`eyJhbG...`)
   *(Catatan Keamanan: Jangan pernah menyalin `service_role` secret key ke browser/frontend!)*

---

## Langkah 2 — Aktifkan Login Google OAuth (Wajib)

1. Buka [Google Cloud Console](https://console.cloud.google.com/) dan buat project `Suka Latte Attendance`.
2. Buka **APIs & Services → OAuth consent screen**, pilih **External**, isi nama aplikasi `SUKA LATTE ATTENDANCE SYSTEM`, email kontak Anda, lalu simpan.
3. Buka **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Pilih **Application type**: `Web application`
   - Pada bagian **Authorized redirect URIs**, masukkan **Callback URL** dari Supabase Anda (lihat di **Supabase Dashboard → Authentication → Providers → Google**, bentuknya `https://<id-project-anda>.supabase.co/auth/v1/callback`).
   - Klik **Create**, lalu salin **Client ID** dan **Client Secret**.
4. Kembali ke **Supabase Dashboard → Authentication → Providers → Google**:
   - Aktifkan toggle **Enable Sign in with Google**.
   - Tempelkan **Client ID** dan **Client Secret** tadi, lalu klik **Save**.
5. Di **Supabase Dashboard → Authentication → URL Configuration**:
   - Isi **Site URL** dengan alamat website Anda (misal `http://localhost:8080` saat uji lokal, atau `https://absensi-sukalatte.vercel.app` setelah online di Vercel).
   - Pada **Redirect URLs**, tambahkan keduanya agar lokal maupun Vercel sama-sama diizinkan:
     - `http://localhost:8080`
     - `http://localhost:8080/index.html`
     - `https://<nama-domain-vercel-anda>.vercel.app`

---

## Langkah 3 — Jalankan Aplikasi & Inisialisasi Super Admin Pertama (Tanpa VS Code)

1. **Uji di Mac Lokal:** Klik 2x file **`Jalankan-Server-Lokal.command`** di dalam folder `Downloads/SUKA-LATTE-ATTENDANCE`. Browser akan otomatis terbuka ke `http://localhost:8080`.
2. Pada layar awal aplikasi, tempelkan **Supabase Project URL** dan **Supabase Anon Public Key** Anda, lalu klik **Simpan & Hubungkan ke Sistem Produksi**.
3. Klik tombol **Lanjutkan dengan Akun Google (Super Admin Pertama)** dan login menggunakan akun Google pemilik (Owner).
4. Klik **Tetapkan Sebagai Super Admin & Kunci Sistem**. Sejak detik itu, akun Google Anda menjadi satu-satunya Super Admin dan proses inisialisasi tertutup permanen.
5. Masuk ke menu **Control Panel (Edit)**:
   - Di tab **Outlet & Geofence GPS**, klik tombol **Gunakan Koordinat GPS Lokasi Saya Saat Ini** (saat berada di outlet) atau isi titik koordinat & radius meter outlet Suka Latte, lalu klik **Simpan**.
   - Di tab **Jadwal Shift**, sesuaikan jam masuk/pulang dan toleransi keterlambatan.
   - Di tab **Persetujuan Google & Karyawan**, Anda dapat menyetujui karyawan yang baru pertama kali login Google (atau mendaftarkan email Gmail mereka terlebih dahulu).

---

## Langkah 4 — Online-kan ke Vercel Agar Bisa Diakses HP Seluruh Karyawan

1. Buka menu **Control Panel → Keamanan & Cloud** (khusus Super Admin), lalu klik tombol hijau **Unduh File `config.js` Siap Upload Vercel**.
2. Pindahkan file `config.js` yang baru terunduh tersebut ke dalam subfolder `js/` (menggantikan `js/config.js` yang lama) supaya seluruh HP karyawan otomatis terhubung ke Supabase Anda begitu membuka link website.
3. Unggah folder `SUKA-LATTE-ATTENDANCE` ke repository privat GitHub Anda dan hubungkan ke [Vercel](https://vercel.com) (tidak perlu setting *Build Command* apa pun karena murni HTML, CSS, & JS statis dengan header keamanan otomatis dari `vercel.json`).
