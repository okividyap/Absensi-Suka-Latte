/**
 * ============================================================================
 * SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — FINAL PRODUCTION)
 * File: js/app.js
 * Deskripsi: Pengendali utama aplikasi produksi Suka Latte:
 *   - 0% Mode Demo / 0% Akun Dummy (Semua akun demo telah dihapus permanen)
 *   - Login awal wajib menggunakan Akun Google resmi (Supabase Google OAuth)
 *   - Login pertama wajib disetujui Admin/Super Admin; login berikutnya
 *     pada akun yang sudah disetujui langsung masuk otomatis
 *   - Seluruh fitur Edit diaktifkan langsung di dalam aplikasi (tanpa VS Code)
 *   - Isolasi berlapis bagi Anggota (hanya bisa Absensi & Cek Riwayat sendiri,
 *     tidak bisa mengakses menu pengelolaan maupun melakukan edit apa pun)
 * ============================================================================
 */

(function () {
  "use strict";

  const Core = window.SukaCore;
  const Views = window.SukaViews;
  const esc = Core.escapeHtml;

  const uiState = {
    activeNav: "dashboard", // Manajer: dashboard|archive|reports|control_panel ; Anggota: absensi_saya|riwayat_saya
    activeControlTab: "employees",
    banner: null, // { ok: boolean, message: string }

    // Filter Arsip & Riwayat
    archivePeriodFilter: "all",
    archiveOutletFilter: "all",
    archiveSearch: "",

    // Filter Laporan
    reportDateFrom: "",
    reportDateTo: "",
    reportEmpId: "all",
    reportOutletId: "all",

    // State Form Edit di Control Panel
    editingShiftId: null,
    editingOutletId: null,
    editingCalendarId: null,

    // Modal Aktif
    modal: null,
  };

  // State Kamera Langsung & GPS Asli Perangkat
  const liveCamera = {
    stream: null,
    mode: "check_in",
    shiftId: null,
    capturedDataUrl: null,
    cameraError: null,
    videoReady: false,
    gpsLoading: false,
    gpsError: null,
    gps: null, // { lat, lng, accuracy }
    gpsWatchId: null,
    gpsFallbackTimer: null,
    submitError: null,
    submitting: false,
  };

  let bannerTimer = null;

  function renderBannerInnerHtml() {
    if (!uiState.banner) return "";
    return `
      <div id="global-toast-banner" class="card-subtle global-floating-banner ${uiState.banner.ok ? "is-ok" : "is-err"}">
        <span>${uiState.banner.ok ? "✓ " : "⚠️ "}${esc(uiState.banner.message)}</span>
        <button type="button" style="font-weight:800;font-size:13px;padding:2px 6px;" data-action="dismiss-banner">✕</button>
      </div>
    `;
  }

  function syncBannerDomInPlace() {
    const slot = document.getElementById("global-banner-slot");
    if (slot) {
      slot.innerHTML = renderBannerInnerHtml();
      return true;
    }
    return false;
  }

  function showBanner(ok, message, autoHideMs = 7000) {
    uiState.banner = { ok: Boolean(ok), message: String(message || "") };
    if (bannerTimer) clearTimeout(bannerTimer);
    if (autoHideMs > 0) {
      bannerTimer = setTimeout(() => {
        uiState.banner = null;
        if (!syncBannerDomInPlace()) {
          const el = document.getElementById("global-toast-banner");
          if (el) el.remove();
        }
      }, autoHideMs);
    }
    if (!syncBannerDomInPlace()) {
      render();
    }
  }

  // ==========================================================================
  // 1. HELPER KONVERSI DATETIME-LOCAL SESUAI ZONA WAKTU OPERASIONAL
  // ==========================================================================
  function getTimezoneOffsetSuffix(tz) {
    if (tz === "Asia/Jakarta") return "+07:00";
    if (tz === "Asia/Jayapura") return "+09:00";
    return "+08:00"; // Default WITA (Asia/Makassar)
  }

  function isoToLocalInput(isoStr, tz) {
    if (!isoStr) return "";
    const p = Core.getTimePartsInTimezone(isoStr, tz || "Asia/Makassar");
    return `${p.dateString}T${p.hmString}`;
  }

  function localInputToIso(localVal, tz) {
    if (!localVal || !String(localVal).trim()) return null;
    const clean = String(localVal).trim();
    const withSec = clean.length === 16 ? `${clean}:00` : clean;
    return `${withSec}${getTimezoneOffsetSuffix(tz || "Asia/Makassar")}`;
  }

  function normalizeTimeInput(val, fallback = "07:00") {
    if (!val || !String(val).trim()) return fallback + (fallback.length === 5 ? ":00" : "");
    let s = String(val).trim().replace(/\./g, ":");
    const m = s.match(/^(\d{1,2}):(\d{2})(:(\d{2}))?$/);
    if (m) {
      const hh = m[1].padStart(2, "0");
      const mm = m[2];
      const ss = m[4] || "00";
      return `${hh}:${mm}:${ss}`;
    }
    return s;
  }

  function normalizeDateInput(val, fallback) {
    if (!val || !String(val).trim()) return fallback || new Date().toISOString().slice(0, 10);
    let s = String(val).trim();
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      const dd = dmy[1].padStart(2, "0");
      const mm = dmy[2].padStart(2, "0");
      const yyyy = dmy[3];
      return `${yyyy}-${mm}-${dd}`;
    }
    return s;
  }

  // ==========================================================================
  // 2. KAMERA SELFIE LANGSUNG & GEOLOCATION GPS ASLI PERANGKAT
  // ==========================================================================
  function stopCameraStream() {
    if (liveCamera.stream) {
      liveCamera.stream.getTracks().forEach((track) => track.stop());
      liveCamera.stream = null;
    }
    liveCamera.videoReady = false;
  }

  function stopGpsWatcher() {
    if (liveCamera.gpsFallbackTimer) {
      clearTimeout(liveCamera.gpsFallbackTimer);
      liveCamera.gpsFallbackTimer = null;
    }
    if (liveCamera.gpsWatchId !== null && navigator.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(liveCamera.gpsWatchId);
      liveCamera.gpsWatchId = null;
    }
  }

  function getActiveShiftsList() {
    return (Core.state.shifts || []).filter((sh) => sh.status === "active");
  }

  function getSelectedAttendanceShift() {
    const s = Core.state;
    const active = getActiveShiftsList();
    return (
      s.shifts.find((sh) => sh.id === liveCamera.shiftId) ||
      s.shifts.find((sh) => sh.id === s.currentUser?.shift_id) ||
      active[0] ||
      s.shifts[0] ||
      null
    );
  }

  function renderCameraGpsInnerHtml() {
    const s = Core.state;
    const u = s.currentUser;
    const outlet = s.outlets.find((o) => o.id === u?.outlet_id) || s.outlets[0];
    const dist =
      outlet && liveCamera.gps
        ? Core.calculateDistanceMeters(
            liveCamera.gps.lat,
            liveCamera.gps.lng,
            outlet.latitude,
            outlet.longitude
          )
        : null;
    const inRadius =
      outlet && dist !== null ? dist <= outlet.geofence_radius_meters : false;
    const accuracyOk =
      outlet && liveCamera.gps
        ? liveCamera.gps.accuracy <= outlet.minimum_gps_accuracy_meters
        : false;

    return `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;">
        <span style="font-size:11px;font-weight:800;color:var(--coffee-700);text-transform:uppercase;">Status GPS Perangkat</span>
        <button type="button" class="btn btn-outline btn-sm" data-action="refresh-gps" ${liveCamera.gpsLoading || liveCamera.submitting ? "disabled" : ""}>
          🔄 Ambil Ulang GPS
        </button>
      </div>
      ${
        liveCamera.gpsLoading
          ? `<div style="font-size:12px;color:var(--amber-800);font-weight:700;">⏳ Mengambil titik koordinat satelit GPS perangkat...</div>`
          : liveCamera.gpsError
          ? `<div style="font-size:12px;color:var(--rose-800);font-weight:700;">⚠️ ${esc(liveCamera.gpsError)}</div>`
          : liveCamera.gps
          ? `<div class="mono" style="font-size:11.5px;margin-bottom:6px;">
               Lat: ${liveCamera.gps.lat.toFixed(6)}<br/>
               Lng: ${liveCamera.gps.lng.toFixed(6)}<br/>
               Akurasi: ±${Math.round(liveCamera.gps.accuracy)} meter
             </div>
             <div style="display:flex;flex-wrap:wrap;gap:6px;">
               <span class="badge ${inRadius ? "badge-success" : "badge-danger"}">
                 Jarak: ${dist !== null ? dist + "m" : "-"} (${inRadius ? "Di Dalam Radius" : "Di Luar Radius"})
               </span>
               <span class="badge ${accuracyOk ? "badge-success" : "badge-warning"}">
                 ${accuracyOk ? "Akurasi Memenuhi Syarat" : "Akurasi Kurang Tajam"}
               </span>
             </div>`
          : `<div style="font-size:12px;color:var(--stone-500);">Menunggu koordinat GPS...</div>`
      }
    `;
  }

  function renderCameraErrorBoxInnerHtml() {
    if (!liveCamera.submitError) return "";
    return `
      <div class="modal-inline-alert" role="alert">
        <strong>⚠️ Pengiriman Absensi Tertahan:</strong>
        <span>${esc(liveCamera.submitError)}</span>
      </div>
    `;
  }

  function renderCameraSubmitBtnInnerHtml() {
    const s = Core.state;
    const isCheckIn = liveCamera.mode === "check_in";
    const needSelfie = Boolean(s.settings.require_selfie_photo);
    const needGps = Boolean(s.settings.require_gps_validation);
    const hasSelfie = !needSelfie || Boolean(liveCamera.capturedDataUrl);
    const hasGps = !needGps || Boolean(liveCamera.gps);
    const allReady = hasSelfie && hasGps;

    const u = s.currentUser;
    const outlet = s.outlets.find((o) => o.id === u?.outlet_id) || s.outlets[0];
    const dist =
      outlet && liveCamera.gps
        ? Core.calculateDistanceMeters(
            liveCamera.gps.lat,
            liveCamera.gps.lng,
            outlet.latitude,
            outlet.longitude
          )
        : null;
    const accuracy = liveCamera.gps ? Math.round(liveCamera.gps.accuracy) : null;
    const geoWarning =
      s.settings.strict_geofence_enforcement && outlet && liveCamera.gps
        ? accuracy > outlet.minimum_gps_accuracy_meters
          ? `Akurasi GPS (±${accuracy}m) melebihi batas outlet (±${outlet.minimum_gps_accuracy_meters}m). Dekatkan perangkat ke area terbuka / jendela.`
          : dist !== null && dist > outlet.geofence_radius_meters
          ? `Lokasi Anda saat ini berjarak ${dist}m dari ${outlet.name} (batas ${outlet.geofence_radius_meters}m).${
              Core.isManager()
                ? " Jika Anda sedang berada di café, kalibrasikan titik lewat Control Panel → Outlet & GPS → Gunakan GPS Saat Ini."
                : ""
            }`
          : ""
        : "";

    return `
      <div id="camera-readiness-checklist" class="camera-checklist">
        ${
          needSelfie
            ? `<div class="camera-check-item ${hasSelfie ? "is-done" : "is-wait"}">
                 <span>${hasSelfie ? "✓" : "1."}</span>
                 <span>${hasSelfie ? "Foto selfie baru sudah diambil" : "Langkah 1: Tekan '📸 Ambil Foto Selfie Sekarang'"}</span>
               </div>`
            : ""
        }
        ${
          needGps
            ? `<div class="camera-check-item ${hasGps ? "is-done" : "is-wait"}">
                 <span>${hasGps ? "✓" : "2."}</span>
                 <span>${
                   hasGps
                     ? `Koordinat GPS terkunci (${dist !== null ? `${dist}m` : "OK"} • ±${accuracy}m)`
                     : liveCamera.gpsLoading
                     ? "Sedang mengambil koordinat GPS..."
                     : "GPS belum tersedia — klik '🔄 Ambil Ulang GPS'"
                 }</span>
               </div>`
            : ""
        }
      </div>
      ${
        geoWarning
          ? `<div style="font-size:11.5px;color:var(--amber-800);background:var(--amber-50);border:1px solid #fde68a;border-radius:10px;padding:8px 10px;margin-bottom:8px;line-height:1.45;">
               ⚠️ ${esc(geoWarning)}
             </div>`
          : ""
      }
      <button
        type="button"
        class="btn ${isCheckIn ? "btn-emerald" : "btn-amber"} ${allReady ? "" : "btn-pending-check"}"
        style="width:100%;padding:13px;font-size:13.5px;"
        data-action="submit-attendance"
        ${liveCamera.submitting ? "disabled" : ""}
      >
        ${
          liveCamera.submitting
            ? "⏳ Mengunggah Bukti &amp; Memvalidasi di Server..."
            : isCheckIn
            ? "✓ Kirim Bukti &amp; Konfirmasi Check In"
            : "✓ Kirim Bukti &amp; Konfirmasi Check Out"
        }
      </button>
    `;
  }

  function updateCameraModalPanelsInPlace() {
    if (!uiState.modal || uiState.modal.type !== "camera_attendance") return false;
    const gpsEl = document.getElementById("camera-gps-section");
    const errEl = document.getElementById("camera-modal-error-box");
    const subEl = document.getElementById("camera-submit-section");
    if (!gpsEl || !errEl || !subEl) return false;
    gpsEl.innerHTML = renderCameraGpsInnerHtml();
    errEl.innerHTML = renderCameraErrorBoxInnerHtml();
    subEl.innerHTML = renderCameraSubmitBtnInnerHtml();
    return true;
  }

  async function startLiveFrontCamera() {
    stopCameraStream();
    liveCamera.cameraError = null;
    liveCamera.videoReady = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      liveCamera.cameraError =
        "Browser ini tidak mendukung akses kamera langsung (getUserMedia). Pastikan membuka aplikasi melalui HTTPS (Vercel) atau http://localhost.";
      renderModalContainerOnly();
      return;
    }

    try {
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 960 },
            height: { ideal: 720 },
          },
        });
      } catch {
        // Fallback kamera standar untuk Safari iOS / Android WebView tertentu
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: true,
        });
      }
      liveCamera.stream = stream;
      attachStreamToVideoElement();
    } catch (err) {
      liveCamera.cameraError =
        "Akses kamera ditolak atau kamera tidak tersedia (" +
        (err.message || err.name) +
        "). Izinkan akses Kamera pada pengaturan browser untuk melanjutkan absensi.";
      renderModalContainerOnly();
    }
  }

  function syncVideoReadyIndicator() {
    const videoEl = document.getElementById("live-selfie-video");
    const loadingPill = document.getElementById("camera-loading-pill");
    const ready = Boolean(videoEl && videoEl.videoWidth > 0 && videoEl.readyState >= 2);
    liveCamera.videoReady = ready;
    if (loadingPill) {
      loadingPill.style.display = ready ? "none" : "flex";
    }
  }

  function attachStreamToVideoElement() {
    const videoEl = document.getElementById("live-selfie-video");
    if (!videoEl || !liveCamera.stream) return;

    videoEl.setAttribute("playsinline", "true");
    videoEl.setAttribute("autoplay", "true");
    videoEl.muted = true;

    if (videoEl.srcObject !== liveCamera.stream) {
      videoEl.srcObject = liveCamera.stream;
    }

    const markReady = () => {
      syncVideoReadyIndicator();
    };
    videoEl.onloadedmetadata = markReady;
    videoEl.oncanplay = markReady;
    videoEl.onloadeddata = markReady;

    videoEl.play().then(markReady).catch(() => {});
    setTimeout(markReady, 450);
  }

  function applyGpsPositionFix(pos) {
    if (!uiState.modal || uiState.modal.type !== "camera_attendance") return;
    const nextFix = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
    const prevAcc = liveCamera.gps ? Number(liveCamera.gps.accuracy || Infinity) : Infinity;
    if (!liveCamera.gps || nextFix.accuracy <= prevAcc) {
      liveCamera.gps = nextFix;
    }
    liveCamera.gpsLoading = false;
    liveCamera.gpsError = null;
    if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
    if (nextFix.accuracy <= 60 && liveCamera.gpsWatchId !== null && navigator.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(liveCamera.gpsWatchId);
      liveCamera.gpsWatchId = null;
    }
  }

  function formatGpsErrorMessage(err) {
    if (err && err.code === 1) {
      return "Izin Lokasi (GPS) ditolak browser. Aktifkan Lokasi untuk situs ini di Pengaturan Safari/Browser (ikon gembok/AA di URL bar) & GPS perangkat, lalu klik 'Ambil Ulang GPS'.";
    }
    if (err && err.code === 2) {
      return "Sinyal lokasi perangkat belum terdeteksi. Pastikan Location Services / GPS aktif dan dekatkan ke jendela atau area terbuka, lalu klik 'Ambil Ulang GPS'.";
    }
    return "Waktu pengambilan lokasi habis (Timeout). Pastikan GPS / Wi-Fi aktif lalu klik tombol 'Ambil Ulang GPS'.";
  }

  function requestRealDeviceGps() {
    stopGpsWatcher();
    liveCamera.gpsLoading = true;
    liveCamera.gpsError = null;
    if (!updateCameraModalPanelsInPlace()) {
      renderModalContainerOnly();
    }

    if (!navigator.geolocation) {
      liveCamera.gpsLoading = false;
      liveCamera.gpsError = "Perangkat / browser Anda tidak mendukung Geolocation GPS.";
      if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
      return;
    }

    const runCoarseFallback = () => {
      if (!uiState.modal || uiState.modal.type !== "camera_attendance" || liveCamera.gps) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => applyGpsPositionFix(pos),
        (fallbackErr) => {
          if (!uiState.modal || uiState.modal.type !== "camera_attendance" || liveCamera.gps) return;
          liveCamera.gpsLoading = false;
          liveCamera.gpsError = formatGpsErrorMessage(fallbackErr);
          if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
        },
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 120000,
        }
      );
    };

    // Jika GPS presisi tinggi > 3.5 detik belum merespons (umum di Safari Mac/indoor), otomatis coba lokasi Wi-Fi/jaringan
    liveCamera.gpsFallbackTimer = setTimeout(() => {
      runCoarseFallback();
    }, 3500);

    navigator.geolocation.getCurrentPosition(
      (pos) => applyGpsPositionFix(pos),
      (err) => {
        if (!uiState.modal || uiState.modal.type !== "camera_attendance") return;
        if (err && err.code === 1) {
          stopGpsWatcher();
          liveCamera.gpsLoading = false;
          liveCamera.gpsError = formatGpsErrorMessage(err);
          if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
          return;
        }
        runCoarseFallback();
      },
      {
        enableHighAccuracy: true,
        timeout: 9000,
        maximumAge: 15000,
      }
    );

    if (typeof navigator.geolocation.watchPosition === "function") {
      liveCamera.gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => applyGpsPositionFix(pos),
        () => {},
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    }
  }

  function captureFreshSelfieFrame() {
    const videoEl = document.getElementById("live-selfie-video");
    if (!videoEl || !liveCamera.stream || videoEl.videoWidth === 0 || videoEl.readyState < 2) {
      liveCamera.submitError =
        "Kamera belum menampilkan gambar wajah penuh. Tunggu 1–2 detik hingga pratinjau wajah muncul, lalu tekan 'Ambil Foto Selfie Sekarang'.";
      if (!updateCameraModalPanelsInPlace()) {
        renderModalContainerOnly();
      }
      return;
    }

    liveCamera.submitError = null;
    const targetW = 800;
    const targetH = Math.round((videoEl.videoHeight / videoEl.videoWidth) * targetW) || 600;
    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    // Mirror horizontal sesuai pratinjau kamera depan (tanpa filter kecantikan)
    ctx.save();
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, 0, 0, targetW, targetH);
    ctx.restore();

    // Watermark waktu resmi server & identitas Suka Latte di bagian bawah bukti foto
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
    const chosenShift = getSelectedAttendanceShift();
    const barHeight = 52;
    ctx.fillStyle = "rgba(20, 17, 15, 0.76)";
    ctx.fillRect(0, targetH - barHeight, targetW, barHeight);

    ctx.fillStyle = "#FAF6F0";
    ctx.font = "bold 14px sans-serif";
    const modeLabel = liveCamera.mode === "check_in" ? "CHECK IN" : "CHECK OUT";
    const shiftLabel = chosenShift ? chosenShift.name : "Shift";
    ctx.fillText(
      `SUKA LATTE • ${modeLabel} (${shiftLabel}) • ${s.currentUser.full_name} (${s.currentUser.employee_code})`,
      14,
      targetH - 29
    );

    ctx.fillStyle = "#DFC8AA";
    ctx.font = "12px monospace";
    const gpsText = liveCamera.gps
      ? `GPS: ${liveCamera.gps.lat.toFixed(5)}, ${liveCamera.gps.lng.toFixed(5)} (±${Math.round(liveCamera.gps.accuracy)}m)`
      : "GPS: Menunggu koordinat";
    ctx.fillText(
      `Server: ${parts.dateString} ${parts.timeString} (${tz}) | ${gpsText}`,
      14,
      targetH - 11
    );

    liveCamera.capturedDataUrl = canvas.toDataURL("image/jpeg", 0.84);
    stopCameraStream();
    renderModalContainerOnly();
  }

  async function openAttendanceCameraModal(mode) {
    if (!Core.isApprovedUser()) {
      showBanner(false, "Akun Anda belum aktif atau belum disetujui Admin.");
      return;
    }
    const s = Core.state;
    const activeShifts = getActiveShiftsList();
    const openAtt = s.attendance.find(
      (a) => a.employee_id === s.currentUser.id && a.check_in_at && !a.check_out_at
    );
    const defaultShiftId =
      mode === "check_out" && openAtt?.shift_id
        ? openAtt.shift_id
        : activeShifts.find((sh) => sh.id === s.currentUser?.shift_id)?.id ||
          activeShifts[0]?.id ||
          s.currentUser?.shift_id ||
          null;

    stopCameraStream();
    stopGpsWatcher();

    liveCamera.mode = mode === "check_out" ? "check_out" : "check_in";
    liveCamera.shiftId = defaultShiftId;
    liveCamera.capturedDataUrl = null;
    liveCamera.cameraError = null;
    liveCamera.videoReady = false;
    liveCamera.gps = null;
    liveCamera.gpsError = null;
    liveCamera.submitError = null;
    liveCamera.submitting = false;

    uiState.modal = { type: "camera_attendance" };
    render();

    // Jalankan izin Kamera lebih dulu lalu GPS agar Safari/iOS tidak menelan salah satu dialog izin
    await startLiveFrontCamera();
    requestRealDeviceGps();
  }

  // ==========================================================================
  // 3. RENDER MODAL PRODUKSI
  // ==========================================================================
  function renderActiveModalHtml() {
    if (!uiState.modal) return "";
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";

    // A. MODAL KAMERA SELFIE BARU & VALIDASI GPS ASLI
    if (uiState.modal.type === "camera_attendance") {
      const isCheckIn = liveCamera.mode === "check_in";
      const u = s.currentUser;
      const outlet = s.outlets.find((o) => o.id === u.outlet_id) || s.outlets[0];
      const activeShifts = getActiveShiftsList();
      const selectedShift = getSelectedAttendanceShift();

      return `
        <div class="modal-backdrop">
          <div class="modal-window">
            <div class="modal-header">
              <div>
                <div style="font-size:11px;color:var(--coffee-300);font-weight:700;text-transform:uppercase;">
                  Verifikasi Kehadiran Real-Time • Wajib Kamera Langsung &amp; GPS Asli
                </div>
                <h3 style="font-size:17px;font-weight:800;">
                  ${isCheckIn ? "📷 Ambil Selfie Baru — Check In Masuk" : "📷 Ambil Selfie Baru — Check Out Pulang"}
                </h3>
              </div>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <div class="grid-12">
                <div class="col-7">
                  <div class="camera-stage">
                    ${
                      liveCamera.capturedDataUrl
                        ? `<img src="${liveCamera.capturedDataUrl}" alt="Hasil Selfie Baru" />`
                        : liveCamera.cameraError
                        ? `<div style="padding:24px;text-align:center;color:var(--cream);font-size:12.5px;">
                            <div style="font-size:26px;margin-bottom:8px;">🚫</div>
                            <strong>Kamera Tidak Dapat Diakses</strong>
                            <p style="color:var(--coffee-300);margin-top:6px;">${esc(liveCamera.cameraError)}</p>
                          </div>`
                        : `<video id="live-selfie-video" autoplay playsinline muted></video>
                           <div id="camera-loading-pill" style="position:absolute;top:12px;left:12px;display:${liveCamera.videoReady ? "none" : "flex"};align-items:center;gap:6px;background:rgba(20,17,15,0.82);color:var(--coffee-200);padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;">
                             ⏳ Menyiapkan pratinjau kamera depan...
                           </div>
                           <div class="face-guide-overlay">
                             <div class="face-oval"></div>
                             <div class="face-caption">Posisikan wajah terlihat jelas &amp; pencahayaan cukup</div>
                           </div>`
                    }
                  </div>

                  <div style="display:flex;gap:10px;margin-top:12px;">
                    ${
                      liveCamera.capturedDataUrl
                        ? `<button type="button" class="btn btn-outline" style="flex:1;" data-action="retake-selfie" ${liveCamera.submitting ? "disabled" : ""}>
                            🔄 Ambil Ulang Foto Selfie
                          </button>`
                        : `<button type="button" id="btn-capture-selfie" class="btn btn-primary" style="flex:1;padding:12px;" data-action="capture-selfie" ${liveCamera.cameraError ? "disabled" : ""}>
                            📸 Ambil Foto Selfie Sekarang
                          </button>`
                    }
                  </div>
                </div>

                <div class="col-5" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
                  <div style="display:flex;flex-direction:column;gap:10px;">
                    <div class="card-subtle">
                      <div style="font-size:11px;font-weight:800;color:var(--coffee-700);text-transform:uppercase;">Outlet Penugasan</div>
                      <div style="font-size:14px;font-weight:800;">${esc(outlet ? outlet.name : "Belum Ditetapkan")}</div>
                      <div style="font-size:11.5px;color:var(--stone-600);">
                        Batas Radius: <strong>${outlet ? outlet.geofence_radius_meters : "-"}m</strong> • Batas Akurasi: <strong>±${outlet ? outlet.minimum_gps_accuracy_meters : "-"}m</strong>
                      </div>
                    </div>

                    <div class="card-subtle">
                      <div style="font-size:11px;font-weight:800;color:var(--coffee-700);text-transform:uppercase;margin-bottom:4px;">Jadwal Shift Absensi</div>
                      ${
                        isCheckIn
                          ? `<select id="camera-shift-select" class="form-select" ${liveCamera.submitting ? "disabled" : ""}>
                              ${(activeShifts.length ? activeShifts : s.shifts)
                                .map(
                                  (sh) => `<option value="${esc(sh.id)}" ${selectedShift && sh.id === selectedShift.id ? "selected" : ""}>
                                    ${esc(sh.name)} (${esc(String(sh.start_time).slice(0, 5))}–${esc(String(sh.end_time).slice(0, 5))} WITA • Telat &gt;${Number(sh.grace_period_minutes ?? 15)}m)
                                  </option>`
                                )
                                .join("")}
                            </select>
                            <div style="font-size:11px;color:var(--stone-600);margin-top:4px;">
                              Check In melebihi <strong>${Number(selectedShift?.grace_period_minutes ?? 15)} menit</strong> otomatis mengeluarkan status <strong>Terlambat</strong>.
                            </div>`
                          : `<div style="font-size:13px;font-weight:800;">
                              ${esc(selectedShift ? `${selectedShift.name} (${String(selectedShift.start_time).slice(0, 5)}–${String(selectedShift.end_time).slice(0, 5)} WITA)` : "-")}
                            </div>`
                      }
                    </div>

                    <div id="camera-gps-section" class="card-subtle">
                      ${renderCameraGpsInnerHtml()}
                    </div>

                    <div style="font-size:11px;color:var(--stone-600);background:var(--coffee-100);padding:10px 12px;border-radius:10px;">
                      🔒 Foto diambil langsung dari kamera perangkat. Waktu resmi &amp; folder arsip bulanan ditetapkan oleh server WITA.
                    </div>

                    <div id="camera-modal-error-box">${renderCameraErrorBoxInnerHtml()}</div>
                  </div>

                  <div id="camera-submit-section">
                    ${renderCameraSubmitBtnInnerHtml()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // B. MODAL INSPEKSI DETAIL BUKTI ABSENSI
    if (uiState.modal.type === "inspect_record") {
      const rec = s.attendance.find((a) => a.id === uiState.modal.recordId);
      if (!rec) return "";
      if (Core.isMemberOnly() && rec.employee_id !== s.currentUser.id) return "";

      const emp =
        s.profiles.find((p) => p.id === rec.employee_id) ||
        (s.currentUser?.id === rec.employee_id ? s.currentUser : null);
      const out = s.outlets.find((o) => o.id === rec.outlet_id);
      const sh = s.shifts.find((x) => x.id === rec.shift_id);
      const inUrl = Core.getSignedPhotoUrl(rec.check_in_photo_path);
      const outUrl = Core.getSignedPhotoUrl(rec.check_out_photo_path);

      return `
        <div class="modal-backdrop">
          <div class="modal-window">
            <div class="modal-header">
              <div>
                <div style="font-size:11px;color:var(--coffee-300);font-weight:700;">DETAIL BUKTI KEHADIRAN &amp; ARSIP BULANAN</div>
                <h3 style="font-size:17px;font-weight:800;">${esc(emp ? emp.full_name : "Karyawan")} — Tanggal Kerja ${esc(rec.work_date)}</h3>
              </div>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <div style="font-size:12.5px;">
                  Outlet: <strong>${esc(out ? out.name : "-")}</strong> • Shift: <strong>${esc(sh ? sh.name : "-")}</strong> • Durasi: <strong>${Core.formatDurationMinutes(rec.work_duration_minutes)}</strong>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                  <span class="badge badge-member mono">📁 ${esc(rec.archive_folder_label)}</span>
                  ${Core.getStatusBadgeHtml(rec.attendance_status, rec.late_minutes)}
                </div>
              </div>

              <div class="grid-2">
                <div class="card-subtle">
                  <div style="font-weight:800;font-size:13px;color:var(--emerald-800);margin-bottom:8px;">1. BUKTI CHECK IN (MASUK)</div>
                  <div class="evidence-thumb" style="border-radius:10px;margin-bottom:10px;">
                    ${inUrl ? `<img src="${esc(inUrl)}" alt="Selfie Check In" />` : `<span style="font-size:12px;color:var(--stone-500);">Tidak ada foto</span>`}
                  </div>
                  <div class="mono" style="font-size:11px;line-height:1.65;">
                    Waktu Server: <strong>${Core.formatOperationalDateTime(rec.check_in_at, tz)}</strong><br/>
                    Koordinat: ${rec.check_in_latitude ?? "-"}, ${rec.check_in_longitude ?? "-"}<br/>
                    Jarak &amp; Akurasi: ${rec.check_in_distance_meters ?? "-"}m (±${Math.round(rec.check_in_accuracy || 0)}m)<br/>
                    Status Lokasi: ${esc(rec.check_in_location_status || "-")}
                  </div>
                  ${
                    inUrl
                      ? `<a href="${esc(inUrl)}" target="_blank" rel="noreferrer" class="btn btn-outline btn-sm" style="margin-top:8px;width:100%;text-decoration:none;">↗ Buka / Unduh Foto Check In</a>`
                      : ""
                  }
                </div>

                <div class="card-subtle">
                  <div style="font-weight:800;font-size:13px;color:var(--amber-800);margin-bottom:8px;">2. BUKTI CHECK OUT (PULANG)</div>
                  <div class="evidence-thumb" style="border-radius:10px;margin-bottom:10px;">
                    ${outUrl ? `<img src="${esc(outUrl)}" alt="Selfie Check Out" />` : `<span style="font-size:12px;color:var(--stone-500);">Belum Check Out</span>`}
                  </div>
                  <div class="mono" style="font-size:11px;line-height:1.65;">
                    Waktu Server: <strong>${Core.formatOperationalDateTime(rec.check_out_at, tz)}</strong><br/>
                    Koordinat: ${rec.check_out_latitude ?? "-"}, ${rec.check_out_longitude ?? "-"}<br/>
                    Jarak &amp; Akurasi: ${rec.check_out_distance_meters ?? "-"}m (±${Math.round(rec.check_out_accuracy || 0)}m)<br/>
                    Status Lokasi: ${esc(rec.check_out_location_status || "-")}
                  </div>
                  ${
                    outUrl
                      ? `<a href="${esc(outUrl)}" target="_blank" rel="noreferrer" class="btn btn-outline btn-sm" style="margin-top:8px;width:100%;text-decoration:none;">↗ Buka / Unduh Foto Check Out</a>`
                      : ""
                  }
                </div>
              </div>

              ${
                rec.correction_note || rec.anomaly_notes
                  ? `<div class="card-subtle" style="background:var(--amber-50);border-color:#fde68a;font-size:12px;">
                      <strong>Catatan Sistem / Koreksi:</strong> ${esc(rec.correction_note || rec.anomaly_notes)}
                    </div>`
                  : ""
              }
            </div>
          </div>
        </div>
      `;
    }

    // C. MODAL EDIT PENUH DATA KARYAWAN (SUPER ADMIN & ADMIN)
    if (uiState.modal.type === "edit_employee") {
      Core.assertManagerAccess("ModalEditEmployee");
      const emp = s.profiles.find((p) => p.id === uiState.modal.userId);
      if (!emp) return "";
      const isTargetSuper = emp.role === "super_admin";

      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">✏️ Edit Profil &amp; Penugasan Karyawan</h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <form id="form-edit-employee" novalidate>
                <input type="hidden" name="target_user_id" value="${esc(emp.id)}" />
                <div class="card-subtle" style="margin-bottom:14px;font-size:12px;">
                  Akun Google Terhubung: <strong>${esc(emp.email)}</strong>
                </div>
                <div class="grid-2" style="gap:10px;">
                  <div class="form-group">
                    <label class="form-label">ID Karyawan *</label>
                    <input class="form-input mono" name="employee_code" value="${esc(emp.employee_code)}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Status Akun *</label>
                    <select class="form-select" name="status" ${isTargetSuper ? "disabled" : ""}>
                      <option value="active" ${emp.status === "active" ? "selected" : ""}>Aktif (Diizinkan Login Otomatis)</option>
                      <option value="inactive" ${emp.status === "inactive" ? "selected" : ""}>Nonaktif (Blokir Sesi Masuk)</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Nama Lengkap Karyawan *</label>
                  <input class="form-input" name="full_name" value="${esc(emp.full_name)}" required />
                </div>
                <div class="grid-2" style="gap:10px;">
                  <div class="form-group">
                    <label class="form-label">Jabatan / Posisi *</label>
                    <input class="form-input" name="position_title" value="${esc(emp.position_title)}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">No. Telepon / WhatsApp</label>
                    <input class="form-input" name="phone" value="${esc(emp.phone || "")}" />
                  </div>
                </div>
                <div class="grid-2" style="gap:10px;">
                  <div class="form-group">
                    <label class="form-label">Outlet Penugasan *</label>
                    <select class="form-select" name="outlet_id">
                      ${s.outlets
                        .map(
                          (o) =>
                            `<option value="${esc(o.id)}" ${emp.outlet_id === o.id ? "selected" : ""}>${esc(o.name)}</option>`
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Jadwal Shift Kerja *</label>
                    <select class="form-select" name="shift_id">
                      ${s.shifts
                        .map(
                          (sh) =>
                            `<option value="${esc(sh.id)}" ${emp.shift_id === sh.id ? "selected" : ""}>${esc(sh.name)} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)})</option>`
                        )
                        .join("")}
                    </select>
                  </div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:14px;flex-wrap:wrap;">
                  ${
                    Core.canDeleteEmployee(emp)
                      ? `<button type="button" class="btn btn-danger btn-sm" data-action="delete-employee" data-userid="${esc(emp.id)}">🗑️ Hapus Member (Resign)</button>`
                      : `<span></span>`
                  }
                  <div style="display:flex;gap:8px;">
                    <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                    <button type="button" id="btn-save-employee" class="btn btn-primary" data-action="submit-edit-employee">💾 Simpan Perubahan Profil</button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // D. MODAL TOLAK LOGIN PERTAMA AKUN GOOGLE
    if (uiState.modal.type === "reject_first_login") {
      Core.assertManagerAccess("ModalRejectFirstLogin");
      const emp = s.profiles.find((p) => p.id === uiState.modal.userId);
      if (!emp) return "";
      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">✕ Tolak Permintaan Login Pertama</h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <form id="form-reject-first-login" novalidate>
                <input type="hidden" name="target_user_id" value="${esc(emp.id)}" />
                <p style="font-size:12.5px;color:var(--stone-600);margin-bottom:12px;">
                  Anda akan menolak permintaan akses login pertama dari <strong>${esc(emp.full_name)}</strong> (<code>${esc(emp.email)}</code>).
                </p>
                <div class="form-group">
                  <label class="form-label">Alasan Penolakan (Tercatat di Audit Log) *</label>
                  <textarea class="form-textarea" name="note" rows="3" placeholder="Contoh: Bukan akun email karyawan resmi Suka Latte." required></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-danger" data-action="submit-reject-first-login">Konfirmasi Tolak Akses</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // E. MODAL PROMOSI / DEMOSI ROLE ADMIN (KHUSUS SUPER ADMIN)
    if (uiState.modal.type === "change_role") {
      Core.assertSuperAdminAccess("ModalChangeRole");
      const emp = s.profiles.find((p) => p.id === uiState.modal.userId);
      if (!emp) return "";
      const toAdmin = uiState.modal.newRole === "admin";
      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">
                ${toAdmin ? "⬆️ Promosikan Anggota Menjadi Admin" : "⬇️ Turunkan Admin Menjadi Anggota"}
              </h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <form id="form-change-role" novalidate>
                <input type="hidden" name="target_user_id" value="${esc(emp.id)}" />
                <input type="hidden" name="new_role" value="${esc(uiState.modal.newRole)}" />
                <div class="card-subtle" style="margin-bottom:12px;font-size:12.5px;">
                  Target Pengguna: <strong>${esc(emp.full_name)}</strong> (${esc(emp.email)})<br/>
                  Perubahan Role: <strong>${esc(emp.role.toUpperCase())} → ${esc(uiState.modal.newRole.toUpperCase())}</strong>
                </div>
                <div class="form-group">
                  <label class="form-label">Alasan Perubahan Jabatan Sistem (Sudah diisi otomatis, boleh diubah)</label>
                  <textarea class="form-textarea" name="reason" rows="2" required>${esc(
                    toAdmin
                      ? "Dipromosikan menjadi Admin operasional oleh Super Admin."
                      : "Diturunkan menjadi Anggota oleh Super Admin."
                  )}</textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" id="btn-save-change-role" class="btn btn-primary" data-action="submit-change-role">Simpan Perubahan Role</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // F. MODAL EDIT LANGSUNG KEHADIRAN OLEH SUPER ADMIN / ADMIN
    if (uiState.modal.type === "admin_edit_att") {
      Core.assertManagerAccess("ModalAdminEditAttendance");
      const rec = s.attendance.find((a) => a.id === uiState.modal.recordId);
      if (!rec) return "";
      const emp = s.profiles.find((p) => p.id === rec.employee_id);
      const statuses = [
        { val: "selesai", label: "Selesai (Lengkap)" },
        { val: "hadir", label: "Hadir Tepat Waktu" },
        { val: "sudah_check_in_belum_check_out", label: "Sedang Bertugas (Belum Check Out)" },
        { val: "terlambat", label: "Terlambat" },
        { val: "pulang_cepat", label: "Pulang Cepat" },
        { val: "izin", label: "Izin" },
        { val: "sakit", label: "Sakit" },
        { val: "cuti", label: "Cuti" },
        { val: "tidak_hadir", label: "Tidak Hadir" },
      ];

      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">✏️ Edit Administratif Catatan Kehadiran</h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <form id="form-admin-edit-att" novalidate>
                <input type="hidden" name="attendance_id" value="${esc(rec.id)}" />
                <div class="card-subtle" style="margin-bottom:12px;font-size:12px;">
                  Karyawan: <strong>${esc(emp ? emp.full_name : "-")}</strong> • Tanggal Kerja: <strong>${esc(rec.work_date)}</strong><br/>
                  <span style="color:var(--emerald-800);font-weight:700;">🔒 Bukti foto selfie asli tetap dipertahankan utuh di Private Storage.</span>
                </div>
                <div class="grid-2" style="gap:10px;">
                  <div class="form-group">
                    <label class="form-label">Waktu Check In (${esc(tz)}) *</label>
                    <input type="datetime-local" class="form-input mono" name="check_in_local" value="${esc(isoToLocalInput(rec.check_in_at, tz))}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Waktu Check Out (${esc(tz)})</label>
                    <input type="datetime-local" class="form-input mono" name="check_out_local" value="${esc(isoToLocalInput(rec.check_out_at, tz))}" />
                  </div>
                </div>
                <div class="grid-2" style="gap:10px;">
                  <div class="form-group">
                    <label class="form-label">Jadwal Shift *</label>
                    <select class="form-select" name="shift_id">
                      ${s.shifts
                        .map(
                          (sh) =>
                            `<option value="${esc(sh.id)}" ${rec.shift_id === sh.id ? "selected" : ""}>${esc(sh.name)} (${esc(String(sh.start_time).slice(0, 5))}–${esc(String(sh.end_time).slice(0, 5))})</option>`
                        )
                        .join("")}
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Status Kehadiran *</label>
                    <select class="form-select" name="status">
                      ${statuses
                        .map(
                          (st) =>
                            `<option value="${st.val}" ${rec.attendance_status === st.val ? "selected" : ""}>${esc(st.label)}</option>`
                        )
                        .join("")}
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Alasan Pengeditan (Wajib untuk Audit Log) *</label>
                  <textarea class="form-textarea" name="reason" rows="2" placeholder="Contoh: Penyesuaian jam pulang karena kendala jaringan HP saat penutupan outlet." required></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" id="btn-save-admin-edit-att" class="btn btn-primary" data-action="submit-admin-edit-att">💾 Simpan Koreksi Kehadiran</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // G. MODAL PENINJAUAN KOREKSI KEHADIRAN OLEH ADMIN / SUPER ADMIN
    if (uiState.modal.type === "review_corr") {
      Core.assertManagerAccess("ModalReviewCorrection");
      const corr = s.corrections.find((c) => c.id === uiState.modal.corrId);
      if (!corr) return "";
      const isApprove = uiState.modal.decision === "approved";
      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">
                ${isApprove ? "✓ Setujui Permintaan Koreksi Absensi" : "✕ Tolak Permintaan Koreksi Absensi"}
              </h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <form id="form-review-corr" novalidate>
                <input type="hidden" name="correction_id" value="${esc(corr.id)}" />
                <input type="hidden" name="decision" value="${esc(uiState.modal.decision)}" />
                <div class="card-subtle" style="margin-bottom:12px;font-size:12px;">
                  Tanggal Kerja: <strong>${esc(corr.work_date)}</strong><br/>
                  Alasan Pengajuan: ${esc(corr.reason)}
                </div>
                <div class="form-group">
                  <label class="form-label">Catatan Tinjauan Admin *</label>
                  <textarea class="form-textarea" name="review_note" rows="2" required>${isApprove ? "Disetujui setelah verifikasi operasional outlet." : "Permintaan ditolak karena bukti operasional tidak sesuai."}</textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn ${isApprove ? "btn-emerald" : "btn-danger"}" data-action="submit-review-corr">
                    ${isApprove ? "Konfirmasi Setujui" : "Konfirmasi Tolak"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // H. MODAL PENGAJUAN KOREKSI PRIBADI (HANYA JIKA DIAKTIFKAN OLEH PENGELOLA)
    if (uiState.modal.type === "member_corr") {
      if (!Core.isManager() && !s.settings.allow_member_request_corrections) {
        Core.assertManagerAccess("ModalMemberCorrection");
      }
      const rec = s.attendance.find(
        (a) => a.id === uiState.modal.recordId && a.employee_id === s.currentUser.id
      );
      if (!rec) return "";
      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">📝 Ajukan Koreksi Absensi Pribadi</h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <form id="form-member-corr" novalidate>
                <input type="hidden" name="attendance_id" value="${esc(rec.id)}" />
                <div class="card-subtle" style="margin-bottom:12px;font-size:12px;">
                  Tanggal Kerja: <strong>${esc(rec.work_date)}</strong> • Permintaan akan ditinjau oleh Admin / Super Admin.
                </div>
                <div class="grid-2" style="gap:10px;">
                  <div class="form-group">
                    <label class="form-label">Usulan Jam Check In (${esc(tz)})</label>
                    <input type="datetime-local" class="form-input mono" name="check_in_local" value="${esc(isoToLocalInput(rec.check_in_at, tz))}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Usulan Jam Check Out (${esc(tz)})</label>
                    <input type="datetime-local" class="form-input mono" name="check_out_local" value="${esc(isoToLocalInput(rec.check_out_at, tz))}" required />
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Alasan Pengajuan Koreksi *</label>
                  <textarea class="form-textarea" name="reason" rows="3" placeholder="Jelaskan alasan pengajuan koreksi secara jujur dan jelas..." required></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-primary" data-action="submit-member-corr">Kirim Pengajuan ke Admin</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // I. MODAL PENGAJUAN IZIN / SAKIT / CUTI / LIBUR PRIBADI (BISA DARI LUAR OUTLET)
    if (uiState.modal.type === "member_leave") {
      if (!Core.isManager() && !s.settings.allow_member_request_leaves) {
        Core.assertManagerAccess("ModalMemberLeave");
      }
      const todayStr = Core.getTimePartsInTimezone(Core.getServerNow(), tz).dateString;
      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">📅 Ajukan Izin, Cuti atau Libur</h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <div style="margin-bottom:14px;padding:11px 13px;border-radius:12px;background:var(--emerald-50);border:1px solid #a7f3d0;color:var(--emerald-800);font-size:12px;line-height:1.5;">
                📍 <strong>Bisa diajukan dari luar outlet (tanpa foto wajah &amp; tanpa GPS):</strong><br/>
                Absensi foto wajah di outlet hanya diperlukan saat Anda masuk hadir bekerja. Untuk libur pribadi, izin, sakit, atau cuti cukup isi formulir di bawah ini.
              </div>
              <form id="form-member-leave" novalidate>
                <div class="form-group">
                  <label class="form-label">Jenis Pengajuan *</label>
                  <select class="form-select" name="type">
                    <option value="izin">Izin / Libur Tidak Masuk (Diluar Outlet)</option>
                    <option value="cuti">Cuti / Pengajuan Libur Terjadwal</option>
                    <option value="sakit">Sakit</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">Judul Singkat *</label>
                  <input class="form-input" name="title" placeholder="Contoh: Pengajuan Libur / Izin Keluarga / Cuti" required />
                </div>
                <div class="grid-2" style="gap:10px;">
                  <div class="form-group">
                    <label class="form-label">Mulai Tanggal *</label>
                    <input type="date" class="form-input" name="date_start" value="${esc(todayStr)}" required />
                  </div>
                  <div class="form-group">
                    <label class="form-label">Sampai Tanggal *</label>
                    <input type="date" class="form-input" name="date_end" value="${esc(todayStr)}" required />
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">Keterangan Lengkap *</label>
                  <textarea class="form-textarea" name="reason" rows="3" placeholder="Tuliskan alasan pengajuan libur / izin / cuti untuk ditinjau Admin..." required></textarea>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-primary" data-action="submit-member-leave">Kirim Pengajuan</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // J. MODAL KONFIRMASI HAPUS / ARSIPKAN (PENGGANTI BROWSER CONFIRM)
    if (uiState.modal.type === "confirm_delete") {
      Core.assertManagerAccess("ModalConfirmDelete");
      if (uiState.modal.kind === "employee") {
        const emp = s.profiles.find((p) => p.id === uiState.modal.id);
        return `
          <div class="modal-backdrop">
            <div class="modal-window sm">
              <div class="modal-header">
                <h3 style="font-size:16px;font-weight:800;">🗑️ Hapus Member / Karyawan Resign</h3>
                <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
              </div>
              <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
                <div class="card-subtle" style="border-color:#fda4af;background:var(--rose-50);font-size:12.5px;color:var(--rose-800);line-height:1.55;">
                  Anda akan menghapus / mengeluarkan <strong>${esc(uiState.modal.name || emp?.full_name || "Member")}</strong>
                  ${emp ? ` (<span class="mono">${esc(emp.employee_code)}</span> • ${esc(emp.email)})` : ""} dari daftar karyawan aktif.<br/>
                  Akses login dan absensi akun ini akan langsung diblokir. Jika migrasi hapus permanen sudah aktif di server, seluruh profil, foto, dan riwayat terkait ikut dibersihkan.
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">Alasan Penghapusan (Tercatat di Audit Log)</label>
                  <input id="confirm-delete-reason" class="form-input" value="Karyawan resign" placeholder="Contoh: Karyawan resign per bulan ini" />
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-danger" data-action="confirm-delete-item">🗑️ Ya, Hapus Member Sekarang</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      const kindLabel = uiState.modal.kind === "outlet" ? "outlet" : "jadwal shift";
      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">🗑️ Konfirmasi Hapus ${esc(kindLabel === "outlet" ? "Outlet" : "Shift")}</h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
              <p style="font-size:13px;line-height:1.6;">
                Apakah Anda yakin ingin menghapus ${esc(kindLabel)} <strong>${esc(uiState.modal.name || "")}</strong>?
                Jika sudah memiliki riwayat absensi terikat, sistem akan mengalihkannya ke status <strong>Diarsipkan</strong> agar riwayat tetap aman.
              </p>
              <div style="display:flex;justify-content:flex-end;gap:8px;">
                <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                <button type="button" class="btn btn-danger" data-action="confirm-delete-item">Ya, Proses Sekarang</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return "";
  }

  function renderModalContainerOnly() {
    const modalRoot = document.getElementById("modal-root");
    if (modalRoot) {
      modalRoot.innerHTML = renderActiveModalHtml();
      if (uiState.modal && uiState.modal.type === "camera_attendance" && !liveCamera.capturedDataUrl) {
        attachStreamToVideoElement();
      }
    }
  }

  // ==========================================================================
  // 4. RENDER UTAMA SHELL APLIKASI (MEMISAHKAN ANGGOTA VS SUPER ADMIN & ADMIN)
  // ==========================================================================
  function render() {
    const appEl = document.getElementById("app");
    if (!appEl) return;

    const s = Core.state;
    document.body.setAttribute("data-theme", s.settings.theme_preset || "classic_latte");

    // 1. Layar Loading Awal
    if (s.loading) {
      appEl.innerHTML = `
        <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:radial-gradient(circle at top right,#2e190d 0%,#120b07 58%,#090503 100%);color:var(--cream);gap:14px;padding:24px;text-align:center;">
          <div class="brand-logo-wrap lg" style="box-shadow:0 16px 36px rgba(212,163,97,0.32);">
            <img src="assets/branding/suka-logo.png" alt="Suka Latte" />
          </div>
          <div style="font-size:16px;font-weight:800;letter-spacing:0.05em;color:var(--gold-200);">SUKA LATTE ATTENDANCE SYSTEM</div>
          <div style="font-size:12px;color:var(--coffee-300);">Menyiapkan sesi Google &amp; data operasional resmi...</div>
        </div>
      `;
      return;
    }

    // 2. Layar Konfigurasi Cloud Pertama Kali (atau jika tabel SQL belum dijalankan)
    if (!s.isConfigured || s.schemaMissing) {
      appEl.innerHTML = Views.renderCloudSetupScreen(uiState);
      return;
    }

    // 3. Layar Login Wajib Akun Google / Bootstrap Super Admin Pertama
    if (!s.bootstrapCompleted || !s.session || !s.currentUser) {
      appEl.innerHTML = Views.renderGoogleLoginOrBootstrapScreen(uiState);
      return;
    }

    // 4. Layar Menunggu Persetujuan Login Pertama oleh Admin / Ditolak / Nonaktif
    if (!Core.isApprovedUser()) {
      appEl.innerHTML = Views.renderPendingOrBlockedScreen(uiState);
      return;
    }

    // 5. Pengguna Sudah Disetujui & Aktif -> Pastikan Isolasi Navigasi Ketat!
    const u = s.currentUser;
    const isManager = Core.isManager();
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);

    if (!isManager) {
      // ANGGOTA DILARANG BERADA DI MENU PENGELOLA DALAM!
      if (uiState.activeNav !== "absensi_saya" && uiState.activeNav !== "riwayat_saya") {
        uiState.activeNav = "absensi_saya";
      }
    } else {
      if (uiState.activeNav === "absensi_saya" || uiState.activeNav === "riwayat_saya") {
        uiState.activeNav = "dashboard";
      }
    }

    // Cek status Check In / Check Out hari ini milik pengguna yang sedang login
    const openAttendance = s.attendance.find(
      (a) => a.employee_id === u.id && a.check_in_at && !a.check_out_at
    );
    const todayAttendance =
      openAttendance ||
      s.attendance.find((a) => a.employee_id === u.id && a.work_date === parts.dateString) ||
      null;

    const canCheckIn = !todayAttendance;
    const canCheckOut = Boolean(openAttendance);

    const pendingFirstLogins = isManager
      ? s.profiles.filter(
          (p) =>
            p.status === "pending_approval" ||
            (!p.first_login_approved && p.status !== "rejected")
        ).length
      : 0;
    const pendingCorrections = isManager
      ? s.corrections.filter((c) => c.status === "pending").length
      : 0;
    const totalPendingBadge = pendingFirstLogins + pendingCorrections;

    const navItems = isManager
      ? [
          { id: "dashboard", icon: "🏠", label: "Dashboard & Absensi" },
          { id: "archive", icon: "🗂️", label: "Arsip Foto Bulanan" },
          { id: "reports", icon: "📊", label: "Laporan & Ekspor" },
          {
            id: "control_panel",
            icon: "⚙️",
            label: "Control Panel (Edit)",
            count: totalPendingBadge,
          },
        ]
      : [
          { id: "absensi_saya", icon: "🏠", label: "Dashboard & Absensi" },
          { id: "riwayat_saya", icon: "📋", label: "Riwayat Absensi & Izin" },
        ];

    // Pertahankan fokus pencarian arsip jika sedang mengetik
    const activeElId = document.activeElement ? document.activeElement.id : null;
    const selStart =
      activeElId && typeof document.activeElement.selectionStart === "number"
        ? document.activeElement.selectionStart
        : null;

    let mainContentHtml = "";
    if (!isManager) {
      mainContentHtml =
        uiState.activeNav === "riwayat_saya"
          ? Views.renderMemberOwnHistoryView(uiState)
          : Views.renderMemberAttendanceHome(parts, todayAttendance, canCheckIn, canCheckOut);
    } else {
      if (uiState.activeNav === "archive") {
        mainContentHtml = Views.renderManagerArchiveView(parts, uiState);
      } else if (uiState.activeNav === "reports") {
        mainContentHtml = Views.renderManagerReportsView(uiState);
      } else if (uiState.activeNav === "control_panel") {
        mainContentHtml = Views.renderControlPanelView(uiState);
      } else {
        mainContentHtml = Views.renderManagerDashboardView(
          parts,
          todayAttendance,
          canCheckIn,
          canCheckOut
        );
      }
    }

    const roleLabel =
      u.role === "super_admin"
        ? "SUPER ADMIN"
        : u.role === "admin"
        ? "ADMIN"
        : "ANGGOTA";
    const roleBadgeCls =
      u.role === "super_admin"
        ? "badge-super"
        : u.role === "admin"
        ? "badge-admin"
        : "badge-member";

    appEl.innerHTML = `
      <div class="app-shell">
        <!-- SIDEBAR DESKTOP -->
        <aside class="sidebar">
          <div class="sidebar-top">
            <div class="brand-box">
              <div class="brand-logo-wrap">
                <img src="assets/branding/suka-logo.png" alt="Logo Suka Latte" />
              </div>
              <div>
                <div class="brand-title">${esc(s.settings.brand_display_name)}</div>
                <div class="brand-sub">${esc(s.settings.brand_subtitle)}</div>
                <div class="brand-tagline">"${esc(s.settings.brand_tagline)}"</div>
              </div>
            </div>

            <div class="clock-card">
              <div class="clock-label">
                Waktu Resmi Server (${esc(tz)})
              </div>
              <div id="live-server-clock-time" class="clock-time mono">${esc(parts.timeString)}</div>
              <div id="live-server-clock-date" class="clock-date">
                ${esc(parts.dateString)} • 📁 ${esc(parts.archiveFolderLabel)}
              </div>
            </div>

            <div class="nav-section-title">Navigasi Utama</div>
            <nav class="nav-list">
              ${navItems
                .map(
                  (item) => `
                <button class="nav-btn ${uiState.activeNav === item.id ? "active" : ""}" data-action="nav" data-target="${item.id}">
                  <span class="nav-btn-left"><span>${item.icon}</span><span>${esc(item.label)}</span></span>
                  ${item.count ? `<span class="count-pill">${item.count}</span>` : ""}
                </button>`
                )
                .join("")}
            </nav>

            ${
              isManager
                ? `<div style="margin-top:16px;">
                    <div class="nav-section-title">Pintasan Pengelola</div>
                    <div class="shortcut-grid">
                      <button class="shortcut-btn" data-action="jump-cp" data-tab="employees">👥 Setujui Login</button>
                      <button class="shortcut-btn" data-action="jump-cp" data-tab="shifts">⏱ Edit Shift</button>
                      <button class="shortcut-btn" data-action="jump-cp" data-tab="outlets">📍 Edit GPS</button>
                      <button class="shortcut-btn" data-action="jump-cp" data-tab="roles">🛡️ Role &amp; Admin</button>
                    </div>
                  </div>`
                : `<div style="margin-top:16px;background:rgba(255,255,255,0.05);border:1px solid rgba(218,175,118,0.18);border-radius:12px;padding:12px;font-size:11px;color:var(--coffee-200);line-height:1.55;">
                    🔒 <strong style="color:var(--gold-200);">Privasi Akun Anggota:</strong> Halaman ini menampilkan absensi &amp; riwayat pribadi Anda saja.
                  </div>`
            }
          </div>

          <div class="sidebar-bottom">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
              ${Views.renderAvatarHtml(u)}
              <div style="min-width:0;">
                <div style="font-size:13px;font-weight:800;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${esc(u.full_name)}
                </div>
                <div style="font-size:11px;color:var(--coffee-300);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${esc(u.email)}
                </div>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span class="badge ${roleBadgeCls}">${roleLabel}</span>
              <button class="btn btn-outline btn-sm" style="background:transparent;color:var(--coffee-200);border-color:var(--coffee-700);" data-action="logout">
                Keluar
              </button>
            </div>
          </div>
        </aside>

        <!-- AREA UTAMA -->
        <div class="main-area">
          <header class="topbar">
            <div>
              <div style="font-size:14px;font-weight:800;color:var(--coffee-950);">
                ${esc(s.settings.brand_display_name)}
              </div>
              <div style="font-size:11.5px;color:var(--stone-600);">
                ${esc(s.settings.welcome_message)}
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              ${
                canCheckIn
                  ? `<button class="btn btn-emerald btn-sm" data-action="open-camera" data-mode="check_in">📷 Check In</button>`
                  : canCheckOut
                  ? `<button class="btn btn-amber btn-sm" data-action="open-camera" data-mode="check_out">📷 Check Out</button>`
                  : ""
              }
              <button class="btn btn-outline btn-sm" data-action="refresh-data">🔄 Segarkan</button>
              <button class="btn btn-outline btn-sm" data-action="logout">Keluar</button>
            </div>
          </header>

          <main class="page-container">
            ${mainContentHtml}
          </main>
        </div>

        <!-- NAVIGASI BAWAH MOBILE -->
        <nav class="mobile-bottom-nav">
          ${navItems
            .map(
              (item) => `
            <button class="mobile-nav-item ${uiState.activeNav === item.id ? "active" : ""}" data-action="nav" data-target="${item.id}">
              <span style="font-size:16px;">${item.icon}</span>
              <span>${esc(item.label.split(" ")[0])}</span>
              ${item.count ? `<span class="count-pill" style="position:absolute;top:2px;right:4px;">${item.count}</span>` : ""}
            </button>`
            )
            .join("")}
        </nav>
      </div>

      <div id="global-banner-slot">${renderBannerInnerHtml()}</div>
      <div id="modal-root">${renderActiveModalHtml()}</div>
    `;

    if (activeElId) {
      const restored = document.getElementById(activeElId);
      if (restored) {
        restored.focus();
        if (selStart !== null && typeof restored.setSelectionRange === "function") {
          restored.setSelectionRange(selStart, selStart);
        }
      }
    }

    if (uiState.modal && uiState.modal.type === "camera_attendance" && !liveCamera.capturedDataUrl) {
      attachStreamToVideoElement();
    }
  }

  // ==========================================================================
  // 5. EKSPOR CSV LAPORAN (KHUSUS SUPER ADMIN & ADMIN)
  // ==========================================================================
  async function exportFilteredReportToCsv() {
    Core.assertManagerAccess("ExportReportCSV");
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";

    const filtered = s.attendance.filter((r) => {
      if (uiState.reportDateFrom && r.work_date < uiState.reportDateFrom) return false;
      if (uiState.reportDateTo && r.work_date > uiState.reportDateTo) return false;
      if (uiState.reportEmpId !== "all" && r.employee_id !== uiState.reportEmpId) return false;
      if (uiState.reportOutletId !== "all" && r.outlet_id !== uiState.reportOutletId) return false;
      return true;
    });

    const headers = [
      "Tanggal Kerja",
      "Periode Arsip Foto",
      "ID Karyawan",
      "Nama Karyawan",
      "Outlet",
      "Shift",
      "Waktu Check In (Server)",
      "Jarak GPS Check In (m)",
      "Waktu Check Out (Server)",
      "Jarak GPS Check Out (m)",
      "Durasi Kerja (Menit)",
      "Terlambat (Menit)",
      "Status Kehadiran",
      "Catatan Koreksi / Anomali",
    ];

    const csvEscape = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
    const rows = filtered.map((r) => {
      const emp = s.profiles.find((p) => p.id === r.employee_id);
      const out = s.outlets.find((o) => o.id === r.outlet_id);
      const sh = s.shifts.find((x) => x.id === r.shift_id);
      return [
        r.work_date,
        r.archive_folder_label,
        emp ? emp.employee_code : "-",
        emp ? emp.full_name : "-",
        out ? out.name : "-",
        sh ? sh.name : "-",
        Core.formatOperationalDateTime(r.check_in_at, tz),
        r.check_in_distance_meters ?? "-",
        Core.formatOperationalDateTime(r.check_out_at, tz),
        r.check_out_distance_meters ?? "-",
        r.work_duration_minutes || 0,
        r.late_minutes || 0,
        r.attendance_status,
        r.correction_note || r.anomaly_notes || "",
      ]
        .map(csvEscape)
        .join(",");
    });

    const csvContent = "\uFEFF" + [headers.map(csvEscape).join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const todayStr = Core.getTimePartsInTimezone(Core.getServerNow(), tz).dateString;
    const a = document.createElement("a");
    a.href = url;
    a.download = `Laporan-Absensi-Suka-Latte-${todayStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    await Core.logSecurityEvent(
      "EXPORT_REPORT_CSV",
      "attendance",
      `${filtered.length}_rows`,
      `Ekspor laporan CSV sebanyak ${filtered.length} baris.`
    );
    showBanner(true, `Berhasil mengunduh file CSV (${filtered.length} catatan kehadiran).`);
  }

  // ==========================================================================
  // 5.B HANDLER INISIALISASI SUPER ADMIN PERTAMA
  // ==========================================================================
  async function handleCompleteBootstrap() {
    const s = Core.state;
    const form = document.getElementById("form-complete-bootstrap");
    const btn = document.getElementById("btn-submit-bootstrap") || (form ? form.querySelector('button[type="submit"]') : null);

    const codeInput = document.getElementById("bootstrap-employee-code") || (form ? form.querySelector('[name="employee_code"]') : null);
    const phoneInput = document.getElementById("bootstrap-phone") || (form ? form.querySelector('[name="phone"]') : null);

    const employeeCode = (codeInput && codeInput.value ? codeInput.value : "SL-0001").trim();
    const phone = (phoneInput && phoneInput.value ? phoneInput.value : "").trim();

    if (!employeeCode) {
      showBanner(false, "ID Karyawan Super Admin wajib diisi.");
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menetapkan Super Admin &amp; Mengunci Sistem...";
    }

    try {
      if (!s.supabase) {
        throw new Error("Koneksi Supabase belum terhubung. Silakan muat ulang halaman.");
      }

      const { data, error } = await s.supabase.rpc("bootstrap_first_super_admin", {
        p_employee_code: employeeCode,
        p_phone: phone,
      });

      if (error) {
        throw new Error(error.message || "Gagal mengunci Super Admin di database Supabase.");
      }

      await Core.refreshAllData();
      showBanner(
        true,
        "Selamat! Akun Google Anda telah ditetapkan sebagai Super Admin tunggal Suka Latte dan inisialisasi telah dikunci permanen."
      );
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = "🔒 Tetapkan Sebagai Super Admin &amp; Kunci Sistem";
      }
      showBanner(false, err.message || "Gagal memproses inisialisasi Super Admin.");
    }
  }

  // ==========================================================================
  // 5.C HANDLER LENGKAP SEMUA FITUR EDIT SISTEM (TANPA PERLU BUKA VS CODE)
  // ==========================================================================

  // 1. Simpan / Edit Jadwal Shift (Normalisasi Format Jam . dan : otomatis)
  async function handleSaveShift(btn) {
    Core.assertManagerAccess("SaveShift");
    const form = document.getElementById("form-save-shift");
    if (!form) return;

    const fd = new FormData(form);
    const id = String(fd.get("id") || "").trim();
    const name = String(fd.get("name") || "").trim();
    if (!name) {
      showBanner(false, "Nama jadwal shift wajib diisi.");
      return;
    }

    const rawStart = fd.get("start_time");
    const rawEnd = fd.get("end_time");
    const startTime = normalizeTimeInput(rawStart, "07:00");
    const endTime = normalizeTimeInput(rawEnd, "15:00");
    const rawGrace = fd.get("grace_period_minutes");
    const rawEarly = fd.get("early_checkout_threshold_minutes");
    const graceMins = rawGrace === null || rawGrace === "" ? 15 : Math.max(0, parseInt(rawGrace, 10) || 0);
    const earlyMins = rawEarly === null || rawEarly === "" ? 15 : Math.max(0, parseInt(rawEarly, 10) || 0);
    const effectiveFrom = normalizeDateInput(fd.get("effective_from"), new Date().toISOString().slice(0, 10));
    const status = String(fd.get("status") || "active");
    const crossesMidnight = form.querySelector('[name="crosses_midnight"]')?.checked || fd.get("crosses_midnight") === "on";

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Perubahan Shift...";
    }

    try {
      const payload = {
        name,
        start_time: startTime,
        end_time: endTime,
        grace_period_minutes: graceMins,
        early_checkout_threshold_minutes: earlyMins,
        effective_from: effectiveFrom,
        status,
        crosses_midnight: Boolean(crossesMidnight),
        updated_at: new Date().toISOString(),
      };

      const s = Core.state;
      if (id) {
        const { error } = await s.supabase.from("work_shifts").update(payload).eq("id", id);
        if (error) throw error;
        await Core.logSecurityEvent(
          "SHIFT_UPDATED",
          "work_shifts",
          id,
          `Mengedit jadwal shift '${payload.name}' (${payload.start_time.slice(0, 5)}-${payload.end_time.slice(0, 5)}).`
        );
      } else {
        const { error } = await s.supabase.from("work_shifts").insert(payload);
        if (error) throw error;
        await Core.logSecurityEvent(
          "SHIFT_CREATED",
          "work_shifts",
          payload.name,
          `Menambahkan jadwal shift baru '${payload.name}'.`
        );
      }
      uiState.editingShiftId = null;
      await Core.refreshAllData();
      showBanner(true, `Jadwal shift '${payload.name}' (${payload.start_time.slice(0, 5)} – ${payload.end_time.slice(0, 5)}) berhasil disimpan!`);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Perubahan Shift";
      }
      showBanner(false, "Gagal menyimpan jadwal shift: " + (err.message || err));
    }
  }

  // 2. Hapus / Arsipkan Jadwal Shift
  async function handleDeleteShift(btn) {
    Core.assertManagerAccess("DeleteShift");
    const shiftId = btn ? btn.getAttribute("data-id") : null;
    if (!shiftId) return;
    const shift = Core.state.shifts.find((x) => x.id === shiftId);
    if (!shift) return;

    uiState.modal = { type: "confirm_delete", kind: "shift", id: shiftId, name: shift.name };
    render();
  }

  async function executeConfirmedDelete(btn) {
    Core.assertManagerAccess("ExecuteConfirmedDelete");
    if (!uiState.modal || uiState.modal.type !== "confirm_delete") return;
    const { kind, id, name } = uiState.modal;
    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Memproses...";
    }
    try {
      if (kind === "shift") {
        const { error } = await Core.state.supabase.from("work_shifts").delete().eq("id", id);
        if (error) {
          await Core.state.supabase.from("work_shifts").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
          await Core.logSecurityEvent("SHIFT_ARCHIVED", "work_shifts", id, `Shift '${name}' diarsipkan karena memiliki data riwayat absensi.`);
          showBanner(true, `Shift '${name}' dialihkan ke status Diarsipkan agar data riwayat absensi tetap aman.`);
        } else {
          await Core.logSecurityEvent("SHIFT_DELETED", "work_shifts", id, `Menghapus shift '${name}'.`);
          showBanner(true, `Shift '${name}' berhasil dihapus.`);
        }
        if (uiState.editingShiftId === id) uiState.editingShiftId = null;
      } else if (kind === "outlet") {
        const { error } = await Core.state.supabase.from("outlets").delete().eq("id", id);
        if (error) {
          await Core.state.supabase.from("outlets").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
          showBanner(true, `Outlet '${name}' dialihkan ke status Diarsipkan agar data riwayat absensi tetap aman.`);
        } else {
          await Core.logSecurityEvent("OUTLET_DELETED", "outlets", id, `Menghapus outlet '${name}'.`);
          showBanner(true, `Outlet '${name}' berhasil dihapus.`);
        }
        if (uiState.editingOutletId === id) uiState.editingOutletId = null;
      } else if (kind === "employee") {
        const reasonInput = document.getElementById("confirm-delete-reason");
        const reason = reasonInput ? reasonInput.value : uiState.modal.reason || "Karyawan resign";
        const res = await Core.deleteEmployeeAccount(id, reason);
        uiState.modal = null;
        render();
        showBanner(
          true,
          res.mode === "hard_deleted"
            ? `Member '${name}' berhasil dihapus permanen dari sistem.`
            : `Member '${name}' telah dikeluarkan dari daftar karyawan aktif & akses loginnya diblokir (Resign).`
        );
        return;
      }
      uiState.modal = null;
      await Core.refreshAllData();
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "Ya, Proses Sekarang";
      }
      showBanner(false, "Gagal memproses penghapusan: " + (err.message || err));
    }
  }

  // 3. Simpan / Edit Outlet & Radius Geofence GPS
  function updateOutletRadarLive(lat, lng) {
    const latNum = parseFloat(String(lat || "").replace(",", "."));
    const lngNum = parseFloat(String(lng || "").replace(",", "."));
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) return;

    const coordLabel = document.getElementById("radar-outlet-coords-label");
    if (coordLabel) coordLabel.textContent = `Titik Outlet: ${latNum.toFixed(6)}, ${lngNum.toFixed(6)}`;

    const gmapsLink = document.getElementById("radar-google-maps-link");
    if (gmapsLink) gmapsLink.href = `https://maps.google.com/?q=${latNum},${lngNum}`;

    const btnGmaps = document.getElementById("btn-open-gmaps-link");
    if (btnGmaps) btnGmaps.href = `https://maps.google.com/?q=${latNum},${lngNum}`;
  }

  function showOutletHelperToast(msg, isSuccess = true) {
    const toast = document.getElementById("outlet-helper-toast");
    if (!toast) return;
    toast.style.display = "block";
    toast.style.background = isSuccess ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)";
    toast.style.border = `1px solid ${isSuccess ? "rgba(16, 185, 129, 0.4)" : "rgba(239, 68, 68, 0.4)"}`;
    toast.style.color = isSuccess ? "#065F46" : "#991B1B";
    toast.style.fontWeight = "600";
    toast.innerHTML = msg;
  }

  async function handleSaveOutlet(btn) {
    Core.assertManagerAccess("SaveOutlet");
    const form = document.getElementById("form-save-outlet");
    if (!form) return;

    const fd = new FormData(form);
    let id = String(fd.get("id") || "").trim();
    const name = String(fd.get("name") || "").trim();
    const address = String(fd.get("address") || "").trim();
    const latStr = String(fd.get("latitude") || "").replace(",", ".");
    const lngStr = String(fd.get("longitude") || "").replace(",", ".");
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (!name) {
      showBanner(false, "Nama outlet wajib diisi.");
      return;
    }
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      showBanner(false, "Koordinat Latitude dan Longitude harus berupa angka desimal valid (contoh: -8.524600, 115.274100).");
      return;
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      showBanner(false, "Rentang koordinat tidak valid (-90 s/d 90 untuk Latitude, -180 s/d 180 untuk Longitude).");
      return;
    }

    const radius = Math.max(10, parseInt(fd.get("geofence_radius_meters") || "150", 10) || 150);
    const minAcc = Math.max(5, parseInt(fd.get("minimum_gps_accuracy_meters") || "100", 10) || 100);
    const timezone = String(fd.get("timezone") || "Asia/Makassar");
    const status = String(fd.get("status") || "active");

    const s = Core.state;
    // Jika ID belum terisi tapi outlet sudah ada di database, gunakan ID outlet aktif pertama
    if (!id && s.outlets && s.outlets.length > 0 && uiState.editingOutletId !== "new") {
      id = s.outlets[0].id;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Perubahan Outlet...";
    }

    try {
      const payload = {
        name,
        address,
        latitude: lat,
        longitude: lng,
        geofence_radius_meters: radius,
        minimum_gps_accuracy_meters: minAcc,
        timezone,
        status,
        updated_at: new Date().toISOString(),
      };

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Koneksi ke Supabase timeout setelah 12 detik. Periksa koneksi internet Anda.")), 12000)
      );

      if (id) {
        const updateCall = s.supabase.from("outlets").update(payload).eq("id", id);
        const { error } = await Promise.race([updateCall, timeoutPromise]);
        if (error) throw error;

        // Perbarui cache state lokal secara instan
        const existingIdx = s.outlets.findIndex((o) => o.id === id);
        if (existingIdx !== -1) {
          s.outlets[existingIdx] = { ...s.outlets[existingIdx], ...payload };
        } else {
          s.outlets.push({ id, ...payload });
        }
        uiState.editingOutletId = id;

        Core.logSecurityEvent(
          "OUTLET_GEOFENCE_UPDATED",
          "outlets",
          id,
          `Mengedit outlet '${payload.name}' (${lat}, ${lng} • radius ${payload.geofence_radius_meters}m).`
        ).catch(() => {});
      } else {
        const insertCall = s.supabase.from("outlets").insert(payload).select().single();
        const { data: created, error } = await Promise.race([insertCall, timeoutPromise]);
        if (error) throw error;

        const newOutlet = created || { id: "out-" + Date.now(), ...payload };
        s.outlets.push(newOutlet);
        uiState.editingOutletId = newOutlet.id;

        Core.logSecurityEvent(
          "OUTLET_CREATED",
          "outlets",
          newOutlet.id || payload.name,
          `Menambahkan outlet baru '${payload.name}'.`
        ).catch(() => {});
      }

      showBanner(true, `Pengaturan outlet '${payload.name}' & titik koordinat GPS fisik (${lat}, ${lng} • radius ${radius}m) berhasil disimpan!`);

      // Sinkronisasi background tanpa mengunci UI
      try {
        await Promise.race([Core.refreshAllData(), timeoutPromise]);
      } catch (bgErr) {
        console.warn("Background refreshAllData notice:", bgErr);
      }
    } catch (err) {
      showBanner(false, "Gagal menyimpan outlet: " + (err.message || err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Perubahan Outlet & Radius GPS";
      }
    }
  }

  // 4. Hapus / Arsipkan Outlet
  async function handleDeleteOutlet(btn) {
    Core.assertManagerAccess("DeleteOutlet");
    const outletId = btn ? btn.getAttribute("data-id") : null;
    if (!outletId) return;
    const out = Core.state.outlets.find((o) => o.id === outletId);
    if (!out) return;

    if (Core.state.outlets.filter((o) => o.status === "active").length <= 1 && out.status === "active") {
      showBanner(false, "Sistem minimal harus memiliki satu outlet aktif untuk operasional.");
      return;
    }

    uiState.modal = { type: "confirm_delete", kind: "outlet", id: outletId, name: out.name };
    render();
  }

  // 5. Simpan Seluruh Aturan Absensi & Zona Waktu WITA
  async function handleSaveRules(btn) {
    Core.assertManagerAccess("SaveAttendanceRules");
    const form = document.getElementById("form-save-rules");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;

    const newSettings = {
      ...s.settings,
      require_selfie_photo: form.querySelector('[name="require_selfie_photo"]')?.checked ?? true,
      require_gps_validation: form.querySelector('[name="require_gps_validation"]')?.checked ?? true,
      strict_geofence_enforcement: form.querySelector('[name="strict_geofence_enforcement"]')?.checked ?? true,
      operational_timezone: String(fd.get("operational_timezone") || "Asia/Makassar"),
      clock_skew_warning_threshold_seconds: Math.max(30, parseInt(fd.get("clock_skew_warning_threshold_seconds") || "120", 10) || 120),
      allow_member_request_corrections: form.querySelector('[name="allow_member_request_corrections"]')?.checked ?? true,
      allow_member_request_leaves: form.querySelector('[name="allow_member_request_leaves"]')?.checked ?? true,
    };

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Aturan Absensi...";
    }

    try {
      const { error } = await s.supabase.from("system_settings").upsert({
        key: "operational_config",
        value: newSettings,
        updated_by: s.currentUser.id,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await Core.logSecurityEvent(
        "ATTENDANCE_RULES_UPDATED",
        "system_settings",
        "operational_config",
        `Memperbarui aturan absensi & zona waktu (${newSettings.operational_timezone}).`
      );
      await Core.refreshAllData();
      showBanner(true, "Seluruh aturan transaksi absensi & zona waktu WITA berhasil diperbarui!");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Seluruh Aturan Absensi";
      }
      showBanner(false, "Gagal menyimpan aturan: " + (err.message || err));
    }
  }

  // 6. Simpan / Edit Kalender Kerja, Libur & Izin
  async function handleSaveCalendar(btn) {
    Core.assertManagerAccess("SaveCalendar");
    const form = document.getElementById("form-save-calendar");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const id = String(fd.get("id") || "").trim();
    const empId = String(fd.get("employee_id") || "").trim();
    const title = String(fd.get("title") || "").trim();
    const reason = String(fd.get("reason") || "").trim();
    const dateStart = normalizeDateInput(fd.get("date_start"));
    const dateEnd = normalizeDateInput(fd.get("date_end"));

    if (!title) {
      showBanner(false, "Judul keterangan kalender wajib diisi.");
      return;
    }
    if (!reason) {
      showBanner(false, "Alasan / catatan keterangan wajib diisi.");
      return;
    }

    const payload = {
      employee_id: empId || null,
      type: String(fd.get("type") || "holiday"),
      title,
      date_start: dateStart,
      date_end: dateEnd,
      reason,
      status: "approved",
      approved_by: s.currentUser.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan ke Kalender...";
    }

    try {
      if (id) {
        const { error } = await s.supabase.from("holidays_and_leaves").update(payload).eq("id", id);
        if (error) throw error;
        await Core.logSecurityEvent("CALENDAR_UPDATED", "holidays_and_leaves", id, `Mengedit jadwal kalender '${payload.title}'.`);
      } else {
        const { error } = await s.supabase.from("holidays_and_leaves").insert(payload);
        if (error) throw error;
        await Core.logSecurityEvent("CALENDAR_CREATED", "holidays_and_leaves", payload.title, `Menambahkan jadwal kalender '${payload.title}'.`);
      }
      uiState.editingCalendarId = null;
      await Core.refreshAllData();
      showBanner(true, `Entri kalender '${payload.title}' berhasil disimpan!`);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan ke Kalender";
      }
      showBanner(false, "Gagal menyimpan kalender: " + (err.message || err));
    }
  }

  // 7. Simpan Branding & Tampilan Aplikasi
  async function handleSaveBranding(btn) {
    Core.assertManagerAccess("SaveBranding");
    const form = document.getElementById("form-save-branding");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;

    const newSettings = {
      ...s.settings,
      brand_display_name: String(fd.get("brand_display_name") || "").trim(),
      brand_subtitle: String(fd.get("brand_subtitle") || "").trim(),
      brand_tagline: String(fd.get("brand_tagline") || "").trim(),
      welcome_message: String(fd.get("welcome_message") || "").trim(),
      theme_preset: String(fd.get("theme_preset") || "classic_latte"),
    };

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Branding...";
    }

    try {
      const { error } = await s.supabase.from("system_settings").upsert({
        key: "operational_config",
        value: newSettings,
        updated_by: s.currentUser.id,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await Core.logSecurityEvent(
        "BRANDING_UPDATED",
        "system_settings",
        "operational_config",
        `Memperbarui identitas tampilan & tema (${newSettings.theme_preset}).`
      );
      await Core.refreshAllData();
      showBanner(true, "Tampilan branding & tema Suka Latte berhasil disimpan langsung!");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Perubahan Branding";
      }
      showBanner(false, "Gagal menyimpan branding: " + (err.message || err));
    }
  }

  // 8. Simpan Kebijakan Keamanan & Retensi Arsip Foto Bulanan
  async function handleSaveSecurity(btn) {
    Core.assertSuperAdminAccess("SaveSecurityPolicy");
    const form = document.getElementById("form-save-security");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;

    const newSettings = {
      ...s.settings,
      photo_retention_policy_months: parseInt(fd.get("photo_retention_policy_months") || "0", 10) || 0,
      session_timeout_minutes: Math.max(15, parseInt(fd.get("session_timeout_minutes") || "120", 10) || 120),
    };

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Kebijakan Keamanan...";
    }

    try {
      const { error } = await s.supabase.from("system_settings").upsert({
        key: "operational_config",
        value: newSettings,
        updated_by: s.currentUser.id,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      await Core.logSecurityEvent(
        "SECURITY_POLICY_UPDATED",
        "system_settings",
        "operational_config",
        `Memperbarui retensi arsip foto (${newSettings.photo_retention_policy_months} bulan) & timeout sesi.`
      );
      await Core.refreshAllData();
      showBanner(true, "Kebijakan keamanan & retensi arsip bulanan berhasil diperbarui!");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Kebijakan Keamanan";
      }
      showBanner(false, "Gagal menyimpan kebijakan keamanan: " + (err.message || err));
    }
  }

  // 9. Pra-Setujui Email Google Karyawan
  async function handlePreapproveEmail(btn) {
    Core.assertManagerAccess("PreapproveEmployeeEmail");
    const form = document.getElementById("form-preapprove-email");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const empCode = String(fd.get("employee_code") || "").trim().toUpperCase();
    const fullName = String(fd.get("full_name") || "").trim();
    const pos = String(fd.get("position_title") || "Barista / Crew").trim();
    const phone = String(fd.get("phone") || "").trim();

    if (!email || !empCode || !fullName) {
      showBanner(false, "Alamat email Google, ID Karyawan, dan Nama Lengkap wajib diisi.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Pra-Persetujuan...";
    }

    try {
      const { error } = await s.supabase.from("preapproved_emails").insert({
        email,
        employee_code: empCode,
        full_name: fullName,
        phone,
        position_title: pos,
        outlet_id: fd.get("outlet_id") || null,
        shift_id: fd.get("shift_id") || null,
        created_by: s.currentUser.id,
      });
      if (error) throw error;
      await Core.logSecurityEvent(
        "PREAPPROVED_EMAIL_ADDED",
        "preapproved_emails",
        email,
        `Menambahkan pra-persetujuan login Google untuk ${fullName} (${email}).`
      );
      form.reset();
      await Core.refreshAllData();
      showBanner(
        true,
        `Email ${email} berhasil dipra-setujui! Saat ia login Google pertama kali, akunnya langsung aktif otomatis.`
      );
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "+ Simpan ke Daftar Pra-Persetujuan";
      }
      showBanner(false, "Gagal menyimpan pra-persetujuan: " + (err.message || err));
    }
  }

  // 10. Setujui Login Pertama Akun Google Karyawan
  async function handleApproveFirstLogin(btn) {
    Core.assertManagerAccess("ApproveGoogleFirstLogin");
    const form = btn ? btn.closest(".form-approve-first-login") : null;
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const targetUserId = form.getAttribute("data-userid");
    const empCode = String(fd.get("employee_code") || "").trim();
    const posTitle = String(fd.get("position_title") || "Barista / Crew").trim();
    const outletId = fd.get("outlet_id") || null;
    const shiftId = fd.get("shift_id") || null;

    if (!empCode) {
      showBanner(false, "ID Karyawan wajib ditentukan.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyetujui Akun...";
    }

    try {
      const { error } = await s.supabase.rpc("review_google_first_login", {
        p_target_user_id: targetUserId,
        p_decision: "approve",
        p_employee_code: empCode,
        p_position_title: posTitle,
        p_outlet_id: outletId,
        p_shift_id: shiftId,
        p_note: "Disetujui oleh Pengelola",
      });
      if (error) throw error;
      await Core.refreshAllData();
      showBanner(
        true,
        "Login pertama karyawan berhasil disetujui! Akun Google tersebut sekarang akan langsung masuk otomatis setiap kali login."
      );
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "✓ Setujui Login Pertama &amp; Aktifkan";
      }
      showBanner(false, "Gagal menyetujui akun: " + (err.message || err));
    }
  }

  // 11. Tolak Permintaan Login Pertama Akun Google
  async function handleRejectFirstLogin(btn) {
    Core.assertManagerAccess("RejectGoogleFirstLogin");
    const form = document.getElementById("form-reject-first-login");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const targetId = String(fd.get("target_user_id"));
    const note = String(fd.get("note") || "").trim();
    if (!note) {
      showBanner(false, "Alasan penolakan wajib diisi untuk Audit Log.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Memproses...";
    }

    try {
      const { error } = await s.supabase.rpc("review_google_first_login", {
        p_target_user_id: targetId,
        p_decision: "reject",
        p_note: note,
      });
      if (error) throw error;
      uiState.modal = null;
      await Core.refreshAllData();
      showBanner(true, "Permintaan login pertama telah ditolak.");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "Konfirmasi Tolak Akses";
      }
      showBanner(false, "Gagal menolak akun: " + (err.message || err));
    }
  }

  // 12. Edit Penuh Profil & Penugasan Karyawan
  async function handleEditEmployee(btn) {
    Core.assertManagerAccess("SubmitEditEmployee");
    const form = document.getElementById("form-edit-employee");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const targetId = String(fd.get("target_user_id"));
    const targetEmp = s.profiles.find((p) => p.id === targetId);
    const statusVal = targetEmp && targetEmp.role === "super_admin" ? "active" : String(fd.get("status") || "active");
    const empCode = String(fd.get("employee_code") || "").trim();
    const fullName = String(fd.get("full_name") || "").trim();
    const posTitle = String(fd.get("position_title") || "").trim();
    const phone = String(fd.get("phone") || "").trim();

    if (!empCode || !fullName) {
      showBanner(false, "ID Karyawan dan Nama Lengkap wajib diisi.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Profil...";
    }

    try {
      const { error } = await s.supabase.rpc("update_employee_by_manager", {
        p_target_user_id: targetId,
        p_employee_code: empCode,
        p_full_name: fullName,
        p_phone: phone,
        p_position_title: posTitle,
        p_outlet_id: fd.get("outlet_id") || null,
        p_shift_id: fd.get("shift_id") || null,
        p_status: statusVal,
      });
      if (error) throw error;
      uiState.modal = null;
      await Core.refreshAllData();
      showBanner(true, `Data profil ${fullName} berhasil diperbarui!`);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Perubahan Profil";
      }
      showBanner(false, "Gagal mengedit profil karyawan: " + (err.message || err));
    }
  }

  // 13. Promosi / Demosi Role Instan oleh Super Admin
  async function executeRoleChangeFast(targetId, newRole, reason, btn, fallbackLabel) {
    Core.assertSuperAdminAccess("ExecuteRoleChangeFast");
    const cleanReason =
      String(reason || "").trim() ||
      (newRole === "admin"
        ? "Dipromosikan menjadi Admin operasional oleh Super Admin."
        : "Diturunkan menjadi Anggota oleh Super Admin.");

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = newRole === "admin" ? "⏳ Mengangkat Admin..." : "⏳ Memproses...";
    }

    try {
      const updated = await Core.changeEmployeeRoleFast(targetId, newRole, cleanReason);
      uiState.modal = null;
      render();
      const targetName = updated?.full_name || "Karyawan";
      const roleWord = newRole === "admin" ? "ADMIN" : "ANGGOTA";
      showBanner(true, `Berhasil! ${targetName} sekarang berstatus ${roleWord}.`);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || fallbackLabel || "Simpan";
      }
      showBanner(false, "Gagal mengubah role: " + (err.message || err));
    }
  }

  async function handleChangeRole(btn) {
    Core.assertSuperAdminAccess("SubmitChangeRole");
    const form = document.getElementById("form-change-role");
    if (!form) return;

    const fd = new FormData(form);
    const targetId = String(fd.get("target_user_id"));
    const newRole = String(fd.get("new_role"));
    const reason = String(fd.get("reason") || "").trim();
    await executeRoleChangeFast(targetId, newRole, reason, btn, "Simpan Perubahan Role");
  }

  // 14. Edit Administratif Catatan Kehadiran oleh Pengelola
  async function handleAdminEditAttendance(btn) {
    Core.assertManagerAccess("SubmitAdminEditAttendance");
    const form = document.getElementById("form-admin-edit-att");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const checkInIso = localInputToIso(fd.get("check_in_local"), tz);
    const checkOutIso = localInputToIso(fd.get("check_out_local"), tz);
    const reason = String(fd.get("reason") || "").trim();

    if (!reason) {
      showBanner(false, "Alasan pengeditan catatan kehadiran wajib diisi untuk Audit Log.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Perubahan Kehadiran...";
    }

    try {
      const shiftIdVal = String(fd.get("shift_id") || "").trim() || null;
      const { error } = await s.supabase.rpc("admin_direct_edit_attendance_v2", {
        p_attendance_id: String(fd.get("attendance_id")),
        p_check_in_at: checkInIso,
        p_check_out_at: checkOutIso,
        p_status: String(fd.get("status")),
        p_reason: reason,
        p_shift_id: shiftIdVal,
      });
      if (error) throw error;
      uiState.modal = null;
      await Core.refreshAllData();
      showBanner(true, "Catatan kehadiran berhasil diperbarui (bukti foto selfie asli tetap utuh di cloud)!");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Koreksi Kehadiran";
      }
      showBanner(false, "Gagal mengedit kehadiran: " + (err.message || err));
    }
  }

  // 15. Tinjau Permintaan Koreksi Absensi Anggota
  async function handleReviewCorrection(btn) {
    Core.assertManagerAccess("SubmitReviewCorrection");
    const form = document.getElementById("form-review-corr");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan Keputusan...";
    }

    try {
      const { error } = await s.supabase.rpc("process_attendance_correction", {
        p_correction_id: String(fd.get("correction_id")),
        p_decision: String(fd.get("decision")),
        p_review_note: String(fd.get("review_note") || "").trim(),
      });
      if (error) throw error;
      uiState.modal = null;
      await Core.refreshAllData();
      showBanner(true, "Keputusan peninjauan koreksi absensi berhasil disimpan.");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "Konfirmasi";
      }
      showBanner(false, "Gagal memproses koreksi: " + (err.message || err));
    }
  }

  // 16. Pengajuan Koreksi Absensi Pribadi oleh Anggota (Terkunci kecuali diaktifkan pengelola)
  async function handleMemberCorrection(btn) {
    if (!Core.isManager() && !Core.state.settings.allow_member_request_corrections) {
      Core.assertManagerAccess("SubmitMemberCorrection");
    }
    const form = document.getElementById("form-member-corr");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const attId = String(fd.get("attendance_id"));
    const rec = s.attendance.find((a) => a.id === attId && a.employee_id === s.currentUser.id);
    if (!rec) {
      showBanner(false, "Catatan kehadiran tidak ditemukan.");
      return;
    }

    const propIn = localInputToIso(fd.get("check_in_local"), tz);
    const propOut = localInputToIso(fd.get("check_out_local"), tz);
    const reason = String(fd.get("reason") || "").trim();

    if (!reason) {
      showBanner(false, "Alasan pengajuan koreksi wajib diisi.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Mengirim Pengajuan...";
    }

    try {
      const { error } = await s.supabase.from("attendance_corrections").insert({
        attendance_id: rec.id,
        requested_by: s.currentUser.id,
        employee_id: s.currentUser.id,
        work_date: rec.work_date,
        reason,
        supporting_note: "Diajukan mandiri oleh Anggota",
        original_values: {
          check_in_at: rec.check_in_at,
          check_out_at: rec.check_out_at,
          attendance_status: rec.attendance_status,
        },
        proposed_values: {
          check_in_at: propIn,
          check_out_at: propOut,
          attendance_status: "selesai",
        },
      });
      if (error) throw error;
      await Core.logSecurityEvent(
        "MEMBER_REQUESTED_CORRECTION",
        "attendance_corrections",
        rec.id,
        `Anggota mengajukan koreksi absensi tanggal ${rec.work_date}.`
      );
      uiState.modal = null;
      await Core.refreshAllData();
      showBanner(true, "Pengajuan koreksi berhasil dikirim dan menunggu persetujuan Admin.");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "Kirim Pengajuan ke Admin";
      }
      showBanner(false, "Gagal mengirim pengajuan koreksi: " + (err.message || err));
    }
  }

  // 17. Pengajuan Izin / Sakit / Cuti Pribadi oleh Anggota (Terkunci kecuali diaktifkan pengelola)
  async function handleMemberLeave(btn) {
    if (!Core.isManager() && !Core.state.settings.allow_member_request_leaves) {
      Core.assertManagerAccess("SubmitMemberLeave");
    }
    const form = document.getElementById("form-member-leave");
    if (!form) return;

    const fd = new FormData(form);
    const s = Core.state;
    const title = String(fd.get("title") || "").trim();
    const reason = String(fd.get("reason") || "").trim();
    const dateStart = normalizeDateInput(fd.get("date_start"));
    const dateEnd = normalizeDateInput(fd.get("date_end"));

    if (!title || !reason) {
      showBanner(false, "Judul dan keterangan pengajuan wajib diisi.");
      return;
    }

    if (dateEnd < dateStart) {
      showBanner(false, "Tanggal selesai tidak boleh lebih awal dari tanggal mulai.");
      return;
    }

    const payload = {
      employee_id: s.currentUser.id,
      type: String(fd.get("type") || "izin"),
      title,
      date_start: dateStart,
      date_end: dateEnd,
      reason,
      status: "pending",
    };

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Mengirim Pengajuan...";
    }

    try {
      const { error } = await s.supabase.from("holidays_and_leaves").insert(payload);
      if (error) throw error;
      await Core.logSecurityEvent(
        "MEMBER_REQUESTED_LEAVE",
        "holidays_and_leaves",
        payload.type,
        `Anggota mengajukan ${payload.type}: ${payload.title} (${payload.date_start} s/d ${payload.date_end}).`
      );
      uiState.modal = null;
      await Core.refreshAllData();
      showBanner(true, "Pengajuan izin/sakit/cuti berhasil dikirim ke Admin.");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "Kirim Pengajuan";
      }
      showBanner(false, "Gagal mengirim pengajuan izin: " + (err.message || err));
    }
  }

  // 18. Simpan Konfigurasi Koneksi Cloud Supabase
  async function handleCloudConnect(btn) {
    const form = document.getElementById("form-cloud-connect");
    if (!form) return;

    const fd = new FormData(form);
    const res = Core.saveCloudCredentials(
      fd.get("supabase_url"),
      fd.get("supabase_anon_key")
    );
    if (!res.ok) {
      showBanner(false, res.message);
      return;
    }
    uiState.banner = { ok: true, message: res.message };
    await Core.initializeApp(render);
  }

  // ==========================================================================
  // 6. PENANGANAN KLIK TOMBOL (EVENT DELEGATION DENGAN PROTEKSI HAK AKSES)
  // ==========================================================================
  document.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.getAttribute("data-action");

    try {
      if (action === "submit-bootstrap") {
        await handleCompleteBootstrap();
        return;
      }

      if (action === "submit-save-shift") {
        await handleSaveShift(btn);
        return;
      }

      if (action === "delete-shift") {
        await handleDeleteShift(btn);
        return;
      }

      if (action === "submit-save-outlet") {
        await handleSaveOutlet(btn);
        return;
      }

      if (action === "delete-outlet") {
        await handleDeleteOutlet(btn);
        return;
      }

      if (action === "submit-save-rules") {
        await handleSaveRules(btn);
        return;
      }

      if (action === "submit-save-calendar") {
        await handleSaveCalendar(btn);
        return;
      }

      if (action === "submit-save-branding") {
        await handleSaveBranding(btn);
        return;
      }

      if (action === "submit-save-security") {
        await handleSaveSecurity(btn);
        return;
      }

      if (action === "submit-preapprove-email") {
        await handlePreapproveEmail(btn);
        return;
      }

      if (action === "submit-approve-first-login") {
        await handleApproveFirstLogin(btn);
        return;
      }

      if (action === "submit-reject-first-login") {
        await handleRejectFirstLogin(btn);
        return;
      }

      if (action === "submit-edit-employee") {
        await handleEditEmployee(btn);
        return;
      }

      if (action === "submit-admin-edit-att") {
        await handleAdminEditAttendance(btn);
        return;
      }

      if (action === "submit-change-role") {
        await handleChangeRole(btn);
        return;
      }

      if (action === "submit-review-corr") {
        await handleReviewCorrection(btn);
        return;
      }

      if (action === "submit-member-corr") {
        await handleMemberCorrection(btn);
        return;
      }

      if (action === "submit-member-leave") {
        await handleMemberLeave(btn);
        return;
      }

      if (action === "submit-cloud-connect") {
        await handleCloudConnect(btn);
        return;
      }

      if (action === "dismiss-banner") {
        uiState.banner = null;
        if (!syncBannerDomInPlace()) {
          render();
        }
        return;
      }

      if (action === "confirm-delete-item") {
        await executeConfirmedDelete(btn);
        return;
      }

      if (action === "select-my-shift") {
        const shiftId = btn.getAttribute("data-shift-id");
        if (!shiftId) return;
        const shiftObj = Core.state.shifts.find((sh) => sh.id === shiftId);
        btn.disabled = true;
        try {
          await Core.selectMyActiveShift(shiftId);
          showBanner(
            true,
            `Shift aktif Anda diatur ke ${shiftObj ? shiftObj.name : "Shift Pilihan"} (Terlambat otomatis > ${Number(shiftObj?.grace_period_minutes ?? 15)} menit).`,
            5000
          );
        } catch (err) {
          btn.disabled = false;
          showBanner(false, "Gagal mengubah shift: " + (err.message || err));
        }
        return;
      }

      if (action === "retry-connection") {
        await Core.initializeApp(render);
        return;
      }

      if (action === "reset-cloud-config") {
        if (Core.state.bootstrapCompleted && Core.state.session && !Core.isSuperAdmin()) {
          Core.assertSuperAdminAccess("ResetCloudConfig");
        }
        Core.clearCloudCredentials();
        showBanner(true, "Konfigurasi koneksi server direset. Silakan masukkan URL & Anon Key Supabase baru.");
        return;
      }

      if (action === "google-login") {
        await Core.signInWithGoogle();
        return;
      }

      if (action === "logout") {
        stopCameraStream();
        stopGpsWatcher();
        uiState.modal = null;
        await Core.signOut();
        return;
      }

      if (action === "check-approval-status") {
        await Core.refreshAllData();
        if (Core.isApprovedUser()) {
          showBanner(true, "Akun Google Anda telah disetujui Admin! Selamat bertugas.");
        } else {
          showBanner(false, "Status akun Anda masih menunggu persetujuan Admin / Super Admin.");
        }
        return;
      }

      if (action === "refresh-data") {
        await Core.refreshAllData();
        showBanner(true, "Data terbaru berhasil disinkronkan dari server.");
        return;
      }

      if (action === "nav") {
        const target = btn.getAttribute("data-target");
        const managerViews = ["dashboard", "archive", "reports", "control_panel"];
        if (managerViews.includes(target)) {
          Core.assertManagerAccess(`Nav:${target}`);
        }
        uiState.activeNav = target;
        render();
        return;
      }

      if (action === "jump-cp") {
        Core.assertManagerAccess("JumpControlPanel");
        uiState.activeNav = "control_panel";
        uiState.activeControlTab = btn.getAttribute("data-tab") || "employees";
        render();
        return;
      }

      if (action === "cp-tab") {
        Core.assertManagerAccess("SwitchControlPanelTab");
        uiState.activeControlTab = btn.getAttribute("data-tab") || "employees";
        render();
        return;
      }

      if (action === "open-camera") {
        const mode = btn.getAttribute("data-mode") || "check_in";
        await openAttendanceCameraModal(mode);
        return;
      }

      if (action === "close-modal") {
        stopCameraStream();
        stopGpsWatcher();
        uiState.modal = null;
        render();
        return;
      }

      if (action === "capture-selfie") {
        captureFreshSelfieFrame();
        return;
      }

      if (action === "retake-selfie") {
        liveCamera.capturedDataUrl = null;
        liveCamera.submitError = null;
        liveCamera.videoReady = false;
        renderModalContainerOnly();
        await startLiveFrontCamera();
        return;
      }

      if (action === "refresh-gps") {
        requestRealDeviceGps();
        return;
      }

      if (action === "submit-attendance") {
        if (liveCamera.submitting) return;
        const focusCameraErrorBox = () => {
          const errEl = document.getElementById("camera-modal-error-box");
          if (errEl && typeof errEl.scrollIntoView === "function") {
            errEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
        };
        if (Core.state.settings.require_selfie_photo && !liveCamera.capturedDataUrl) {
          liveCamera.submitError =
            "Langkah 1 belum selesai: tekan tombol '📸 Ambil Foto Selfie Sekarang' terlebih dahulu hingga foto wajah tampil, lalu tekan Kirim Bukti.";
          if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
          showBanner(false, liveCamera.submitError);
          focusCameraErrorBox();
          document.getElementById("btn-capture-selfie")?.focus();
          return;
        }
        if (Core.state.settings.require_gps_validation && !liveCamera.gps) {
          liveCamera.submitError = liveCamera.gpsLoading
            ? "Koordinat GPS masih sedang diambil (tunggu sebentar hingga muncul Lat/Lng), lalu tekan Kirim Bukti kembali."
            : liveCamera.gpsError ||
              "Koordinat GPS belum tersedia. Pastikan izin Lokasi (GPS) aktif di Safari/browser Anda, sistem mencoba mengambil GPS ulang...";
          if (!liveCamera.gpsLoading) {
            requestRealDeviceGps();
          }
          if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
          showBanner(false, liveCamera.submitError);
          focusCameraErrorBox();
          return;
        }

        const chosenShiftId = liveCamera.shiftId || getSelectedAttendanceShift()?.id || null;
        liveCamera.submitError = null;
        liveCamera.submitting = true;
        if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
        try {
          const res = await Core.uploadPrivateSelfieAndSubmit(
            liveCamera.mode,
            liveCamera.capturedDataUrl,
            liveCamera.gps ? liveCamera.gps.lat : null,
            liveCamera.gps ? liveCamera.gps.lng : null,
            liveCamera.gps ? liveCamera.gps.accuracy : null,
            chosenShiftId
          );
          stopCameraStream();
          stopGpsWatcher();
          uiState.modal = null;
          render();
          const matchedShift = Core.state.shifts.find((sh) => sh.id === (res?.shift_id || chosenShiftId));
          const shiftLabel = res?.shift_name || matchedShift?.name || "Shift";
          if (liveCamera.mode === "check_in") {
            const lateMins = Number(res?.late_minutes || 0);
            const statusText = lateMins > 0 ? `Terlambat ${lateMins} menit` : "Hadir Tepat Waktu";
            showBanner(
              true,
              `Check In berhasil! Output: ${shiftLabel} • Status: ${statusText} (Waktu Server WITA).`,
              9500
            );
          } else {
            const statusLabel = res?.status_label || "Selesai (Lengkap)";
            const durText = Core.formatDurationMinutes(res?.duration_minutes || 0);
            showBanner(
              true,
              `Check Out berhasil! ${shiftLabel} • Status: ${statusLabel} • Durasi Kerja: ${durText}.`,
              9500
            );
          }
        } catch (err) {
          liveCamera.submitting = false;
          liveCamera.submitError = err.message || "Gagal memproses absensi di server.";
          if (!updateCameraModalPanelsInPlace()) renderModalContainerOnly();
          showBanner(false, liveCamera.submitError, 9000);
          focusCameraErrorBox();
        }
        return;
      }

      if (action === "inspect-record") {
        const recordId = btn.getAttribute("data-id");
        const rec = Core.state.attendance.find((a) => a.id === recordId);
        if (!rec) return;
        if (Core.isMemberOnly() && rec.employee_id !== Core.state.currentUser.id) {
          Core.assertManagerAccess("InspectOtherEmployeeRecord");
        }
        await Core.ensureSignedUrlsForAttendance([rec]);
        uiState.modal = { type: "inspect_record", recordId };
        render();
        return;
      }

      if (action === "open-member-corr") {
        if (!Core.isManager() && !Core.state.settings.allow_member_request_corrections) {
          Core.assertManagerAccess("OpenMemberCorrection");
        }
        const recordId = btn.getAttribute("data-id");
        uiState.modal = { type: "member_corr", recordId };
        render();
        return;
      }

      if (action === "open-member-leave") {
        if (!Core.isManager() && !Core.state.settings.allow_member_request_leaves) {
          Core.assertManagerAccess("OpenMemberLeave");
        }
        uiState.modal = { type: "member_leave" };
        render();
        return;
      }

      if (action === "open-admin-edit-att") {
        Core.assertManagerAccess("OpenAdminEditAttendance");
        uiState.modal = { type: "admin_edit_att", recordId: btn.getAttribute("data-id") };
        render();
        return;
      }

      if (action === "set-archive-period") {
        Core.assertManagerAccess("FilterArchivePeriod");
        uiState.archivePeriodFilter = btn.getAttribute("data-period") || "all";
        render();
        return;
      }

      if (action === "export-csv") {
        await exportFilteredReportToCsv();
        return;
      }

      if (action === "export-pdf") {
        Core.assertManagerAccess("ExportReportPDF");
        await Core.logSecurityEvent(
          "EXPORT_REPORT_PDF",
          "attendance",
          "print_pdf",
          "Pengelola mencetak / menyimpan laporan kehadiran ke PDF."
        );
        window.print();
        return;
      }

      if (action === "reject-first-login") {
        Core.assertManagerAccess("RejectFirstLogin");
        uiState.modal = {
          type: "reject_first_login",
          userId: btn.getAttribute("data-userid"),
        };
        render();
        return;
      }

      if (action === "delete-preapproved") {
        Core.assertManagerAccess("DeletePreapprovedEmail");
        const id = btn.getAttribute("data-id");
        const { error } = await Core.state.supabase
          .from("preapproved_emails")
          .delete()
          .eq("id", id);
        if (error) throw error;
        await Core.logSecurityEvent(
          "PREAPPROVED_EMAIL_REMOVED",
          "preapproved_emails",
          id,
          "Menghapus entri email pra-persetujuan."
        );
        await Core.refreshAllData();
        showBanner(true, "Email dari daftar pra-persetujuan berhasil dihapus.");
        return;
      }

      if (action === "open-edit-employee") {
        Core.assertManagerAccess("OpenEditEmployee");
        uiState.modal = {
          type: "edit_employee",
          userId: btn.getAttribute("data-userid"),
        };
        render();
        return;
      }

      if (action === "delete-employee") {
        Core.assertManagerAccess("DeleteEmployee");
        const userId = btn.getAttribute("data-userid");
        const emp = Core.state.profiles.find((p) => p.id === userId);
        if (!emp) return;
        if (!Core.canDeleteEmployee(emp)) {
          showBanner(false, "Anda tidak memiliki izin untuk menghapus akun ini.");
          return;
        }
        uiState.modal = {
          type: "confirm_delete",
          kind: "employee",
          id: emp.id,
          name: emp.full_name,
        };
        render();
        return;
      }

      if (action === "quick-change-role") {
        const userId = btn.getAttribute("data-userid");
        const newRole = btn.getAttribute("data-newrole");
        await executeRoleChangeFast(userId, newRole, "", btn);
        return;
      }

      if (action === "open-role-modal") {
        Core.assertSuperAdminAccess("OpenRoleModal");
        uiState.modal = {
          type: "change_role",
          userId: btn.getAttribute("data-userid"),
          newRole: btn.getAttribute("data-newrole"),
        };
        render();
        return;
      }

      if (action === "edit-shift") {
        Core.assertManagerAccess("EditShift");
        uiState.editingShiftId = btn.getAttribute("data-id");
        render();
        return;
      }

      if (action === "cancel-edit-shift") {
        uiState.editingShiftId = null;
        render();
        return;
      }

      if (action === "new-outlet-form") {
        Core.assertManagerAccess("NewOutletForm");
        uiState.editingOutletId = "new";
        render();
        return;
      }

      if (action === "select-outlet-edit") {
        Core.assertManagerAccess("SelectOutletEdit");
        uiState.editingOutletId = btn.getAttribute("data-id");
        render();
        return;
      }

      if (action === "fill-outlet-current-gps") {
        Core.assertManagerAccess("FillOutletCurrentGPS");
        if (!navigator.geolocation) {
          showOutletHelperToast("⚠️ Browser ini tidak mendukung fitur Geolocation GPS.", false);
          return;
        }

        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "⏳ Mendeteksi Sinyal GPS...";

        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btn.disabled = false;
            btn.innerHTML = origHtml;

            const latEl = document.getElementById("outlet-lat-input");
            const lngEl = document.getElementById("outlet-lng-input");
            const latVal = Number(pos.coords.latitude.toFixed(6));
            const lngVal = Number(pos.coords.longitude.toFixed(6));
            if (latEl) latEl.value = latVal;
            if (lngEl) lngEl.value = lngVal;

            updateOutletRadarLive(latVal, lngVal);
            showOutletHelperToast(
              `📍 Koordinat GPS perangkat Anda terdeteksi: <strong>${latVal}, ${lngVal}</strong> (Akurasi: ±${Math.round(pos.coords.accuracy)}m). Silakan periksa dan klik tombol Simpan di bawah.`,
              true
            );
          },
          (err) => {
            btn.disabled = false;
            btn.innerHTML = origHtml;
            let errMsg = err.message || "Gagal mengambil GPS.";
            if (err.code === 1) errMsg = "Izin akses lokasi ditolak oleh browser/macOS. Silakan aktifkan izin lokasi di Pengaturan Safari/Browser Anda.";
            else if (err.code === 2) errMsg = "Sinyal GPS fisik tidak ditemukan. Anda dapat menggunakan tombol 'Cari GPS dari Alamat' atau 'Pasang Koordinat Bali'.";
            else if (err.code === 3) errMsg = "Waktu pencarian GPS habis (timeout). Silakan coba lagi atau gunakan tombol pencari alamat.";
            showOutletHelperToast("⚠️ " + errMsg, false);
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        return;
      }

      if (action === "geocode-outlet-address") {
        Core.assertManagerAccess("GeocodeOutletAddress");
        const addrInput = document.getElementById("outlet-address-input");
        const rawAddr = (addrInput ? addrInput.value : "").trim();
        if (!rawAddr) {
          showOutletHelperToast("⚠️ Silakan ketik alamat outlet terlebih dahulu pada kolom Alamat Lengkap.", false);
          if (addrInput) addrInput.focus();
          return;
        }

        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "🔍 Mencari Titik GPS...";

        try {
          const queries = [
            rawAddr,
            rawAddr + ", Gianyar, Bali, Indonesia",
            "Jalan Pura Uma Jati, Peliatan, Ubud, Bali",
            "Teges Kanginan, Peliatan, Ubud, Bali",
            "Peliatan, Ubud, Gianyar, Bali"
          ];

          let found = null;
          for (const q of queries) {
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`, {
                headers: { "Accept-Language": "id,en" }
              });
              if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list) && list.length > 0) {
                  found = list[0];
                  break;
                }
              }
            } catch {
              // Lewati ke query berikutnya
            }
          }

          if (found && found.lat && found.lon) {
            const latVal = Number(parseFloat(found.lat).toFixed(6));
            const lngVal = Number(parseFloat(found.lon).toFixed(6));
            const latEl = document.getElementById("outlet-lat-input");
            const lngEl = document.getElementById("outlet-lng-input");
            if (latEl) latEl.value = latVal;
            if (lngEl) lngEl.value = lngVal;

            updateOutletRadarLive(latVal, lngVal);
            showOutletHelperToast(
              `📍 Titik GPS ditemukan: <strong>${latVal}, ${lngVal}</strong> (${found.display_name.split(",").slice(0, 3).join(",")}). Klik Simpan di bawah.`,
              true
            );
          } else {
            // Gunakan preset akurat Peliatan Ubud
            const baliLat = -8.524600;
            const baliLng = 115.274100;
            const latEl = document.getElementById("outlet-lat-input");
            const lngEl = document.getElementById("outlet-lng-input");
            if (latEl) latEl.value = baliLat;
            if (lngEl) lngEl.value = baliLng;
            updateOutletRadarLive(baliLat, baliLng);
            showOutletHelperToast(
              `📍 Titik GPS wilayah Banjar Teges Kanginan, Peliatan, Ubud berhasil disetel: <strong>${baliLat}, ${baliLng}</strong>. Klik Simpan di bawah.`,
              true
            );
          }
        } catch (err) {
          showOutletHelperToast("⚠️ Gagal mencari koordinat: " + (err.message || err), false);
        } finally {
          btn.disabled = false;
          btn.innerHTML = origHtml;
        }
        return;
      }

      if (action === "set-preset-bali-gps") {
        Core.assertManagerAccess("SetPresetBaliGPS");
        const latEl = document.getElementById("outlet-lat-input");
        const lngEl = document.getElementById("outlet-lng-input");
        const addrEl = document.getElementById("outlet-address-input");
        const tzEl = document.getElementById("outlet-timezone-select");

        const baliLat = -8.524600;
        const baliLng = 115.274100;
        if (latEl) latEl.value = baliLat;
        if (lngEl) lngEl.value = baliLng;
        if (addrEl && (!addrEl.value || addrEl.value.includes("Atur alamat") || addrEl.value.length < 5)) {
          addrEl.value = "Jalan Pura Uma Jati Gang Gagak Jl. Teges Kanginan No.Br, Peliatan, Ubud, Gianyar, Bali 80571";
        }
        if (tzEl) tzEl.value = "Asia/Makassar";

        updateOutletRadarLive(baliLat, baliLng);
        showOutletHelperToast(
          `📍 Titik GPS resmi Suka Latte (Banjar Teges Kanginan, Peliatan, Ubud, Bali: <strong>${baliLat}, ${baliLng}</strong> WITA) berhasil dipasang! Klik tombol Simpan di bawah.`,
          true
        );
        return;
      }

      if (action === "review-corr") {
        Core.assertManagerAccess("ReviewCorrection");
        uiState.modal = {
          type: "review_corr",
          corrId: btn.getAttribute("data-id"),
          decision: btn.getAttribute("data-decision"),
        };
        render();
        return;
      }

      if (action === "edit-calendar") {
        Core.assertManagerAccess("EditCalendar");
        uiState.editingCalendarId = btn.getAttribute("data-id");
        render();
        return;
      }

      if (action === "cancel-edit-calendar") {
        uiState.editingCalendarId = null;
        render();
        return;
      }

      if (action === "approve-leave") {
        Core.assertManagerAccess("ApproveLeave");
        const id = btn.getAttribute("data-id");
        const decision = btn.getAttribute("data-decision");
        const { error } = await Core.state.supabase
          .from("holidays_and_leaves")
          .update({
            status: decision,
            approved_by: Core.state.currentUser.id,
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (error) throw error;
        await Core.logSecurityEvent(
          `LEAVE_${decision.toUpperCase()}`,
          "holidays_and_leaves",
          id,
          `Pengajuan izin/sakit/cuti diputuskan menjadi ${decision}.`
        );
        await Core.refreshAllData();
        showBanner(true, `Status pengajuan berhasil diperbarui menjadi ${decision.toUpperCase()}.`);
        return;
      }

      if (action === "delete-calendar") {
        Core.assertManagerAccess("DeleteCalendar");
        const id = btn.getAttribute("data-id");
        const { error } = await Core.state.supabase
          .from("holidays_and_leaves")
          .delete()
          .eq("id", id);
        if (error) throw error;
        await Core.logSecurityEvent(
          "CALENDAR_ENTRY_DELETED",
          "holidays_and_leaves",
          id,
          "Menghapus jadwal libur/izin dari kalender operasional."
        );
        await Core.refreshAllData();
        showBanner(true, "Entri kalender berhasil dihapus.");
        return;
      }

      if (action === "download-config-js") {
        Core.assertSuperAdminAccess("DownloadConfigJS");
        Core.downloadConfigJsFile();
        showBanner(
          true,
          "File config.js berhasil diunduh! Pindahkan ke dalam folder js/ sebelum upload ke Vercel."
        );
        return;
      }
    } catch (err) {
      showBanner(false, err.message || "Terjadi kesalahan saat memproses permintaan.");
    }
  });

  // ==========================================================================
  // 7. PENANGANAN SUBMIT FORMULIR (DELEGASI KE HANDLER RESMI)
  // ==========================================================================
  document.addEventListener("submit", async (ev) => {
    const rawTarget = ev.target;
    const form =
      rawTarget && typeof rawTarget.closest === "function"
        ? rawTarget.closest("form")
        : rawTarget && rawTarget.tagName === "FORM"
        ? rawTarget
        : null;
    if (!form) return;
    ev.preventDefault();

    try {
      if (form.id === "form-save-shift") return await handleSaveShift(form.querySelector("#btn-save-shift") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-save-outlet") return await handleSaveOutlet(form.querySelector("#btn-save-outlet") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-save-rules") return await handleSaveRules(form.querySelector("#btn-save-rules") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-save-calendar") return await handleSaveCalendar(form.querySelector("#btn-save-calendar") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-save-branding") return await handleSaveBranding(form.querySelector("#btn-save-branding") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-save-security") return await handleSaveSecurity(form.querySelector("#btn-save-security") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-preapprove-email") return await handlePreapproveEmail(form.querySelector("#btn-save-preapprove") || form.querySelector('button[type="submit"]'));
      if (form.classList.contains("form-approve-first-login")) return await handleApproveFirstLogin(form.querySelector('[data-action="submit-approve-first-login"]') || form.querySelector('button[type="submit"]'));
      if (form.id === "form-reject-first-login") return await handleRejectFirstLogin(form.querySelector('[data-action="submit-reject-first-login"]') || form.querySelector('button[type="submit"]'));
      if (form.id === "form-edit-employee") return await handleEditEmployee(form.querySelector("#btn-save-employee") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-change-role") return await handleChangeRole(form.querySelector("#btn-save-change-role") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-admin-edit-att") return await handleAdminEditAttendance(form.querySelector("#btn-save-admin-edit-att") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-review-corr") return await handleReviewCorrection(form.querySelector('[data-action="submit-review-corr"]') || form.querySelector('button[type="submit"]'));
      if (form.id === "form-member-corr") return await handleMemberCorrection(form.querySelector('[data-action="submit-member-corr"]') || form.querySelector('button[type="submit"]'));
      if (form.id === "form-member-leave") return await handleMemberLeave(form.querySelector('[data-action="submit-member-leave"]') || form.querySelector('button[type="submit"]'));
      if (form.id === "form-complete-bootstrap") return await handleCompleteBootstrap();
      if (form.id === "form-cloud-connect") return await handleCloudConnect(form.querySelector('button[type="submit"]'));
    } catch (err) {
      showBanner(false, err.message || "Gagal memproses formulir.");
    }
  });

  // ==========================================================================
  // 8. PENANGANAN FILTER INPUT & SELECT
  // ==========================================================================
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!el || !el.id) return;

    if (el.id === "camera-shift-select") {
      liveCamera.shiftId = el.value;
      liveCamera.submitError = null;
      updateCameraModalPanelsInPlace();
    } else if (el.id === "member-period-select") {
      uiState.archivePeriodFilter = el.value;
      render();
    } else if (el.id === "archive-outlet-select") {
      uiState.archiveOutletFilter = el.value;
      render();
    } else if (el.id === "rep-date-from") {
      uiState.reportDateFrom = el.value;
      render();
    } else if (el.id === "rep-date-to") {
      uiState.reportDateTo = el.value;
      render();
    } else if (el.id === "rep-emp-select") {
      uiState.reportEmpId = el.value;
      render();
    } else if (el.id === "rep-outlet-select") {
      uiState.reportOutletId = el.value;
      render();
    }
  });

  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el && el.id === "archive-search-input") {
      uiState.archiveSearch = el.value;
      render();
    } else if (el && (el.id === "outlet-lat-input" || el.id === "outlet-lng-input")) {
      const latEl = document.getElementById("outlet-lat-input");
      const lngEl = document.getElementById("outlet-lng-input");
      if (latEl && lngEl) {
        updateOutletRadarLive(latEl.value, lngEl.value);
      }
    }
  });

  // ==========================================================================
  // 9. DETAK JAM SERVER RESMI WITA REAL-TIME & INISIALISASI APLIKASI
  // ==========================================================================
  setInterval(() => {
    const timeEl = document.getElementById("live-server-clock-time");
    const dateEl = document.getElementById("live-server-clock-date");
    if (!timeEl && !dateEl) return;
    const tz = Core.state.settings.operational_timezone || "Asia/Makassar";
    const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
    if (timeEl) timeEl.textContent = parts.timeString;
    if (dateEl) {
      dateEl.textContent = `Tanggal: ${parts.dateString} • 📁 ${parts.archiveFolderLabel}`;
    }
  }, 1000);

  Core.initializeApp(render);
})();
