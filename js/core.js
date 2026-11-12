/**
 * ============================================================================
 * SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — FINAL PRODUCTION)
 * File: js/core.js
 * Deskripsi: Inti koneksi Supabase, Google OAuth, Penguncian Role/Deep-Access,
 *            Sinkronisasi Waktu Resmi Server WITA, & Signed URL Private Bucket.
 *            TANPA MODE DEMO / TANPA AKUN DUMMY.
 * ============================================================================
 */

(function () {
  "use strict";

  const CONN_STORAGE_KEY = "suka_latte_cloud_conn_prod_v1";
  const MONTH_NAMES_EN = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const DEFAULT_SETTINGS = {
    operational_timezone: "Asia/Makassar",
    require_selfie_photo: true,
    require_gps_validation: true,
    strict_geofence_enforcement: true,
    clock_skew_warning_threshold_seconds: 120,
    allow_member_request_corrections: false,
    allow_member_request_leaves: false,
    brand_display_name: "SUKA LATTE ATTENDANCE SYSTEM",
    brand_subtitle: "Café & Catering",
    brand_tagline: "Your home cooking taste",
    welcome_message:
      "Selamat bertugas di Suka Latte. Pastikan foto selfie diambil langsung menggunakan kamera perangkat di area outlet.",
    theme_preset: "classic_latte",
    photo_retention_policy_months: 0,
    session_timeout_minutes: 120,
  };

  // ==========================================================================
  // 1. UTILITAS KEAMANAN (ANTI-XSS), JARAK GPS, & WAKTU SERVER WITA
  // ==========================================================================
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    if (
      typeof lat1 !== "number" ||
      typeof lon1 !== "number" ||
      typeof lat2 !== "number" ||
      typeof lon2 !== "number"
    ) {
      return null;
    }
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  function getTimePartsInTimezone(isoOrDate, timezone) {
    const tz = timezone || "Asia/Makassar";
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const map = {};
    parts.forEach((p) => (map[p.type] = p.value));

    const year = parseInt(map.year || "2026", 10);
    const month = parseInt(map.month || "1", 10);
    const day = parseInt(map.day || "1", 10);
    const hour = parseInt(map.hour === "24" ? "00" : map.hour || "0", 10);
    const minute = parseInt(map.minute || "0", 10);
    const second = parseInt(map.second || "0", 10);

    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const hh = String(hour).padStart(2, "0");
    const min = String(minute).padStart(2, "0");
    const ss = String(second).padStart(2, "0");

    const monthEn = MONTH_NAMES_EN[month - 1] || "January";
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      dateString: `${year}-${mm}-${dd}`,
      timeString: `${hh}:${min}:${ss}`,
      hmString: `${hh}:${min}`,
      archivePeriodKey: `${year}-${mm}`,
      archiveFolderLabel: `${year}/${mm}-${monthEn}`,
    };
  }

  function formatOperationalDateTime(isoString, timezone, includeDate = true) {
    if (!isoString) return "-";
    try {
      const tz = timezone || "Asia/Makassar";
      const tzShort =
        tz === "Asia/Makassar"
          ? "WITA"
          : tz === "Asia/Jakarta"
          ? "WIB"
          : tz === "Asia/Jayapura"
          ? "WIT"
          : tz;
      const parts = getTimePartsInTimezone(isoString, tz);
      if (!includeDate) return `${parts.timeString} ${tzShort}`;
      return `${parts.dateString} ${parts.timeString} ${tzShort}`;
    } catch {
      return String(isoString);
    }
  }

  function formatDurationMinutes(mins) {
    if (!mins || mins <= 0) return "0 menit";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} menit`;
    if (m === 0) return `${h} jam`;
    return `${h} jam ${m} mnt`;
  }

  function getStatusBadgeHtml(status, lateMinutes) {
    const mins = Number(lateMinutes || 0);
    const map = {
      hadir: { label: "Hadir Tepat Waktu", cls: "badge-success" },
      selesai: { label: "Selesai (Lengkap)", cls: "badge-success" },
      sudah_check_in_belum_check_out: {
        label: "Sedang Bertugas (Belum Check Out)",
        cls: "badge-warning",
      },
      terlambat: {
        label: mins > 0 ? `Terlambat ${Math.round(mins)} menit` : "Terlambat",
        cls: "badge-late",
      },
      pulang_cepat: { label: "Pulang Cepat", cls: "badge-warning" },
      tidak_hadir: { label: "Tidak Hadir", cls: "badge-danger" },
      izin: { label: "Izin", cls: "badge-warning" },
      sakit: { label: "Sakit", cls: "badge-warning" },
      cuti: { label: "Cuti", cls: "badge-success" },
      belum_check_in: { label: "Belum Check In", cls: "badge-member" },
    };
    const item = map[status] || map.belum_check_in;
    return `<span class="badge ${item.cls}">${escapeHtml(item.label)}</span>`;
  }

  function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(",");
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  // ==========================================================================
  // 2. KONEKSI CLOUD SUPABASE & STATE PRODUKSI
  // ==========================================================================
  const state = {
    supabase: null,
    supabaseUrl: "",
    supabaseAnonKey: "",
    storageBucket: "attendance-photos-private",
    isConfigured: false,
    schemaMissing: false,
    loading: true,
    initError: null,

    bootstrapCompleted: false,
    session: null,
    currentUser: null,
    googleIdentity: null,

    settings: { ...DEFAULT_SETTINGS },
    outlets: [],
    shifts: [],
    profiles: [],
    preapprovedEmails: [],
    attendance: [],
    corrections: [],
    holidaysAndLeaves: [],
    auditLogs: [],

    signedUrls: {}, // path -> { url, exp }
    serverClockOffsetMs: 0,
  };

  let uiNotifyCallback = null;

  function loadStoredCredentials() {
    const fileCfg = window.SUKA_LATTE_CONFIG || {};
    let saved = {};
    try {
      const raw = localStorage.getItem(CONN_STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) || {};
    } catch {
      saved = {};
    }

    const url = (fileCfg.SUPABASE_URL || saved.supabaseUrl || "").trim();
    const key = (fileCfg.SUPABASE_ANON_KEY || saved.supabaseAnonKey || "").trim();
    const bucket = (
      fileCfg.PRIVATE_STORAGE_BUCKET ||
      saved.storageBucket ||
      "attendance-photos-private"
    ).trim();

    state.supabaseUrl = url;
    state.supabaseAnonKey = key;
    state.storageBucket = bucket;
    state.isConfigured = Boolean(
      url && key && url.startsWith("https://") && !url.includes("your-project")
    );

    if (state.isConfigured && window.supabase && window.supabase.createClient) {
      state.supabase = window.supabase.createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    } else {
      state.supabase = null;
    }
  }

  function saveCloudCredentials(url, anonKey) {
    const cleanUrl = String(url || "").trim().replace(/\/+$/, "");
    const cleanKey = String(anonKey || "").trim();
    if (!cleanUrl.startsWith("https://") || !cleanUrl.includes(".supabase.co")) {
      return {
        ok: false,
        message:
          "Format Supabase Project URL tidak valid. Gunakan format https://<project-id>.supabase.co",
      };
    }
    if (cleanKey.length < 30) {
      return {
        ok: false,
        message: "Supabase Anon Public Key tidak valid.",
      };
    }
    localStorage.setItem(
      CONN_STORAGE_KEY,
      JSON.stringify({
        supabaseUrl: cleanUrl,
        supabaseAnonKey: cleanKey,
        storageBucket: state.storageBucket,
      })
    );
    loadStoredCredentials();
    return {
      ok: true,
      message: "Kredensial server Supabase berhasil disimpan.",
    };
  }

  function clearCloudCredentials() {
    localStorage.removeItem(CONN_STORAGE_KEY);
    state.supabase = null;
    state.isConfigured = false;
    state.supabaseUrl = "";
    state.supabaseAnonKey = "";
  }

  function downloadConfigJsFile() {
    const content = `/**
 * SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — FINAL PRODUCTION)
 * File konfigurasi otomatis untuk deployment Vercel / Hosting Publik.
 */
window.SUKA_LATTE_CONFIG = {
  SUPABASE_URL: "${state.supabaseUrl}",
  SUPABASE_ANON_KEY: "${state.supabaseAnonKey}",
  PRIVATE_STORAGE_BUCKET: "${state.storageBucket}",
  DEFAULT_OPERATIONAL_TIMEZONE: "${state.settings.operational_timezone || "Asia/Makassar"}"
};
`;
    const blob = new Blob([content], { type: "application/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "config.js";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function getServerNow() {
    return new Date(Date.now() + (state.serverClockOffsetMs || 0));
  }

  // ==========================================================================
  // 3. PENJAGA HAK AKSES & DEEP-ACCESS PROTECTION (ANGGOTA DILARANG AKSES DALAM)
  // ==========================================================================
  function isApprovedUser() {
    const u = state.currentUser;
    return Boolean(u && u.status === "active" && u.first_login_approved === true);
  }

  function isSuperAdmin() {
    return Boolean(isApprovedUser() && state.currentUser.role === "super_admin");
  }

  function isManager() {
    return Boolean(
      isApprovedUser() &&
        (state.currentUser.role === "super_admin" ||
          state.currentUser.role === "admin")
    );
  }

  function isMemberOnly() {
    return Boolean(isApprovedUser() && state.currentUser.role === "member");
  }

  async function logSecurityEvent(action, targetType, targetId, detail) {
    if (!state.supabase || !state.session) return;
    try {
      await state.supabase.from("audit_logs").insert({
        actor_user_id: state.session.user.id,
        actor_name: state.currentUser
          ? state.currentUser.full_name
          : state.googleIdentity?.full_name || state.session.user.email,
        actor_role: state.currentUser ? state.currentUser.role : "unverified",
        action,
        target_type: targetType,
        target_id: String(targetId || "-"),
        detail,
      });
    } catch {
      // Abaikan error tulis log sekunder
    }
  }

  function assertManagerAccess(featureName) {
    if (!isManager()) {
      logSecurityEvent(
        "DEEP_ACCESS_BLOCKED_MEMBER",
        "ui_guard",
        featureName,
        `Anggota dilarang mengakses modul dalam / pengeditan: ${featureName}`
      );
      throw new Error(
        "AKSES DIBATASI: Hanya Super Admin dan Admin yang diizinkan mengakses menu pengelolaan atau melakukan pengeditan sistem."
      );
    }
  }

  function assertSuperAdminAccess(featureName) {
    if (!isSuperAdmin()) {
      logSecurityEvent(
        "SUPER_ADMIN_ONLY_BLOCKED",
        "ui_guard",
        featureName,
        `Percobaan akses fitur khusus Super Admin ditolak: ${featureName}`
      );
      throw new Error(
        "AKSES DITOLAK: Tindakan ini hanya berwenang dilakukan oleh Super Admin tunggal."
      );
    }
  }

  // ==========================================================================
  // 4. SINKRONISASI SESI GOOGLE OAUTH & PEMUATAN DATA SESUAI HAK AKSES (RLS)
  // ==========================================================================
  async function initializeApp(onUpdate) {
    uiNotifyCallback = onUpdate;
    loadStoredCredentials();

    if (!state.isConfigured || !state.supabase) {
      state.loading = false;
      onUpdate();
      return;
    }

    state.loading = true;
    state.initError = null;
    state.schemaMissing = false;
    onUpdate();

    try {
      // 1. Ambil state publik sistem (bootstrap_completed, branding, waktu server resmi)
      const { data: pubData, error: pubErr } = await state.supabase.rpc(
        "get_public_system_state"
      );

      if (pubErr) {
        if (
          pubErr.message &&
          (pubErr.message.includes("get_public_system_state") ||
            pubErr.message.includes("relation") ||
            pubErr.message.includes("does not exist"))
        ) {
          state.schemaMissing = true;
          state.loading = false;
          onUpdate();
          return;
        }
        throw pubErr;
      }

      if (pubData) {
        state.bootstrapCompleted = Boolean(pubData.bootstrap_completed);
        if (pubData.settings && Object.keys(pubData.settings).length > 0) {
          state.settings = { ...DEFAULT_SETTINGS, ...pubData.settings };
        }
        if (pubData.server_now_utc) {
          state.serverClockOffsetMs =
            new Date(pubData.server_now_utc).getTime() - Date.now();
        }
      }

      // 2. Periksa sesi autentikasi Google saat ini
      const {
        data: { session },
      } = await state.supabase.auth.getSession();
      state.session = session;

      if (session && session.user) {
        await syncAuthenticatedGoogleUser();
      } else {
        state.currentUser = null;
        state.googleIdentity = null;
      }

      // 3. Dengarkan perubahan status login OAuth Google
      state.supabase.auth.onAuthStateChange(async (event, newSession) => {
        if (event === "TOKEN_REFRESHED") {
          state.session = newSession;
          return;
        }
        if (event === "SIGNED_IN") {
          const sameUserReady =
            Boolean(state.session?.user?.id) &&
            state.session.user.id === newSession?.user?.id &&
            Boolean(state.currentUser);
          state.session = newSession;
          if (sameUserReady) return;
          await refreshAllData();
        } else if (event === "SIGNED_OUT") {
          state.session = null;
          state.currentUser = null;
          state.googleIdentity = null;
          state.profiles = [];
          state.attendance = [];
          state.auditLogs = [];
          onUpdate();
        }
      });
    } catch (err) {
      state.initError = err.message || "Gagal menghubungi server Supabase.";
    } finally {
      state.loading = false;
      onUpdate();
    }
  }

  async function syncAuthenticatedGoogleUser() {
    if (!state.supabase || !state.session) return;
    const u = state.session.user;
    state.googleIdentity = {
      email: u.email || "",
      full_name:
        u.user_metadata?.full_name ||
        u.user_metadata?.name ||
        (u.email ? u.email.split("@")[0] : "Pengguna Google"),
      avatar_url: u.user_metadata?.avatar_url || u.user_metadata?.picture || "",
    };

    const { data: syncRes, error: syncErr } = await state.supabase.rpc(
      "sync_my_google_profile"
    );
    if (syncErr) throw syncErr;

    state.bootstrapCompleted = Boolean(syncRes.bootstrap_completed);
    state.currentUser = syncRes.profile || null;

    // Hanya muat data operasional apabila akun SUDAH DISETUJUI login pertamanya & berstatus AKTIF!
    if (isApprovedUser()) {
      await loadRoleScopedOperationalData();
    }
  }

  async function loadRoleScopedOperationalData() {
    if (!state.supabase || !isApprovedUser()) return;

    // Data dasar yang diizinkan dibaca oleh pengguna aktif (Outlets, Shifts, Settings)
    const [outRes, shRes, setRes, attRes, corrRes, hlRes] = await Promise.all([
      state.supabase.from("outlets").select("*").order("created_at", { ascending: true }),
      state.supabase.from("work_shifts").select("*").order("start_time", { ascending: true }),
      state.supabase.from("system_settings").select("*").eq("key", "operational_config").maybeSingle(),
      // Untuk Anggota, RLS PostgreSQL otomatis memfilter HANYA miliknya sendiri!
      // Ditambah filter eksplisit employee_id di sisi query jika role === 'member' untuk isolasi berlapis.
      isMemberOnly()
        ? state.supabase
            .from("attendance")
            .select("*")
            .eq("employee_id", state.currentUser.id)
            .order("work_date", { ascending: false })
            .order("created_at", { ascending: false })
        : state.supabase
            .from("attendance")
            .select("*")
            .order("work_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(300),
      isMemberOnly()
        ? state.supabase
            .from("attendance_corrections")
            .select("*")
            .eq("employee_id", state.currentUser.id)
            .order("created_at", { ascending: false })
        : state.supabase
            .from("attendance_corrections")
            .select("*")
            .order("created_at", { ascending: false }),
      state.supabase
        .from("holidays_and_leaves")
        .select("*")
        .order("date_start", { ascending: false }),
    ]);

    state.outlets = outRes.data || [];
    state.shifts = shRes.data || [];
    if (setRes.data && setRes.data.value) {
      state.settings = { ...DEFAULT_SETTINGS, ...setRes.data.value };
    }
    state.attendance = attRes.data || [];
    state.corrections = corrRes.data || [];
    state.holidaysAndLeaves = hlRes.data || [];

    // DATA MENDALAM: Hanya dimuat jika pengguna adalah SUPER ADMIN atau ADMIN!
    // Anggota TIDAK BOLEH dan TIDAK BISA memuat daftar karyawan lain, daftar pra-setuju, atau Audit Log!
    if (isManager()) {
      const [profRes, preRes, audRes] = await Promise.all([
        state.supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        state.supabase
          .from("preapproved_emails")
          .select("*")
          .is("claimed_by", null)
          .order("created_at", { ascending: false }),
        state.supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
      state.profiles = profRes.data || [];
      state.preapprovedEmails = preRes.data || [];
      state.auditLogs = audRes.data || [];
    } else {
      state.profiles = [state.currentUser];
      state.preapprovedEmails = [];
      state.auditLogs = [];
    }

    // Buat Signed URL berumur pendek (5 menit) untuk foto bukti yang tampil
    ensureSignedUrlsForAttendance(state.attendance.slice(0, 30));
  }

  async function refreshAllData() {
    if (!state.supabase) return;
    try {
      const { data: pubData } = await state.supabase.rpc("get_public_system_state");
      if (pubData) {
        state.bootstrapCompleted = Boolean(pubData.bootstrap_completed);
        if (pubData.settings) {
          state.settings = { ...DEFAULT_SETTINGS, ...pubData.settings };
        }
        if (pubData.server_now_utc) {
          state.serverClockOffsetMs =
            new Date(pubData.server_now_utc).getTime() - Date.now();
        }
      }
      if (state.session && state.session.user) {
        await syncAuthenticatedGoogleUser();
      }
    } catch (err) {
      state.initError = err.message;
    }
    if (uiNotifyCallback) uiNotifyCallback();
  }

  async function ensureSignedUrlsForAttendance(records) {
    if (!state.supabase || !records || records.length === 0) return;
    const nowMs = Date.now();
    const pathsToSign = [];

    records.forEach((r) => {
      if (r.check_in_photo_path) {
        const cached = state.signedUrls[r.check_in_photo_path];
        if (!cached || cached.exp < nowMs) pathsToSign.push(r.check_in_photo_path);
      }
      if (r.check_out_photo_path) {
        const cached = state.signedUrls[r.check_out_photo_path];
        if (!cached || cached.exp < nowMs) pathsToSign.push(r.check_out_photo_path);
      }
    });

    if (pathsToSign.length === 0) return;

    const uniquePaths = Array.from(new Set(pathsToSign));
    const { data, error } = await state.supabase.storage
      .from(state.storageBucket)
      .createSignedUrls(uniquePaths, 300); // Berlaku 300 detik (5 menit) sesuai PRD Bab 8 & 27.5

    if (!error && Array.isArray(data)) {
      let updated = false;
      data.forEach((item) => {
        if (item.path && item.signedUrl) {
          state.signedUrls[item.path] = {
            url: item.signedUrl,
            exp: nowMs + 260 * 1000,
          };
          updated = true;
        }
      });
      if (updated && uiNotifyCallback) uiNotifyCallback();
    }
  }

  function getSignedPhotoUrl(path) {
    if (!path) return null;
    const item = state.signedUrls[path];
    return item ? item.url : null;
  }

  // ==========================================================================
  // 5. AKSI AUTENTIKASI GOOGLE & UPLOAD BUKTI KE PRIVATE STORAGE
  // ==========================================================================
  async function signInWithGoogle() {
    if (!state.supabase) {
      throw new Error("Hubungkan konfigurasi Supabase terlebih dahulu.");
    }
    if (window.location.protocol === "file:") {
      throw new Error(
        "Autentikasi Google OAuth memerlukan alamat http://localhost atau https:// (bukan file://). Klik 2x file 'Jalankan-Server-Lokal.command' di folder ini atau deploy ke Vercel."
      );
    }
    const normalizedPath = window.location.pathname.replace(/\/index\.html$/i, "/") || "/";
    const redirectUrl = window.location.origin + normalizedPath;
    const { error } = await state.supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        queryParams: {
          prompt: "select_account",
        },
      },
    });
    if (error) throw error;
  }

  async function signOut() {
    if (state.supabase) {
      await logSecurityEvent("AUTH_LOGOUT", "profiles", state.currentUser?.id, "Pengguna logout dari sesi aktif.");
      await state.supabase.auth.signOut();
    }
    state.session = null;
    state.currentUser = null;
    state.googleIdentity = null;
    if (uiNotifyCallback) uiNotifyCallback();
  }

  function withTimeout(promise, ms, timeoutMessage) {
    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error(timeoutMessage || "Koneksi server timeout. Periksa jaringan internet Anda dan coba lagi."));
      }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      if (timerId) clearTimeout(timerId);
    });
  }

  async function selectMyActiveShift(shiftId) {
    if (!state.supabase || !isApprovedUser()) {
      throw new Error("Sesi Anda tidak aktif atau belum disetujui Admin.");
    }
    const { data, error } = await withTimeout(
      state.supabase.rpc("set_my_active_shift", { p_shift_id: shiftId }),
      15000,
      "Pembaruan shift timeout setelah 15 detik."
    );
    if (error) throw new Error(error.message);
    if (state.currentUser) {
      state.currentUser.shift_id = shiftId;
    }
    await refreshAllData();
    return data;
  }

  async function safeRemoveOrphanPhoto(storagePath) {
    if (!storagePath || !state.supabase) return;
    try {
      await withTimeout(
        state.supabase.storage.from(state.storageBucket).remove([storagePath]),
        5000,
        "Cleanup storage timeout"
      );
    } catch {
      // Abaikan error pembersihan objek yatim agar pesan validasi utama server tetap tampil utuh
    }
  }

  async function uploadPrivateSelfieAndSubmit(mode, dataUrl, lat, lng, accuracy, shiftId) {
    if (!state.supabase || !isApprovedUser()) {
      throw new Error("Sesi Anda tidak aktif atau belum disetujui Admin.");
    }

    const tz = state.settings.operational_timezone || "Asia/Makassar";
    const parts = getTimePartsInTimezone(getServerNow(), tz);
    const uid = state.currentUser.id;
    const rand = Math.random().toString(36).substring(2, 10);
    const eventSlug = mode === "check_in" ? "check-in" : "check-out";

    let storagePath = "";
    if (dataUrl) {
      // Path sesuai struktur arsip bulanan & RLS Storage Policy index [5] = uid
      storagePath = `SUKA-LATTE-ATTENDANCE/attendance-photos/${parts.archiveFolderLabel}/${uid}/${Date.now()}-${eventSlug}-${rand}.jpg`;
      const blob = dataUrlToBlob(dataUrl);

      const { error: upErr } = await withTimeout(
        state.supabase.storage.from(state.storageBucket).upload(storagePath, blob, {
          contentType: "image/jpeg",
          upsert: false,
        }),
        25000,
        "Unggah foto selfie ke server timeout setelah 25 detik. Periksa sinyal internet Anda lalu coba lagi."
      );

      if (upErr) {
        throw new Error(
          "Gagal mengunggah foto bukti ke Private Storage: " + upErr.message
        );
      }
    }

    const deviceIso = new Date().toISOString();

    if (mode === "check_in") {
      const idemKey = `idem-in-${uid}-${Date.now()}`;
      const chosenShiftId = shiftId || state.currentUser?.shift_id || null;
      const rpcRes = await withTimeout(
        state.supabase.rpc("submit_server_check_in_with_shift", {
          p_idempotency_key: idemKey,
          p_photo_path: storagePath,
          p_latitude: lat,
          p_longitude: lng,
          p_accuracy: accuracy,
          p_device_timestamp: deviceIso,
          p_shift_id: chosenShiftId,
        }),
        25000,
        "Validasi Check In ke server timeout setelah 25 detik. Silakan coba tekan Konfirmasi lagi."
      );
      if (rpcRes.error) {
        await safeRemoveOrphanPhoto(storagePath);
        throw new Error(rpcRes.error.message);
      }
      await refreshAllData();
      return rpcRes.data;
    } else {
      const rpcRes = await withTimeout(
        state.supabase.rpc("submit_server_check_out", {
          p_photo_path: storagePath,
          p_latitude: lat,
          p_longitude: lng,
          p_accuracy: accuracy,
          p_device_timestamp: deviceIso,
        }),
        25000,
        "Validasi Check Out ke server timeout setelah 25 detik. Silakan coba tekan Konfirmasi lagi."
      );
      if (rpcRes.error) {
        await safeRemoveOrphanPhoto(storagePath);
        throw new Error(rpcRes.error.message);
      }
      await refreshAllData();
      return rpcRes.data;
    }
  }

  window.SukaCore = {
    state,
    DEFAULT_SETTINGS,
    escapeHtml,
    calculateDistanceMeters,
    getTimePartsInTimezone,
    formatOperationalDateTime,
    formatDurationMinutes,
    getStatusBadgeHtml,
    saveCloudCredentials,
    clearCloudCredentials,
    downloadConfigJsFile,
    getServerNow,
    isApprovedUser,
    isSuperAdmin,
    isManager,
    isMemberOnly,
    assertManagerAccess,
    assertSuperAdminAccess,
    logSecurityEvent,
    initializeApp,
    refreshAllData,
    ensureSignedUrlsForAttendance,
    getSignedPhotoUrl,
    signInWithGoogle,
    signOut,
    selectMyActiveShift,
    uploadPrivateSelfieAndSubmit,
  };
})();
