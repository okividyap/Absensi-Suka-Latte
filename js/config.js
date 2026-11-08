/**
 * ============================================================================
 * SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — FINAL PRODUCTION)
 * File: js/config.js
 *
 * CATATAN OPERASIONAL TANPA VS CODE:
 * 1. Anda TIDAK WAJIB mengedit file ini menggunakan VS Code.
 * 2. Saat pertama kali membuka aplikasi di browser, tersedia formulir Setup
 *    untuk memasukkan SUPABASE_URL dan SUPABASE_ANON_KEY secara langsung,
 *    serta tombol 1-klik "Unduh config.js Siap Upload Vercel" di Control Panel.
 * 3. JANGAN PERNAH memasukkan `service_role` secret key atau `Google Client Secret`
 *    ke dalam file frontend ini. Simpan Google Client Secret hanya di dalam
 *    Dashboard Supabase -> Authentication -> Providers -> Google.
 * ============================================================================
 */

window.SUKA_LATTE_CONFIG = {
  SUPABASE_URL: "https://mnwcjjazzogklrvovxbv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_AgNKiVJWu-ZKAY9gbabx3A_56WlM045",
  PRIVATE_STORAGE_BUCKET: "attendance-photos-private",
  DEFAULT_OPERATIONAL_TIMEZONE: "Asia/Makassar"
};
