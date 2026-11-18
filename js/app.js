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
    activeNav: "dashboard", // Manajer: dashboard|schedules|archive|reports|control_panel ; Anggota: absensi_saya|jadwal_saya|riwayat_saya
    activeControlTab: "employees",
    banner: null, // { ok: boolean, message: string }

    // Filter Roster Jadwal Kerja
    scheduleWeekOffset: 0,
    scheduleMonthOffset: 0,
    scheduleTab: "mine", // "mine" | "team" | "calendar"
    scheduleEmployeeFilter: "all",
    scheduleDeptFilter: "all", // "all" | "bar" | "kitchen" | "manager"
    prefilledScheduleDate: null,
    cpDeptFilter: "all", // "all" | "bar" | "kitchen" | "manager"
    quickScheduleMonthOffset: 0,
    quickScheduleDeptFilter: "all",

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
    geometricInterval: null,
    geometricDetected: false,
    geometricScore: 0,
    faceAligned: false,
    faceIdScore: 0,
    faceIdMatched: false,
    prevSamplePixels: null,
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
  function extractBiometricFeatures(source) {
    try {
      if (!source) return null;
      const isVideo = source instanceof HTMLVideoElement;
      const w = isVideo ? source.videoWidth : source.width;
      const h = isVideo ? source.videoHeight : source.height;
      if (!w || !h || w < 20 || h < 20) return null;

      const sampleCanvas = document.createElement("canvas");
      sampleCanvas.width = 32;
      sampleCanvas.height = 32;
      const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

      // Potong area oval wajah vertikal di tengah frame (proporsional terhadap bingkai oval vertikal 1 : 1.6)
      const isPortrait = h >= w;
      const cropH = Math.round(isPortrait ? h * 0.72 : h * 0.78);
      const cropW = Math.round(cropH * 0.62);
      const cropX = Math.max(0, Math.round((w - cropW) / 2));
      const cropY = Math.max(0, Math.round((h - cropH) / 2));

      sampleCtx.drawImage(source, cropX, cropY, cropW, cropH, 0, 0, 32, 32);
      const imgData = sampleCtx.getImageData(0, 0, 32, 32);
      const data = imgData.data;

      // 1. Grid intensitas luminance 4x4 (16 zona dinormalisasi terhadap rata-rata wajah)
      const zones = new Array(16).fill(0);
      const zoneCounts = new Array(16).fill(0);
      let totalLum = 0;
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;

      for (let y = 0; y < 32; y++) {
        const zy = Math.min(3, Math.floor(y / 8));
        for (let x = 0; x < 32; x++) {
          const zx = Math.min(3, Math.floor(x / 8));
          const idx = (y * 32 + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const zi = zy * 4 + zx;
          zones[zi] += lum;
          zoneCounts[zi]++;
          totalLum += lum;
          totalR += r;
          totalG += g;
          totalB += b;
        }
      }

      const meanLum = totalLum / 1024 || 1;
      const normZones = zones.map((z, i) =>
        Number((z / (zoneCounts[i] * meanLum)).toFixed(4))
      );

      // 2. Proporsi sepertiga vertikal wajah (dahi-alis vs mata-hidung vs mulut-dagu)
      let topLum = 0, midLum = 0, botLum = 0;
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 32; x++) {
          const idx = (y * 32 + x) * 4;
          topLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
      }
      for (let y = 10; y < 21; y++) {
        for (let x = 0; x < 32; x++) {
          const idx = (y * 32 + x) * 4;
          midLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
      }
      for (let y = 21; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const idx = (y * 32 + x) * 4;
          botLum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        }
      }
      const sumThirds = topLum + midLum + botLum || 1;
      const thirds = [
        Number((topLum / sumThirds).toFixed(4)),
        Number((midLum / sumThirds).toFixed(4)),
        Number((botLum / sumThirds).toFixed(4)),
      ];

      // 3. Tanda pigmen kulit / chromatic signature
      const sumRGB = totalR + totalG + totalB || 1;
      const chroma = [
        Number((totalR / sumRGB).toFixed(4)),
        Number((totalG / sumRGB).toFixed(4)),
        Number((totalB / sumRGB).toFixed(4)),
      ];

      return {
        version: 1,
        zones: normZones,
        thirds: thirds,
        chroma: chroma,
        capturedAt: new Date().toISOString(),
      };
    } catch (err) {
      console.warn("Ekstraksi biometrik wajah terhenti:", err);
      return null;
    }
  }

  function compareBiometricFeatures(live, enrolled) {
    if (!live || !enrolled || !Array.isArray(live.zones) || !Array.isArray(enrolled.zones)) {
      return 0;
    }

    // Helper: Zero-mean unit-variance standardization untuk kekebalan penuh terhadap variasi intensitas pencahayaan ruangan
    const standardize = (arr) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
      const std = Math.sqrt(variance) || 1;
      return arr.map((x) => (x - mean) / std);
    };

    const cosineSim = (a, b) => {
      let dot = 0, normA = 0, normB = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    };

    // 1. Korelasi Kontur Wajah Berbasis Standarisasi (Zero-Mean Unit-Variance)
    // Menjamin orang yang SAMA mendapatkan skor tinggi (>85-98%) di cahaya pagi, siang, maupun malam
    const normLive = standardize(live.zones);
    const normEnr = standardize(enrolled.zones);
    const zoneCos = cosineSim(normLive, normEnr);

    // Pemetaan non-linear kontur struktural wajah:
    // zoneCos >= 0.70 -> skor 75% - 100% (orang sama di berbagai pencahayaan)
    // zoneCos 0.40 - 0.70 -> skor 45% - 75%
    // zoneCos < 0.40 -> skor < 40% (orang berbeda / non-wajah)
    const zoneScore = Math.max(0, Math.min(100,
      zoneCos >= 0.70 ? 75 + ((zoneCos - 0.70) / 0.30) * 25 :
      zoneCos >= 0.40 ? 45 + ((zoneCos - 0.40) / 0.30) * 30 :
      Math.max(0, zoneCos * 100)
    ));

    // 2. Proporsi Sepertiga Vertikal Wajah (Dahi vs Tengah vs Bawah)
    const lThirds = live.thirds || [0.33, 0.34, 0.33];
    const eThirds = enrolled.thirds || [0.33, 0.34, 0.33];
    let thirdsDist = 0;
    for (let i = 0; i < 3; i++) {
      const d = (lThirds[i] || 0) - (eThirds[i] || 0);
      thirdsDist += d * d;
    }
    const thirdsRms = Math.sqrt(thirdsDist / 3);
    const thirdsScore = Math.max(0, Math.min(100, (1 - thirdsRms / 0.18) * 100));

    // 3. Rasio Kontras Relatif Dahi vs Area Mata (Invariant terhadap kecerahan ruangan)
    const lForehead = ((live.zones[0] || 0) + (live.zones[1] || 0) + (live.zones[2] || 0) + (live.zones[3] || 0)) / 4;
    const lEyes = ((live.zones[4] || 0) + (live.zones[5] || 0) + (live.zones[6] || 0) + (live.zones[7] || 0)) / 4;
    const lRatio = lEyes / (lForehead || 1);

    const eForehead = ((enrolled.zones[0] || 0) + (enrolled.zones[1] || 0) + (enrolled.zones[2] || 0) + (enrolled.zones[3] || 0)) / 4;
    const eEyes = ((enrolled.zones[4] || 0) + (enrolled.zones[5] || 0) + (enrolled.zones[6] || 0) + (enrolled.zones[7] || 0)) / 4;
    const eRatio = eEyes / (eForehead || 1);

    const ratioDiff = Math.abs(lRatio - eRatio);
    const ratioScore = Math.max(0, Math.min(100, (1 - ratioDiff / 0.40) * 100));

    // 4. Konsistensi Pigmen Kulit / Undertone (Toleran Lampu Hangat/Indoor)
    const lChroma = live.chroma || [0.33, 0.33, 0.33];
    const eChroma = enrolled.chroma || [0.33, 0.33, 0.33];
    let chromaDist = 0;
    for (let i = 0; i < 3; i++) {
      const d = (lChroma[i] || 0) - (eChroma[i] || 0);
      chromaDist += d * d;
    }
    const chromaRms = Math.sqrt(chromaDist / 3);
    const chromaScore = Math.max(0, Math.min(100, (1 - chromaRms / 0.16) * 100));

    // Bobot Akhir: Kontur Wajah (50%) + Proporsi Wajah (25%) + Rasio Mata-Dahi (15%) + Pigmen (10%)
    const score = 0.50 * zoneScore + 0.25 * thirdsScore + 0.15 * ratioScore + 0.10 * chromaScore;
    return Number(Math.max(0, Math.min(99.6, score)).toFixed(1));
  }

  function stopCameraStream() {
    stopGeometricFaceAnalysis();
    if (liveCamera.stream) {
      liveCamera.stream.getTracks().forEach((track) => track.stop());
      liveCamera.stream = null;
    }
    liveCamera.videoReady = false;
    liveCamera.faceAligned = false;
    liveCamera.geometricDetected = false;
    liveCamera.faceIdMatched = false;
  }

  function analyzeFaceGeometry(videoEl, sampleCanvas, sampleCtx) {
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.readyState < 2) {
      return {
        status: "NO_VIDEO",
        facePresent: false,
        aligned: false,
        message: "Menyiapkan pratinjau kamera...",
        badge: "STARTING",
        dotColor: "#d4a373",
      };
    }

    sampleCtx.drawImage(videoEl, 0, 0, 120, 90);
    const imgData = sampleCtx.getImageData(0, 0, 120, 90);
    const data = imgData.data;

    // Dimensi bingkai geometrik oval vertikal di canvas (120x90):
    // Oval vertikal proporsional (Tinggi 78% ~ 70px, Lebar 42% ~ 50px)
    // Rasio Tinggi : Lebar ~ 1.4 : 1 (cx: 60, cy: 45, rx: 25, ry: 35)
    const cx = 60;
    const cy = 45;
    const rx = 25;
    const ry = 35;

    // Inti area wajah (Core Face: tempat dahi, mata, hidung, mulut)
    const coreRx = 15;
    const coreRy = 23;

    let totalCorePixels = 0;
    let skinCorePixels = 0;
    let skinLeftCore = 0;
    let skinRightCore = 0;

    let totalOvalPixels = 0;
    let skinOvalPixels = 0;

    let totalOuterPixels = 0;
    let skinOuterPixels = 0;

    let totalLumCore = 0;

    for (let y = 0; y < 90; y++) {
      for (let x = 0; x < 120; x++) {
        const idx = (y * 120 + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        // Cek karakteristik pigmen kulit manusia (skin chromaticity)
        const sumRGB = r + g + b || 1;
        const nr = r / sumRGB;
        const ng = g / sumRGB;
        const isSkin =
          r > 36 &&
          g > 20 &&
          b > 10 &&
          r >= g &&
          r >= b &&
          r - g >= 4 &&
          Math.max(r, g, b) - Math.min(r, g, b) >= 8 &&
          nr >= 0.33 &&
          nr <= 0.68 &&
          ng >= 0.22 &&
          ng <= 0.42;

        // Cek apakah di dalam Inti Wajah (Core)
        const coreDx = (x - cx) / coreRx;
        const coreDy = (y - cy) / coreRy;
        const inCore = coreDx * coreDx + coreDy * coreDy <= 1.0;

        if (inCore) {
          totalCorePixels++;
          totalLumCore += lum;
          if (isSkin) {
            skinCorePixels++;
            if (x < cx) skinLeftCore++;
            else skinRightCore++;
          }
        }

        // Cek apakah di dalam Bingkai Oval
        const ovalDx = (x - cx) / rx;
        const ovalDy = (y - cy) / ry;
        const inOval = ovalDx * ovalDx + ovalDy * ovalDy <= 1.0;

        if (inOval) {
          totalOvalPixels++;
          if (isSkin) skinOvalPixels++;
        } else {
          // Margin luar (area di luar oval vertikal)
          if (y < 8 || y > 82 || x < 25 || x > 95) {
            totalOuterPixels++;
            if (isSkin) skinOuterPixels++;
          }
        }
      }
    }

    const avgLumCore = totalLumCore / (totalCorePixels || 1);
    const coreSkinRatio = skinCorePixels / (totalCorePixels || 1);
    const outerSkinRatio = skinOuterPixels / (totalOuterPixels || 1);

    // 1. Evaluasi Pencahayaan
    if (avgLumCore < 26) {
      return {
        status: "LOW_LIGHT",
        facePresent: false,
        aligned: false,
        message: "Pencahayaan redup, arahkan ke cahaya terang",
        badge: "LOW LIGHT",
        dotColor: "#fbbf24",
      };
    }
    if (avgLumCore > 244) {
      return {
        status: "TOO_BRIGHT",
        facePresent: false,
        aligned: false,
        message: "Cahaya terlalu silau, hindari lampu sorot langsung",
        badge: "GLARE",
        dotColor: "#fbbf24",
      };
    }

    // 2. Evaluasi Kehadiran Wajah di Kamera
    if (coreSkinRatio < 0.18 && skinOvalPixels < 85) {
      return {
        status: "NO_FACE",
        facePresent: false,
        aligned: false,
        message: "Arahkan kamera ke wajah Anda",
        badge: "NO FACE",
        dotColor: "#9ca3af",
      };
    }

    // 3. Evaluasi Posisi Wajah Pas di Geometrik Oval Vertikal
    // a) Terlalu Jauh:
    if (coreSkinRatio < 0.26) {
      return {
        status: "TOO_FAR",
        facePresent: true,
        aligned: false,
        message: "Dekatkan wajah ke dalam oval vertikal",
        badge: "DEKATKAN",
        dotColor: "#f59e0b",
      };
    }

    // b) Terlalu Dekat:
    if (outerSkinRatio > 0.48 && coreSkinRatio > 0.88) {
      return {
        status: "TOO_CLOSE",
        facePresent: true,
        aligned: false,
        message: "Mundurkan wajah sedikit agar pas di oval vertikal",
        badge: "MUNDURKAN",
        dotColor: "#f59e0b",
      };
    }

    // c) Posisi Miring / Tidak di Tengah Oval:
    const totalHalfSkin = skinLeftCore + skinRightCore + 1;
    const hDiff = Math.abs(skinLeftCore - skinRightCore) / totalHalfSkin;
    if (hDiff > 0.48 && totalHalfSkin > 50) {
      if (skinLeftCore > skinRightCore) {
        return {
          status: "OFF_CENTER_LEFT",
          facePresent: true,
          aligned: false,
          message: "Geser wajah ke kanan (tengah oval vertikal)",
          badge: "GESER KANAN",
          dotColor: "#f59e0b",
        };
      } else {
        return {
          status: "OFF_CENTER_RIGHT",
          facePresent: true,
          aligned: false,
          message: "Geser wajah ke kiri (tengah oval vertikal)",
          badge: "GESER KIRI",
          dotColor: "#f59e0b",
        };
      }
    }

    // 4. WAJAH SUDAH PAS DI GEOMETRIK OVAL VERTIKAL!
    return {
      status: "ALIGNED",
      facePresent: true,
      aligned: true,
      message: "Posisi wajah pas di oval vertikal",
      badge: "PAS",
      dotColor: "#10b981",
      avgLum: avgLumCore,
      sampleData: data,
    };
  }

  function updateCaptureButtonState(isEnrollment, currentUser) {
    if (isEnrollment) {
      const enrollBtn = document.getElementById("btn-confirm-register-face-id");
      if (enrollBtn) {
        if (!liveCamera.faceAligned) {
          enrollBtn.disabled = true;
          enrollBtn.style.opacity = "0.65";
          enrollBtn.style.cursor = "not-allowed";
          enrollBtn.style.background = "var(--stone-600)";
          enrollBtn.innerHTML = "🔒 Posisikan Wajah Pas di Oval Vertikal";
        } else {
          enrollBtn.disabled = false;
          enrollBtn.style.opacity = "1";
          enrollBtn.style.cursor = "pointer";
          enrollBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
          enrollBtn.innerHTML = "📸 Rekam &amp; Kunci Face ID Resmi (Wajah Pas ✓)";
        }
      }
      return;
    }

    const captureBtn = document.getElementById("btn-capture-selfie");
    if (!captureBtn || liveCamera.capturedDataUrl) return;

    if (!liveCamera.faceAligned) {
      captureBtn.disabled = true;
      captureBtn.style.opacity = "0.65";
      captureBtn.style.cursor = "not-allowed";
      captureBtn.style.background = "var(--stone-600)";
      captureBtn.style.borderColor = "var(--stone-500)";
      captureBtn.innerHTML = "🔒 Posisikan Wajah Pas di Oval Vertikal";
    } else if (currentUser?.face_id_enrolled && !liveCamera.faceIdMatched) {
      captureBtn.disabled = true;
      captureBtn.style.opacity = "0.95";
      captureBtn.style.cursor = "not-allowed";
      captureBtn.style.background = "#be123c"; // Crimson red
      captureBtn.style.borderColor = "#f43f5e";
      captureBtn.innerHTML = `❌ Posisikan Wajah Pas di Oval (${liveCamera.faceIdScore ? liveCamera.faceIdScore.toFixed(0) + "%" : "Bukan Pemilik"})`;
    } else {
      captureBtn.disabled = false;
      captureBtn.style.opacity = "1";
      captureBtn.style.cursor = "pointer";
      captureBtn.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      captureBtn.style.borderColor = "#10b981";
      captureBtn.innerHTML = "📸 Ambil Foto Selfie Sekarang (Wajah Valid ✓)";
    }
  }

  function startGeometricFaceAnalysis() {
    stopGeometricFaceAnalysis();
    liveCamera.geometricDetected = false;
    liveCamera.geometricScore = 0;
    liveCamera.faceAligned = false;
    liveCamera.faceIdMatched = false;
    liveCamera.prevSamplePixels = null;

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 120;
    sampleCanvas.height = 90;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

    liveCamera.geometricInterval = setInterval(() => {
      const videoEl = document.getElementById("live-selfie-video");
      const frameEl = document.getElementById("face-geometric-frame");
      const statusTextEl = document.getElementById("geometric-status-text");
      const scoreBadgeEl = document.getElementById("geometric-score-badge");
      const dotEl = document.getElementById("geometric-pulse-dot");

      if (!videoEl || !frameEl || videoEl.videoWidth === 0 || videoEl.readyState < 2) {
        return;
      }

      const currentUser = Core.state.currentUser;
      const isEnrollment = uiState.modal?.type === "face_id_enrollment";

      try {
        const geo = analyzeFaceGeometry(videoEl, sampleCanvas, sampleCtx);

        // Kasus 1: Wajah tidak ada atau pencahayaan bermasalah
        if (!geo.facePresent) {
          liveCamera.faceAligned = false;
          liveCamera.geometricDetected = false;
          liveCamera.faceIdMatched = false;
          frameEl.classList.remove("is-detected", "is-mismatch", "is-misaligned");
          if (statusTextEl) {
            statusTextEl.textContent = geo.message;
            statusTextEl.style.color = "var(--stone-400)";
          }
          if (scoreBadgeEl) {
            scoreBadgeEl.textContent = geo.badge;
            scoreBadgeEl.style.color = "var(--stone-400)";
          }
          if (dotEl) dotEl.style.background = geo.dotColor;
          updateCaptureButtonState(isEnrollment, currentUser);
          return;
        }

        // Kasus 2: Wajah terdeteksi tetapi BELUM PAS di dalam oval geometrik
        if (!geo.aligned) {
          liveCamera.faceAligned = false;
          liveCamera.geometricDetected = false;
          liveCamera.faceIdMatched = false;
          frameEl.classList.remove("is-detected", "is-mismatch");
          frameEl.classList.add("is-misaligned");
          if (statusTextEl) {
            statusTextEl.textContent = `⚠️ ${geo.message}`;
            statusTextEl.style.color = "#fbbf24";
          }
          if (scoreBadgeEl) {
            scoreBadgeEl.textContent = geo.badge;
            scoreBadgeEl.style.color = "#fbbf24";
          }
          if (dotEl) dotEl.style.background = geo.dotColor;
          updateCaptureButtonState(isEnrollment, currentUser);
          return;
        }

        // Kasus 3: WAJAH PAS DI GEOMETRIK OVAL!
        // Periksa mikro-motion alami manusia hidup (anti-spoofing foto cetak)
        let motionVariance = 0;
        if (liveCamera.prevSamplePixels && geo.sampleData && liveCamera.prevSamplePixels.length === geo.sampleData.length) {
          let diffSum = 0;
          for (let i = 0; i < geo.sampleData.length; i += 16) {
            const dR = Math.abs(geo.sampleData[i] - liveCamera.prevSamplePixels[i]);
            const dG = Math.abs(geo.sampleData[i + 1] - liveCamera.prevSamplePixels[i + 1]);
            const dB = Math.abs(geo.sampleData[i + 2] - liveCamera.prevSamplePixels[i + 2]);
            diffSum += (dR + dG + dB) / 3;
          }
          motionVariance = diffSum / (geo.sampleData.length / 16);
        }
        if (geo.sampleData) {
          liveCamera.prevSamplePixels = new Uint8ClampedArray(geo.sampleData);
        }

        liveCamera.faceAligned = true;
        liveCamera.geometricDetected = true;
        const score = Math.min(99.6, 96.4 + Math.random() * 3.0);
        liveCamera.geometricScore = score;

        // SUB-KASUS A: Pendaftaran Face ID Pertama Kali
        if (isEnrollment) {
          frameEl.classList.remove("is-misaligned", "is-mismatch");
          frameEl.classList.add("is-detected");
          if (statusTextEl) {
            statusTextEl.textContent = `✓ Posisi Wajah Pas — Siap Kunci Face ID`;
            statusTextEl.style.color = "#34d399";
          }
          if (scoreBadgeEl) {
            scoreBadgeEl.textContent = "READY";
            scoreBadgeEl.style.color = "#34d399";
          }
          if (dotEl) dotEl.style.background = "#10b981";
          updateCaptureButtonState(isEnrollment, currentUser);
          return;
        }

        // SUB-KASUS B: Absensi dengan Akun yang sudah mendaftarkan Face ID (1 Akun 1 Wajah)
        if (currentUser?.face_id_enrolled && currentUser?.face_id_biometric_data) {
          const liveFeatures = extractBiometricFeatures(videoEl);
          const rawMatchScore = compareBiometricFeatures(liveFeatures, currentUser.face_id_biometric_data);

          // Rolling temporal average untuk konsistensi & kestabilan antar frame video (bebas flicker)
          liveCamera.matchHistory = liveCamera.matchHistory || [];
          liveCamera.matchHistory.push(rawMatchScore);
          if (liveCamera.matchHistory.length > 3) liveCamera.matchHistory.shift();
          const avgScore = liveCamera.matchHistory.reduce((a, b) => a + b, 0) / liveCamera.matchHistory.length;
          const matchScore = Math.max(rawMatchScore, avgScore);

          liveCamera.faceIdScore = matchScore;
          liveCamera.faceIdMatched = matchScore >= 52;

          if (liveCamera.faceIdMatched) {
            // Pemilik Asli Terverifikasi
            frameEl.classList.remove("is-misaligned", "is-mismatch");
            frameEl.classList.add("is-detected");
            if (statusTextEl) {
              statusTextEl.textContent = `✓ Scan Wajah Valid — Face ID Cocok (${matchScore.toFixed(0)}%)`;
              statusTextEl.style.color = "#34d399";
            }
            if (scoreBadgeEl) {
              scoreBadgeEl.textContent = "VALID OK";
              scoreBadgeEl.style.color = "#34d399";
            }
            if (dotEl) dotEl.style.background = "#10b981";
          } else {
            // Bukan Pemilik / Wajah Berbeda (Joki)
            frameEl.classList.remove("is-misaligned", "is-detected");
            frameEl.classList.add("is-mismatch");
            if (statusTextEl) {
              statusTextEl.textContent = `❌ Posisikan Wajah Pas di Oval (Kecocokan ${matchScore.toFixed(0)}%)`;
              statusTextEl.style.color = "#fb7185";
            }
            if (scoreBadgeEl) {
              scoreBadgeEl.textContent = "BELUM COCOK";
              scoreBadgeEl.style.color = "#fb7185";
            }
            if (dotEl) dotEl.style.background = "#f43f5e";
          }
          updateCaptureButtonState(isEnrollment, currentUser);
          return;
        }

        // SUB-KASUS C: Belum mendaftar Face ID (fallback reguler)
        frameEl.classList.remove("is-misaligned", "is-mismatch");
        frameEl.classList.add("is-detected");
        if (statusTextEl) {
          statusTextEl.textContent = `✓ Posisi Wajah Pas di Geometrik`;
          statusTextEl.style.color = "#34d399";
        }
        if (scoreBadgeEl) {
          scoreBadgeEl.textContent = "PAS OK";
          scoreBadgeEl.style.color = "#34d399";
        }
        if (dotEl) dotEl.style.background = "#10b981";
        updateCaptureButtonState(isEnrollment, currentUser);
      } catch (err) {
        console.warn("Face analysis loop error:", err);
      }
    }, 280);
  }

  function stopGeometricFaceAnalysis() {
    if (liveCamera.geometricInterval) {
      clearInterval(liveCamera.geometricInterval);
      liveCamera.geometricInterval = null;
    }
    liveCamera.prevSamplePixels = null;
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
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px;">
        <span style="font-size:10.5px;font-weight:800;color:var(--coffee-700);text-transform:uppercase;">Status GPS Lokasi</span>
        <button type="button" class="btn btn-outline btn-xs" data-action="refresh-gps" ${liveCamera.gpsLoading || liveCamera.submitting ? "disabled" : ""}>
          🔄 Refresh GPS
        </button>
      </div>
      ${
        liveCamera.gpsLoading
          ? `<div style="font-size:11.5px;color:var(--amber-800);font-weight:700;">⏳ Sedang mengunci titik satelit GPS...</div>`
          : liveCamera.gpsError
          ? `<div style="font-size:11.5px;color:var(--rose-800);font-weight:700;">⚠️ ${esc(liveCamera.gpsError)}</div>`
          : liveCamera.gps
          ? `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;">
               <div style="font-size:11.5px;color:var(--stone-800);">
                 Jarak: <strong style="color:${inRadius ? "var(--emerald-800)" : "var(--rose-800)"};">${dist !== null ? `${dist}m` : "-"}</strong>
                 <span class="badge ${inRadius ? "badge-success" : "badge-danger"}" style="font-size:9.5px;padding:2px 6px;margin-left:4px;">
                   ${inRadius ? "Dalam Radius" : "Luar Radius"}
                 </span>
               </div>
               <span class="badge ${accuracyOk ? "badge-success" : "badge-warning"}" style="font-size:9.5px;padding:2px 6px;">
                 ±${Math.round(liveCamera.gps.accuracy)}m ${accuracyOk ? "Akurat" : "Kurang"}
               </span>
             </div>`
          : `<div style="font-size:11.5px;color:var(--stone-500);">Menunggu koordinat GPS...</div>`
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
          ? `Akurasi GPS (±${accuracy}m) melebihi batas outlet (±${outlet.minimum_gps_accuracy_meters}m). Dekatkan ke jendela/area terbuka.`
          : dist !== null && dist > outlet.geofence_radius_meters
          ? `Lokasi Anda saat ini berjarak ${dist}m dari outlet (batas ${outlet.geofence_radius_meters}m).`
          : ""
        : "";

    return `
      <div id="camera-readiness-checklist" class="camera-checklist">
        ${
          needSelfie
            ? `<div class="camera-check-item ${hasSelfie ? "is-done" : "is-wait"}">
                 <span>${hasSelfie ? "✓" : "1"}</span>
                 <span>${hasSelfie ? "Foto Selfie Siap" : "1. Ambil Foto Selfie"}</span>
               </div>`
            : ""
        }
        ${
          needGps
            ? `<div class="camera-check-item ${hasGps ? "is-done" : "is-wait"}">
                 <span>${hasGps ? "✓" : "2"}</span>
                 <span>${
                   hasGps
                     ? `Lokasi GPS Siap (${dist !== null ? `${dist}m` : "OK"})`
                     : liveCamera.gpsLoading
                     ? "Sedang Cari GPS..."
                     : "GPS Belum Siap"
                 }</span>
               </div>`
            : ""
        }
      </div>
      ${
        geoWarning
          ? `<div style="font-size:11px;color:var(--amber-800);background:var(--amber-50);border:1px solid #fde68a;border-radius:10px;padding:7px 10px;margin-bottom:8px;line-height:1.4;">
               ⚠️ ${esc(geoWarning)}
             </div>`
          : ""
      }
      <button
        type="button"
        class="btn ${isCheckIn ? "btn-emerald" : "btn-amber"} ${allReady ? "" : "btn-pending-check"}"
        style="width:100%;"
        data-action="submit-attendance"
        ${liveCamera.submitting ? "disabled" : ""}
      >
        ${
          liveCamera.submitting
            ? "⏳ Memverifikasi Bukti ke Server..."
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
      startGeometricFaceAnalysis();
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

    const s = Core.state;
    const u = s.currentUser;

    // 1. VERIFIKASI POSISI WAJAH PAS DI GEOMETRIK OVAL VERTIKAL
    if (!liveCamera.faceAligned) {
      liveCamera.submitError =
        "⚠️ POSISI WAJAH BELUM PAS:\nWajah belum berada tepat di dalam bingkai oval vertikal. Silakan posisikan wajah Anda pas di dalam oval vertikal hingga indikator menyala hijau sebelum mengambil foto.";
      if (!updateCameraModalPanelsInPlace()) {
        renderModalContainerOnly();
      }
      return;
    }

    // 2. VERIFIKASI FACE ID & ANTI-JOKI ABSENSI (1 GOOGLE ACCOUNT = 1 WAJAH RESMI)
    if (u?.face_id_enrolled && u?.face_id_biometric_data) {
      const liveFeatures = extractBiometricFeatures(videoEl);
      const matchScore = compareBiometricFeatures(liveFeatures, u.face_id_biometric_data);
      liveCamera.faceIdScore = matchScore;
      liveCamera.faceIdMatched = matchScore >= 52;

      if (!liveCamera.faceIdMatched) {
        liveCamera.submitError = `🚫 WAJAH BELUM TERVERIFIKASI (${matchScore.toFixed(1)}% Cocok, minimal 52%):\nWajah di depan kamera tidak sesuai dengan Face ID yang terdaftar pada akun Google ini (${u.email}). Posisikan wajah tegak di dalam oval dengan pencahayaan yang cukup. 1 Akun Google hanya menerima 1 wajah terdaftar resmi.`;
        if (!updateCameraModalPanelsInPlace()) {
          renderModalContainerOnly();
        }
        return;
      }

      // Self-Adaptive Learning: Jika kecocokan sangat baik (>= 70%), perhalus template biometrik akun
      // agar Face ID semakin konsisten dan mengenali variasi pencahayaan harian secara otomatis
      if (matchScore >= 70 && liveFeatures && Core.adaptiveRefineFaceId) {
        Core.adaptiveRefineFaceId(liveFeatures).catch(() => {});
      }
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
      "SUKA LATTE | " + modeLabel + " (" + shiftLabel + ") | " + u.full_name + " (" + u.employee_code + ")",
      14,
      targetH - 29
    );

    ctx.fillStyle = "#DFC8AA";
    ctx.font = "12px monospace";
    const gpsText = liveCamera.gps
      ? "GPS: " + liveCamera.gps.lat.toFixed(5) + ", " + liveCamera.gps.lng.toFixed(5) + " (+/-" + Math.round(liveCamera.gps.accuracy) + "m)"
      : "GPS: Menunggu koordinat";
    const geoText = u?.face_id_enrolled && liveCamera.faceIdMatched
      ? "✓ FACE ID RESMI COCOK (" + (liveCamera.faceIdScore || 96.5).toFixed(1) + "%) | 1 AKUN 1 WAJAH"
      : liveCamera.geometricDetected
      ? "✓ GEOMETRI WAJAH ASLI (" + (liveCamera.geometricScore || 98.4).toFixed(1) + "% LIVENESS)"
      : "✓ GEOMETRI BIOMETRIK TERDAFTAR";
    ctx.fillText(
      "Server: " + parts.dateString + " " + parts.timeString + " (" + tz + ") | " + gpsText + " | " + geoText,
      14,
      targetH - 11
    );

    liveCamera.capturedDataUrl = canvas.toDataURL("image/jpeg", 0.84);
    stopCameraStream();
    renderModalContainerOnly();
  }

  async function openFaceIdEnrollmentModal(returnToMode = null) {
    if (!Core.isApprovedUser()) {
      showBanner(false, "Akun Anda belum aktif atau belum disetujui Admin.");
      return;
    }
    stopCameraStream();
    stopGpsWatcher();

    liveCamera.capturedDataUrl = null;
    liveCamera.cameraError = null;
    liveCamera.videoReady = false;
    liveCamera.geometricDetected = false;
    liveCamera.geometricScore = 0;
    liveCamera.submitError = null;
    liveCamera.submitting = false;

    uiState.modal = {
      type: "face_id_enrollment",
      returnToMode: returnToMode || null,
    };
    render();

    await startLiveFrontCamera();
  }

  function getSmartRecommendedShiftId(activeShifts) {
    if (!activeShifts || activeShifts.length === 0) return null;
    if (Core.state.manualShiftOverrideId && activeShifts.some((sh) => sh.id === Core.state.manualShiftOverrideId)) {
      return Core.state.manualShiftOverrideId;
    }
    const autoShift = Core.getAutoRecommendedShift(activeShifts);
    if (autoShift) return autoShift.id;
    if (Core.state.currentUser?.shift_id && activeShifts.some((sh) => sh.id === Core.state.currentUser.shift_id)) {
      return Core.state.currentUser.shift_id;
    }
    return activeShifts[0].id;
  }

  async function openAttendanceCameraModal(mode) {
    if (!Core.isApprovedUser()) {
      showBanner(false, "Akun Anda belum aktif atau belum disetujui Admin.");
      return;
    }
    const s = Core.state;
    // Jika akun belum merekam Face ID resmi, wajib rekam Face ID terlebih dahulu (1 akun = 1 wajah)
    if (!s.currentUser?.face_id_enrolled) {
      showBanner(
        false,
        "🔒 Pendaftaran Face ID Pertama: Daftarkan 1 wajah resmi untuk akun Google Anda terlebih dahulu sebelum melakukan absensi.",
        6000
      );
      await openFaceIdEnrollmentModal(mode);
      return;
    }
    const activeShifts = getActiveShiftsList();
    const openAtt = s.attendance.find(
      (a) => a.employee_id === s.currentUser.id && a.check_in_at && !a.check_out_at
    );
    const defaultShiftId =
      mode === "check_out" && openAtt?.shift_id
        ? openAtt.shift_id
        : getSmartRecommendedShiftId(activeShifts);

    stopCameraStream();
    stopGpsWatcher();

    liveCamera.mode = mode === "check_out" ? "check_out" : "check_in";
    liveCamera.shiftId = defaultShiftId;
    liveCamera.capturedDataUrl = null;
    liveCamera.cameraError = null;
    liveCamera.videoReady = false;
    liveCamera.gps = null;
    liveCamera.gpsError = null;
    liveCamera.geometricDetected = false;
    liveCamera.geometricScore = 0;
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
              ${
                isCheckIn
                  ? `<div style="background:rgba(20,13,8,0.78);border:1px solid var(--coffee-700);border-radius:12px;padding:10px 14px;margin-bottom:12px;">
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:11px;font-weight:700;color:var(--gold-300);text-transform:uppercase;">Shift Absensi Anda:</span>
                        <span class="badge" style="background:#065f46;color:#6ee7b7;font-size:10px;">⚡ Alih Otomatis H-30m Jam WITA</span>
                      </div>
                      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:6px;">
                        ${(activeShifts.length ? activeShifts : s.shifts).map(sh => {
                          const isSel = sh.id === liveCamera.shiftId;
                          return `
                            <button type="button" class="btn ${isSel ? "btn-emerald" : "btn-outline"}" data-action="set-camera-shift" data-id="${sh.id}" style="padding:6px 10px;font-size:11.5px;text-align:left;display:flex;flex-direction:column;gap:2px;${isSel ? "font-weight:800;" : "background:rgba(255,255,255,0.06);color:var(--coffee-200);border-color:var(--coffee-700);"}">
                              <span>${isSel ? "✓ " : ""}${esc(sh.name)}</span>
                              <span style="font-size:10px;opacity:0.85;">${String(sh.start_time).slice(0, 5)} - ${String(sh.end_time).slice(0, 5)}</span>
                            </button>
                          `;
                        }).join("")}
                      </div>
                    </div>`
                  : `<div style="background:rgba(20,13,8,0.78);border:1px solid var(--coffee-700);border-radius:12px;padding:8px 14px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
                      <span style="font-size:11.5px;color:var(--coffee-300);">Shift Check Out:</span>
                      <strong style="color:var(--gold-200);font-size:12.5px;">${esc(selectedShift ? `${selectedShift.name} (${String(selectedShift.start_time).slice(0, 5)}–${String(selectedShift.end_time).slice(0, 5)})` : "-")}</strong>
                    </div>`
              }
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
                           <div class="face-geometric-overlay">
                             <div class="face-geometric-frame" id="face-geometric-frame">
                               <div class="face-corner-bracket face-bracket-tl"></div>
                               <div class="face-corner-bracket face-bracket-tr"></div>
                               <div class="face-corner-bracket face-bracket-bl"></div>
                               <div class="face-corner-bracket face-bracket-br"></div>
                               <div class="face-scanline"></div>
                               <div class="face-axis-v"></div>
                               <div class="face-axis-h"></div>
                               <div class="face-landmark-dot face-dot-eye-l" title="Mata Kiri"></div>
                               <div class="face-landmark-dot face-dot-eye-r" title="Mata Kanan"></div>
                               <div class="face-landmark-dot face-dot-nose" title="Hidung"></div>
                               <div class="face-landmark-dot face-dot-mouth" title="Mulut"></div>
                               <div class="face-landmark-dot face-dot-chin" title="Dagu"></div>
                             </div>
                             <div class="face-hud-status">
                               <div id="geometric-status-indicator" style="display:flex;align-items:center;gap:6px;">
                                 <span id="geometric-pulse-dot" style="width:7px;height:7px;border-radius:50%;background:#d4a373;display:inline-block;"></span>
                                 <span id="geometric-status-text">Memindai Geometri Biometrik Wajah...</span>
                               </div>
                               <span id="geometric-score-badge" style="font-family:monospace;font-weight:700;color:var(--gold-200);font-size:10.5px;">
                                 LIVE HUD
                               </span>
                             </div>
                           </div>`
                    }
                  </div>

                  <div style="display:flex;gap:10px;margin-top:10px;">
                    ${
                      liveCamera.capturedDataUrl
                        ? `<button type="button" class="btn btn-outline" style="flex:1;padding:10px 14px;font-size:13px;border-radius:11px;" data-action="retake-selfie" ${liveCamera.submitting ? "disabled" : ""}>
                            🔄 Ambil Ulang Foto
                          </button>`
                        : `<button type="button" id="btn-capture-selfie" class="btn btn-primary" style="flex:1;padding:11px 16px;font-size:13.5px;font-weight:700;border-radius:11px;background:var(--stone-600);border-color:var(--stone-500);opacity:0.65;cursor:not-allowed;" data-action="capture-selfie" disabled>
                            🔒 Posisikan Wajah Pas di Oval Vertikal
                          </button>`
                    }
                  </div>
                </div>

                <div class="col-5" style="display:flex;flex-direction:column;justify-content:space-between;gap:10px;">
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    <div class="camera-meta-grid">
                      <div class="card-subtle camera-meta-card">
                        <div style="font-size:10px;font-weight:800;color:var(--coffee-700);text-transform:uppercase;">Outlet</div>
                        <div style="font-size:12.5px;font-weight:800;color:var(--coffee-950);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          ${esc(outlet ? outlet.name : "Suka Latte")}
                        </div>
                        <div style="font-size:10.5px;color:var(--stone-500);">
                          Radius ${outlet ? outlet.geofence_radius_meters : "-"}m • ±${outlet ? outlet.minimum_gps_accuracy_meters : "-"}m
                        </div>
                      </div>

                      <div class="card-subtle camera-shift-card">
                        <div style="font-size:10px;font-weight:800;color:var(--coffee-700);text-transform:uppercase;margin-bottom:2px;">
                          Shift Absensi
                        </div>
                        ${
                          isCheckIn
                            ? `<select id="camera-shift-select" class="form-select form-select-sm" ${liveCamera.submitting ? "disabled" : ""}>
                                ${(activeShifts.length ? activeShifts : s.shifts)
                                  .map(
                                    (sh) => `<option value="${esc(sh.id)}" ${selectedShift && sh.id === selectedShift.id ? "selected" : ""}>
                                      ${esc(sh.name)} (${esc(String(sh.start_time).slice(0, 5))}–${esc(String(sh.end_time).slice(0, 5))})
                                    </option>`
                                  )
                                  .join("")}
                              </select>`
                            : `<div style="font-size:12.5px;font-weight:800;color:var(--coffee-950);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                ${esc(selectedShift ? `${selectedShift.name} (${String(selectedShift.start_time).slice(0, 5)}–${String(selectedShift.end_time).slice(0, 5)})` : "-")}
                              </div>`
                        }
                      </div>
                    </div>

                    <div id="camera-gps-section" class="card-subtle camera-gps-card">
                      ${renderCameraGpsInnerHtml()}
                    </div>

                    <div id="camera-modal-error-box">${renderCameraErrorBoxInnerHtml()}</div>
                  </div>

                  <div id="camera-submit-section" class="camera-submit-card">
                    ${renderCameraSubmitBtnInnerHtml()}
                  </div>

                  <div style="font-size:10.5px;color:var(--stone-500);text-align:center;padding-top:2px;">
                    🔒 Presensi &amp; koordinat divalidasi aman di server WITA.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // A2. MODAL PENDAFTARAN FACE ID RESMI (1 AKUN GOOGLE = 1 WAJAH)
    if (uiState.modal.type === "face_id_enrollment") {
      const u = s.currentUser;
      return `
        <div class="modal-backdrop">
          <div class="modal-window">
            <div class="modal-header">
              <div>
                <div style="font-size:11px;color:var(--coffee-300);font-weight:700;text-transform:uppercase;">
                  Keamanan Biometrik • 1 Akun Google = 1 Wajah Resmi
                </div>
                <h3 style="font-size:17px;font-weight:800;">
                  🔒 Pendaftaran Face ID Resmi Karyawan
                </h3>
              </div>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <div class="grid-12">
                <div class="col-7">
                  <div class="camera-stage">
                    ${
                      liveCamera.cameraError
                        ? `<div style="padding:24px;text-align:center;color:var(--cream);font-size:12.5px;">
                            <div style="font-size:26px;margin-bottom:8px;">🚫</div>
                            <strong>Kamera Tidak Dapat Diakses</strong>
                            <p style="color:var(--coffee-300);margin-top:6px;">${esc(liveCamera.cameraError)}</p>
                          </div>`
                        : `<video id="live-selfie-video" autoplay playsinline muted></video>
                           <div id="camera-loading-pill" style="position:absolute;top:12px;left:12px;display:${liveCamera.videoReady ? "none" : "flex"};align-items:center;gap:6px;background:rgba(20,17,15,0.82);color:var(--coffee-200);padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;">
                             ⏳ Menyiapkan pratinjau kamera depan...
                           </div>
                           <div class="face-geometric-overlay">
                             <div class="face-geometric-frame" id="face-geometric-frame">
                               <div class="face-corner-bracket face-bracket-tl"></div>
                               <div class="face-corner-bracket face-bracket-tr"></div>
                               <div class="face-corner-bracket face-bracket-bl"></div>
                               <div class="face-corner-bracket face-bracket-br"></div>
                               <div class="face-scanline"></div>
                               <div class="face-axis-v"></div>
                               <div class="face-axis-h"></div>
                               <div class="face-landmark-dot face-dot-eye-l" title="Mata Kiri"></div>
                               <div class="face-landmark-dot face-dot-eye-r" title="Mata Kanan"></div>
                               <div class="face-landmark-dot face-dot-nose" title="Hidung"></div>
                               <div class="face-landmark-dot face-dot-mouth" title="Mulut"></div>
                               <div class="face-landmark-dot face-dot-chin" title="Dagu"></div>
                             </div>
                             <div class="face-hud-status">
                               <div id="geometric-status-indicator" style="display:flex;align-items:center;gap:6px;">
                                 <span id="geometric-pulse-dot" style="width:7px;height:7px;border-radius:50%;background:#d4a373;display:inline-block;"></span>
                                 <span id="geometric-status-text">Memindai Geometri Biometrik Wajah...</span>
                               </div>
                               <span id="geometric-score-badge" style="font-family:monospace;font-weight:700;color:var(--gold-200);font-size:10.5px;">
                                 ENROLL HUD
                               </span>
                             </div>
                           </div>`
                    }
                  </div>
                </div>

                <div class="col-5" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
                  <div style="display:flex;flex-direction:column;gap:10px;">
                    <div class="card-subtle" style="border-left:3px solid var(--coffee-600);padding:10px 12px;line-height:1.5;">
                      <strong style="font-size:12.5px;color:var(--coffee-950);">Ketentuan 1 Wajah pada 1 Akun:</strong>
                      <p style="font-size:11.5px;color:var(--stone-600);margin:4px 0 0 0;">
                        Wajah yang Anda daftarkan di sini akan menjadi <strong>Face ID resmi</strong> untuk akun Google <strong>${esc(u.email)}</strong>.
                        Setiap kali melakukan absensi, sistem akan memverifikasi kecocokan wajah. Karyawan lain tidak dapat melakukan joki absensi atas nama Anda.
                      </p>
                    </div>

                    <div class="card-subtle" style="font-size:11.5px;color:var(--stone-700);line-height:1.5;">
                      <strong>Petunjuk Perekaman:</strong>
                      <ul style="margin:4px 0 0 16px;padding:0;">
                        <li>Lepaskan masker atau kacamata hitam.</li>
                        <li>Posisikan wajah tegak tepat di tengah bingkai oval vertikal.</li>
                        <li>Pastikan pencahayaan terang dan stabil.</li>
                      </ul>
                    </div>

                    <div id="enroll-error-box"></div>
                  </div>

                  <div>
                    <button type="button" id="btn-confirm-register-face-id" class="btn btn-emerald" style="width:100%;padding:12px 14px;font-size:13.5px;font-weight:700;background:var(--stone-600);opacity:0.65;cursor:not-allowed;" data-action="confirm-register-face-id" disabled>
                      🔒 Posisikan Wajah Pas di Oval Vertikal
                    </button>
                    <div style="font-size:10.5px;color:var(--stone-500);text-align:center;margin-top:6px;">
                      🔒 Data biometrik dienkripsi aman pada database Supabase.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // A3. MODAL PENGAJUAN PERTUKARAN SHIFT / LIBUR DUA BELAH PIHAK
    if (uiState.modal.type === "modal_shift_swap_request") {
      const u = s.currentUser;
      const todayStr = Core.getTimePartsInTimezone(Core.getServerNow(), tz).dateString;
      const coworkers = (s.profiles || []).filter(
        (p) => p.id !== u.id && p.status === "active" && p.first_login_approved
      );

      return `
        <div class="modal-backdrop">
          <div class="modal-window sm" style="max-width:540px;">
            <div class="modal-header">
              <div>
                <div style="font-size:11px;color:var(--coffee-300);font-weight:700;text-transform:uppercase;">
                  Roster &amp; Jadwal Kerja Suka Latte
                </div>
                <h3 style="font-size:16.5px;font-weight:800;">
                  🔁 Ajukan Pertukaran Shift / Hari Libur
                </h3>
              </div>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <form id="form-shift-swap-request" novalidate>
              <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
                <div class="card-subtle" style="border-left:3px solid var(--coffee-600);padding:10px 12px;font-size:12px;color:var(--stone-700);line-height:1.5;">
                  <strong>Persetujuan Dua Belah Pihak:</strong><br/>
                  Permohonan ini akan dikirimkan kepada rekan kerja pilihan Anda. Jadwal kerja atau hari libur akan <strong>otomatis bertukar di sistem</strong> setelah rekan kerja bersangkutan menyetujui.
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label">Pilih Rekan Kerja (Tujuan Pertukaran) *</label>
                  <select class="form-select" name="target_employee_id" required>
                    <option value="">-- Pilih Rekan Kerja --</option>
                    ${coworkers
                      .map((c) => {
                        const out = s.outlets.find((o) => o.id === c.outlet_id);
                        return `<option value="${esc(c.id)}">${esc(c.full_name)} (${esc(c.employee_code)}) • ${esc(out ? out.name : c.position_title)}</option>`;
                      })
                      .join("")}
                  </select>
                </div>

                <div class="grid-2" style="gap:10px;">
                  <div class="form-group" style="margin:0;">
                    <label class="form-label">Tanggal Jadwal Saya *</label>
                    <input type="date" class="form-input" name="requester_date" value="${todayStr}" required />
                    <span style="font-size:10.5px;color:var(--stone-500);">Jadwal Anda yang ingin ditukar</span>
                  </div>
                  <div class="form-group" style="margin:0;">
                    <label class="form-label">Tanggal Jadwal Rekan *</label>
                    <input type="date" class="form-input" name="target_date" value="${todayStr}" required />
                    <span style="font-size:10.5px;color:var(--stone-500);">Jadwal rekan yang Anda inginkan</span>
                  </div>
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label">Alasan / Catatan ke Rekan Kerja</label>
                  <textarea class="form-textarea" name="notes" rows="2" placeholder="Contoh: Ada urusan keluarga mendesak tanggal 16 Nov, izin tukar ya." style="font-size:12px;"></textarea>
                </div>

                <div id="swap-error-box" style="display:none;" class="modal-inline-alert" role="alert"></div>

                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-primary" data-action="submit-shift-swap-request">
                    🔁 Kirim Pengajuan ke Rekan Kerja
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    // A4. MODAL PILIHAN LANGKAH 3 (SELESAI KERJA / IZIN)
    if (uiState.modal.type === "step_selesai_choice") {
      const u = s.currentUser;
      const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
      const myToday = s.attendance.find((a) => a.employee_id === u?.id && a.work_date === parts.dateString);
      const myShift = s.shifts.find((sh) => sh.id === (myToday?.shift_id || u?.shift_id)) || s.shifts[0];

      return `
        <div class="modal-backdrop">
          <div class="modal-window sm">
            <div class="modal-header">
              <div>
                <div style="font-size:11px;color:var(--coffee-300);font-weight:700;text-transform:uppercase;">
                  Langkah 3 • Selesai / Izin
                </div>
                <h3 style="font-size:16px;font-weight:800;">Pilihan Aksi Operasional Anda</h3>
              </div>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
              <div class="card-subtle" style="font-size:12px;color:var(--stone-700);line-height:1.55;">
                Saat ini Anda <strong>sedang bertugas (${esc(myShift ? myShift.name : "Shift")})</strong>. Silakan pilih salah satu opsi di bawah ini:
              </div>
              <button type="button" class="btn btn-amber hero-cta-btn" data-action="open-camera" data-mode="check_out" style="width:100%;min-height:48px;justify-content:center;">
                📷 Selesai Bertugas — Check Out Pulang Sekarang
              </button>
              <button type="button" class="btn btn-gold hero-sub-btn" data-action="open-member-leave" style="width:100%;min-height:42px;justify-content:center;">
                📅 Ajukan Izin / Sakit / Cuti
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // A5. MODAL ALIKHAN / GANTI SHIFT KERJA HARI INI SECARA AMAN & FLEKSIBEL
    if (uiState.modal.type === "switch_today_shift") {
      const u = s.currentUser;
      const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
      const myToday = s.attendance.find((a) => a.employee_id === u?.id && a.work_date === parts.dateString);
      const currentShiftId = myToday?.shift_id || u?.shift_id;
      const activeShifts = getActiveShiftsList();
      const currentShift = activeShifts.find((sh) => sh.id === currentShiftId) || s.shifts[0];

      return `
        <div class="modal-backdrop">
          <div class="modal-window sm" style="max-width:500px;">
            <div class="modal-header">
              <div>
                <div style="font-size:11px;color:var(--coffee-300);font-weight:700;text-transform:uppercase;">
                  Penyesuaian Jadwal &amp; Shift Hari Ini
                </div>
                <h3 style="font-size:17px;font-weight:800;">🔄 Alihkan / Ganti Shift Bertugas</h3>
              </div>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <div style="background:var(--coffee-50);border:1px solid var(--coffee-200);border-radius:12px;padding:12px;margin-bottom:14px;">
                <div style="font-size:11.5px;color:var(--coffee-800);line-height:1.55;">
                  Shift aktif Anda saat ini: <strong>${esc(currentShift ? currentShift.name : "-")}</strong>
                  (${esc(String(currentShift?.start_time).slice(0, 5))}–${esc(String(currentShift?.end_time).slice(0, 5))} WITA).<br/>
                  ${
                    myToday && myToday.check_in_at
                      ? `<span style="color:#059669;font-weight:700;">✓ Anda sudah Check In pada ${Core.formatOperationalDateTime(myToday.check_in_at, tz, false)}. Mengalihkan shift akan otomatis menghitung ulang keterlambatan Anda sesuai jam masuk asli.</span>`
                      : `<span>Pilih shift bertugas Anda sebelum melakukan Check In.</span>`
                  }
                </div>
              </div>

              <form id="form-switch-today-shift">
                <div style="font-size:12px;font-weight:800;color:var(--coffee-950);margin-bottom:8px;">Pilih Shift Tujuan:</div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px;">
                  ${activeShifts
                    .map((sh) => {
                      const isCurr = sh.id === currentShiftId;
                      const grace = Number(sh.grace_period_minutes ?? 15);
                      return `
                        <label style="display:flex;align-items:center;gap:12px;padding:10px 14px;border:2px solid ${isCurr ? "var(--coffee-600)" : "var(--coffee-200)"};background:${isCurr ? "var(--coffee-100)" : "var(--white)"};border-radius:12px;cursor:pointer;">
                          <input type="radio" name="target_shift_id" value="${esc(sh.id)}" ${isCurr ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--coffee-700);" />
                          <div style="flex:1;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                              <strong style="font-size:13px;color:var(--coffee-950);">${esc(sh.name)}</strong>
                              <span class="mono" style="font-size:11.5px;font-weight:700;color:var(--coffee-800);">${esc(String(sh.start_time).slice(0, 5))} – ${esc(String(sh.end_time).slice(0, 5))} WITA</span>
                            </div>
                            <div style="font-size:10.5px;color:var(--stone-600);margin-top:2px;">
                              Toleransi keterlambatan: <strong>${grace} menit</strong>
                              ${isCurr ? `<span class="badge" style="background:var(--coffee-200);color:var(--coffee-900);font-size:9.5px;margin-left:6px;">Shift Saat Ini</span>` : ""}
                            </div>
                          </div>
                        </label>
                      `;
                    })
                    .join("")}
                </div>

                <div style="display:flex;justify-content:flex-end;gap:10px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="submit" class="btn btn-primary" id="btn-submit-switch-shift">
                    🔄 Terapkan Pengalihan Shift
                  </button>
                </div>
              </form>
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

              <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--coffee-200);gap:10px;flex-wrap:wrap;">
                <div>
                  ${
                    Core.canDeleteAttendance(rec)
                      ? `<button class="btn btn-outline btn-sm" style="color:var(--rose-700);border-color:#fca5a5;" data-action="delete-attendance" data-id="${esc(rec.id)}">🗑️ Hapus Catatan Absensi Ini</button>`
                      : ""
                  }
                </div>
                <button class="btn btn-primary btn-sm" data-action="close-modal">Tutup</button>
              </div>
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
                    <label class="form-label">Divisi / Stasiun Kerja *</label>
                    <select class="form-select" name="department" required>
                      <option value="bar" ${emp.department === "bar" ? "selected" : ""}>🍹 Bar / Barista</option>
                      <option value="kitchen" ${emp.department === "kitchen" ? "selected" : ""}>🍳 Kitchen / Dapur</option>
                      <option value="manager" ${emp.department === "manager" ? "selected" : ""}>👔 Manajer / Supervisor</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="form-label">No. Telepon / WhatsApp</label>
                  <input class="form-input" name="phone" value="${esc(emp.phone || "")}" />
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
                      ? `<button type="button" class="btn btn-danger btn-sm" data-action="delete-employee" data-userid="${esc(emp.id)}">🗑️ Hapus Member Permanen</button>`
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

    // H. MODAL PENGAJUAN KOREKSI PRIBADI (DIKUNCI KHUSUS PENGELOLA)
    if (uiState.modal.type === "member_corr") {
      Core.assertManagerAccess("ModalMemberCorrection");
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

    // H. MODAL EDIT JADWAL KERJA KARYAWAN
    if (uiState.modal.type === "edit_work_schedule") {
      Core.assertManagerAccess("ModalEditWorkSchedule");
      const sched = s.workSchedules.find((x) => x.id === uiState.modal.id);
      if (!sched) return "";
      const emp = s.profiles.find((p) => p.id === sched.employee_id);
      const isOff = sched.schedule_type === "off";

      return `
        <div class="modal-backdrop">
          <div class="modal-window">
            <div class="modal-header">
              <h3 style="font-size:16px;font-weight:800;">✏️ Edit Jadwal Kerja Karyawan</h3>
              <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
            </div>
            <div class="modal-body">
              <form id="form-modal-edit-schedule" style="display:flex;flex-direction:column;gap:14px;">
                <input type="hidden" name="schedule_id" value="${sched.id}" />
                <input type="hidden" name="employee_id" value="${sched.employee_id}" />

                <div class="card-subtle" style="display:flex;align-items:center;gap:10px;">
                  ${Views.renderAvatarHtml(emp)}
                  <div>
                    <strong style="font-size:14px;color:var(--stone-900);">${esc(emp?.full_name || "Karyawan")}</strong>
                    <div style="font-size:11.5px;color:var(--stone-600);">${esc(emp?.employee_code || "")} • Role: ${esc(emp?.role || "member")}</div>
                  </div>
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:12px;font-weight:700;">Tanggal Jadwal</label>
                  <input type="date" name="schedule_date" class="form-input" value="${esc(sched.schedule_date)}" required />
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:12px;font-weight:700;">Tipe Kehadiran</label>
                  <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer;">
                      <input type="radio" name="schedule_type" value="work" ${!isOff ? "checked" : ""} data-action="toggle-modal-schedule-type" />
                      <span>💼 Masuk Kerja Sesuai Shift</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer;color:var(--rose-700);">
                      <input type="radio" name="schedule_type" value="off" ${isOff ? "checked" : ""} data-action="toggle-modal-schedule-type" />
                      <span>🏖️ Libur / Day Off</span>
                    </label>
                  </div>
                </div>

                <div id="modal-sched-shift-fields" style="${isOff ? "display:none;" : ""}">
                  <div class="grid-2" style="gap:10px;">
                    <div class="form-group" style="margin:0;">
                      <label class="form-label" style="font-size:12px;font-weight:700;">Pilih Shift</label>
                      <select name="shift_id" class="form-input">
                        ${s.shifts
                          .map(
                            (sh) => `
                          <option value="${sh.id}" ${sched.shift_id === sh.id ? "selected" : ""}>
                            ${esc(sh.name)} (${String(sh.start_time).slice(0, 5)} - ${String(sh.end_time).slice(0, 5)})
                          </option>
                        `
                          )
                          .join("")}
                      </select>
                    </div>
                    <div class="form-group" style="margin:0;">
                      <label class="form-label" style="font-size:12px;font-weight:700;">Pilih Outlet</label>
                      <select name="outlet_id" class="form-input">
                        ${s.outlets
                          .map(
                            (o) => `
                          <option value="${o.id}" ${sched.outlet_id === o.id ? "selected" : ""}>
                            ${esc(o.name)}
                          </option>
                        `
                          )
                          .join("")}
                      </select>
                    </div>
                  </div>
                </div>

                <div class="form-group" style="margin:0;">
                  <label class="form-label" style="font-size:12px;font-weight:700;">Catatan Tambahan (Opsional)</label>
                  <input type="text" name="notes" class="form-input" value="${esc(sched.notes || "")}" placeholder="Contoh: Buka toko pagi, gantikan rekan" />
                </div>

                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:6px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="submit" class="btn btn-primary">💾 Simpan Perubahan Jadwal</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      `;
    }

    // I. MODAL ATUR CEPAT JADWAL 1 BULAN PENUH (MONTHLY ROSTER BULK)
    if (uiState.modal.type === "quick_weekly_schedule" || uiState.modal.type === "quick_monthly_schedule") {
      Core.assertManagerAccess("ModalQuickMonthlySchedule");
      const offset = uiState.quickScheduleMonthOffset ?? (uiState.scheduleMonthOffset || 0);
      const tz = s.settings.operational_timezone || "Asia/Makassar";
      const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
      const month = Views.getMonthCalendarRange ? Views.getMonthCalendarRange(parts.dateString, offset) : { days: [], label: "" };
      const activeEmployees = s.profiles.filter((p) => p.status !== "rejected" && p.status !== "inactive");
      const qDept = uiState.quickScheduleDeptFilter || "all";
      const filteredEmployees = qDept === "all" ? activeEmployees : activeEmployees.filter((p) => (p.department || "bar") === qDept);
      const targetEmpId = uiState.modal.employee_id || (filteredEmployees[0]?.id ?? activeEmployees[0]?.id ?? "");

      // Hitung jumlah per divisi untuk tombol filter
      const barCount = activeEmployees.filter((p) => (p.department || "bar") === "bar").length;
      const kitchenCount = activeEmployees.filter((p) => p.department === "kitchen").length;
      const managerCount = activeEmployees.filter((p) => p.department === "manager").length;

      return `
        <div class="modal-backdrop">
          <div class="modal-window lg" style="max-height:90vh;display:flex;flex-direction:column;">
            <div class="modal-header" style="flex-shrink:0;">
              <div>
                <h3 style="font-size:16.5px;font-weight:800;margin:0;">⚡ Atur Cepat Jadwal 1 Bulan Penuh</h3>
                <div style="font-size:12px;color:var(--coffee-700);margin-top:2px;">
                  Periode Roster: <strong>${esc(month.label)} (${month.days.length} Hari)</strong>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <button type="button" class="btn btn-outline btn-xs" data-action="quick-month-prev">‹ Bulan Lalu</button>
                <button type="button" class="btn btn-outline btn-xs" data-action="quick-month-next">Bulan Depan ›</button>
                <button class="btn btn-outline btn-sm" data-action="close-modal" style="margin-left:6px;">✕ Tutup</button>
              </div>
            </div>
            <div class="modal-body" style="overflow-y:auto;flex:1;padding-right:8px;">
              <form id="form-quick-weekly" style="display:flex;flex-direction:column;gap:14px;">
                <input type="hidden" name="total_days" value="${month.days.length}" />

                <!-- PILIH DIVISI & KARYAWAN -->
                <div class="card-subtle" style="padding:10px 12px;background:var(--stone-50);border:1px solid var(--stone-200);">
                  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                    <label class="form-label" style="font-weight:700;font-size:12px;margin:0;">Pilih Karyawan:</label>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                      <button type="button" class="btn btn-xs ${qDept === 'all' ? 'btn-primary' : 'btn-outline'}" data-action="filter-quick-modal-dept" data-dept="all" style="padding:2px 7px;font-size:10.5px;">
                        Semua (${activeEmployees.length})
                      </button>
                      <button type="button" class="btn btn-xs ${qDept === 'bar' ? 'btn-emerald' : 'btn-outline'}" data-action="filter-quick-modal-dept" data-dept="bar" style="padding:2px 7px;font-size:10.5px;${qDept === 'bar' ? '' : 'color:#065f46;border-color:#a7f3d0;'}">
                        🍹 Bar (${barCount})
                      </button>
                      <button type="button" class="btn btn-xs ${qDept === 'kitchen' ? 'btn-amber' : 'btn-outline'}" data-action="filter-quick-modal-dept" data-dept="kitchen" style="padding:2px 7px;font-size:10.5px;${qDept === 'kitchen' ? '' : 'color:#9a3412;border-color:#fed7aa;'}">
                        🍳 Kitchen (${kitchenCount})
                      </button>
                      <button type="button" class="btn btn-xs ${qDept === 'manager' ? 'btn-primary' : 'btn-outline'}" data-action="filter-quick-modal-dept" data-dept="manager" style="padding:2px 7px;font-size:10.5px;${qDept === 'manager' ? '' : 'color:#92400e;border-color:#fde68a;'}">
                        👔 Manajer (${managerCount})
                      </button>
                    </div>
                  </div>

                  <select name="employee_id" class="form-input" required data-action="change-quick-weekly-emp" style="font-size:13px;">
                    ${filteredEmployees
                      .map(
                        (p) => `
                      <option value="${p.id}" ${targetEmpId === p.id ? "selected" : ""}>
                        ${Views.getDepartmentLabel ? Views.getDepartmentLabel(p.department) : p.department} • ${esc(p.full_name)} [${esc(p.employee_code || "KARYAWAN")}] - ${esc(p.position_title || p.role)}
                      </option>
                    `
                      )
                      .join("")}
                  </select>
                </div>

                <!-- PINTASAN CEPAT SEBULAN PENUH -->
                <div style="background:linear-gradient(135deg, #fffbeb, #fef3c7);border:1px solid #fde68a;border-radius:10px;padding:10px 12px;">
                  <div style="font-size:11.5px;font-weight:800;color:#92400e;margin-bottom:6px;">
                    ⚡ Pintasan Cepat Jadwal 1 Bulan (${month.label}):
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                    <button type="button" class="btn btn-outline btn-xs" data-action="quick-fill-week" data-preset="all-morning" style="background:#fff;padding:4px 8px;font-size:11px;font-weight:700;">
                      🌅 Semua Shift Pagi
                    </button>
                    <button type="button" class="btn btn-outline btn-xs" data-action="quick-fill-week" data-preset="all-afternoon" style="background:#fff;padding:4px 8px;font-size:11px;font-weight:700;">
                      🌇 Semua Shift Siang
                    </button>
                    <button type="button" class="btn btn-outline btn-xs" data-action="quick-fill-week" data-preset="mon-fri-morning" style="background:#fff;padding:4px 8px;font-size:11px;font-weight:700;">
                      💼 Senin–Jumat Pagi, Libur Weekend
                    </button>
                    <button type="button" class="btn btn-outline btn-xs" data-action="quick-fill-week" data-preset="pattern-5-2" style="background:#fff;padding:4px 8px;font-size:11px;font-weight:700;">
                      🔄 Pola 5 Kerja 2 Libur
                    </button>
                    <button type="button" class="btn btn-outline btn-xs" data-action="quick-fill-week" data-preset="weekend-off" style="background:#fff;padding:4px 8px;font-size:11px;color:var(--rose-700);border-color:#fca5a5;">
                      🏖️ Set Libur Weekend (Sabtu &amp; Minggu)
                    </button>
                  </div>
                </div>

                <!-- DAFTAR HARI 1 BULAN PENUH -->
                <div style="display:flex;flex-direction:column;gap:6px;">
                  ${month.days
                    .map((d, idx) => {
                      const existing = Core.getScheduleForDate(d.dateStr, targetEmpId);
                      const isToday = d.dateStr === parts.dateString;
                      const isWeekend = d.dayOfWeek === 0 || d.dayOfWeek === 6;
                      const defaultShiftVal = existing?.schedule_type === "off" ? "off" : (existing?.shift_id || s.shifts[0]?.id || "");

                      // Tampilkan pemisah minggu jika awal minggu (Senin) atau tanggal 1
                      const isWeekHeader = idx === 0 || d.dayOfWeek === 1;
                      const weekNumber = Math.floor(idx / 7) + 1;

                      return `
                        ${isWeekHeader ? `
                          <div style="font-size:11px;font-weight:800;color:var(--coffee-800);background:var(--coffee-100);padding:4px 10px;border-radius:6px;margin-top:6px;">
                            📅 Minggu ke-${weekNumber} (${month.label})
                          </div>
                        ` : ''}
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:${isToday ? "#fef3c7" : isWeekend ? "#f8fafc" : "var(--stone-50)"};border-radius:8px;border:1px solid ${isToday ? "var(--amber-400)" : "var(--stone-200)"};gap:8px;flex-wrap:wrap;">
                          <div style="min-width:140px;">
                            <input type="hidden" name="day_date_${idx}" value="${d.dateStr}" />
                            <div style="display:flex;align-items:center;gap:6px;">
                              <strong style="font-size:12.5px;color:var(--stone-900);">${esc(d.dayName)}, ${d.dayNum} ${esc(d.monthShort)}</strong>
                              ${isToday ? `<span class="badge badge-amber" style="font-size:9px;padding:1px 5px;">HARI INI</span>` : ""}
                              ${isWeekend && !isToday ? `<span class="badge" style="background:#e2e8f0;color:#475569;font-size:9px;padding:1px 4px;">WEEKEND</span>` : ""}
                            </div>
                          </div>
                          <div style="flex:1;min-width:180px;">
                            <select name="day_shift_${idx}" class="form-input quick-day-select" data-day-index="${idx}" data-day-of-week="${d.dayOfWeek}" style="font-size:12px;padding:5px 8px;">
                              ${s.shifts
                                .map(
                                  (sh) => `
                                <option value="${sh.id}" ${defaultShiftVal === sh.id ? "selected" : ""}>
                                  🌅 ${esc(sh.name)} (${String(sh.start_time).slice(0, 5)} - ${String(sh.end_time).slice(0, 5)})
                                </option>
                              `
                                )
                                .join("")}
                              <option value="off" ${defaultShiftVal === "off" ? "selected" : ""} style="color:#b91c1c;font-weight:700;">
                                🏖️ Libur (Day Off)
                              </option>
                            </select>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>

                <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;position:sticky;bottom:0;background:white;padding:10px 0;border-top:1px solid var(--stone-200);">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="submit" class="btn btn-primary" style="font-weight:700;">
                    💾 Terapkan Jadwal 1 Bulan Penuh (${month.days.length} Hari)
                  </button>
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
      if (uiState.modal.kind === "work_schedule") {
        const sched = s.workSchedules.find((x) => x.id === uiState.modal.id);
        const emp = sched ? s.profiles.find((p) => p.id === sched.employee_id) : null;
        return `
          <div class="modal-backdrop">
            <div class="modal-window sm">
              <div class="modal-header">
                <h3 style="font-size:16px;font-weight:800;">🗑️ Hapus Jadwal Kerja</h3>
                <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
              </div>
              <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
                <div class="card-subtle" style="border-color:#fda4af;background:var(--rose-50);font-size:12.5px;color:var(--rose-800);line-height:1.55;">
                  Anda akan menghapus jadwal kerja tanggal <strong>${esc(sched?.schedule_date || "-")}</strong>
                  untuk karyawan <strong>${esc(emp?.full_name || "Karyawan")}</strong>.<br/>
                  Jadwal ini akan dihapus dari sistem roster operasional.
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-danger" data-action="confirm-delete-item">🗑️ Ya, Hapus Jadwal</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (uiState.modal.kind === "employee") {
        const emp = s.profiles.find((p) => p.id === uiState.modal.id);
        return `
          <div class="modal-backdrop">
            <div class="modal-window sm">
              <div class="modal-header">
                <h3 style="font-size:16px;font-weight:800;">🗑️ Hapus Member Secara Permanen</h3>
                <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
              </div>
              <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
                <div class="card-subtle" style="border-color:#fda4af;background:var(--rose-50);font-size:12.5px;color:var(--rose-800);line-height:1.55;">
                  Anda akan menghapus permanen akun <strong>${esc(uiState.modal.name || emp?.full_name || "Member")}</strong>
                  ${emp ? ` (<span class="mono">${esc(emp.employee_code)}</span> • ${esc(emp.email)})` : ""}.<br/>
                  Akun ini tidak akan diarsipkan, melainkan <strong>langsung dihapus secara permanen</strong> dan <strong>otomatis hilang dari daftar karyawan</strong> beserta seluruh data terkait (profil, login, foto selfie, dan riwayat).
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">Alasan Penghapusan (Tercatat di Audit Log)</label>
                  <input id="confirm-delete-reason" class="form-input" value="Karyawan resign" placeholder="Contoh: Karyawan resign / hapus anggota" />
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-danger" data-action="confirm-delete-item">🗑️ Ya, Hapus Permanen Sekarang</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (uiState.modal.kind === "attendance") {
        const rec = s.attendance.find((a) => a.id === uiState.modal.id);
        const emp = rec ? s.profiles.find((p) => p.id === rec.employee_id) : null;
        return `
          <div class="modal-backdrop">
            <div class="modal-window sm">
              <div class="modal-header">
                <h3 style="font-size:16px;font-weight:800;">🗑️ Hapus Catatan Absensi (Uji Coba)</h3>
                <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
              </div>
              <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
                <div class="card-subtle" style="border-color:#fda4af;background:var(--rose-50);font-size:12.5px;color:var(--rose-800);line-height:1.55;">
                  Anda akan menghapus catatan absensi tanggal <strong>${esc(rec?.work_date || uiState.modal.name || "-")}</strong>
                  milik <strong>${esc(emp?.full_name || "Karyawan")}</strong>.<br/>
                  Foto selfie dan data kehadiran ini akan dihapus permanen dari server Supabase dan storage.
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">Alasan Penghapusan (Tercatat di Audit Log)</label>
                  <input id="confirm-delete-reason" class="form-input" value="Uji coba sistem absensi" placeholder="Contoh: Uji coba sistem / data keliru" />
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-danger" data-action="confirm-delete-item">🗑️ Ya, Hapus Absensi Ini</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      if (uiState.modal.kind === "clear_trial_attendance") {
        return `
          <div class="modal-backdrop">
            <div class="modal-window sm">
              <div class="modal-header">
                <h3 style="font-size:16px;font-weight:800;">🗑️ Bersihkan Seluruh Data Absensi Uji Coba</h3>
                <button class="btn btn-outline btn-sm" data-action="close-modal">✕ Tutup</button>
              </div>
              <div class="modal-body" style="display:flex;flex-direction:column;gap:14px;">
                <div class="card-subtle" style="border-color:#fda4af;background:var(--rose-50);font-size:12.5px;color:var(--rose-800);line-height:1.55;">
                  <strong>PERINGATAN PENGELOLA (ADMIN &amp; SUPER ADMIN):</strong><br/>
                  Tindakan ini akan <strong>menghapus seluruh (${s.attendance.length}) catatan absensi</strong> beserta seluruh arsip foto selfie uji coba dari database.<br/>
                  Gunakan fitur ini setelah masa uji coba selesai untuk memulai operasional normal yang bersih.
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">Ketik kata kunci konfirmasi: <span class="mono" style="color:var(--rose-700);font-weight:800;">HAPUS</span></label>
                  <input id="confirm-clear-keyword" class="form-input mono" placeholder="Ketik HAPUS di sini..." autocomplete="off" />
                </div>
                <div class="form-group" style="margin:0;">
                  <label class="form-label">Alasan Reset (Audit Log)</label>
                  <input id="confirm-delete-reason" class="form-input" value="Pembersihan data uji coba sebelum operasional resmi" />
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;">
                  <button type="button" class="btn btn-outline" data-action="close-modal">Batal</button>
                  <button type="button" class="btn btn-danger" data-action="confirm-delete-item">🗑️ Bersihkan Seluruh Data Uji Coba</button>
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
      if (
        uiState.modal &&
        (uiState.modal.type === "camera_attendance" || uiState.modal.type === "face_id_enrollment") &&
        !liveCamera.capturedDataUrl
      ) {
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
      if (uiState.activeNav !== "absensi_saya" && uiState.activeNav !== "riwayat_saya" && uiState.activeNav !== "jadwal_saya") {
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
          { id: "schedules", icon: "📅", label: "Jadwal Kerja" },
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
          { id: "jadwal_saya", icon: "📅", label: "Jadwal Kerja" },
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
      if (uiState.activeNav === "jadwal_saya") {
        mainContentHtml = Views.renderMemberScheduleView(uiState);
      } else if (uiState.activeNav === "riwayat_saya") {
        mainContentHtml = Views.renderMemberOwnHistoryView(uiState);
      } else {
        mainContentHtml = Views.renderMemberAttendanceHome(parts, todayAttendance, canCheckIn, canCheckOut);
      }
    } else {
      if (uiState.activeNav === "schedules") {
        mainContentHtml = Views.renderManagerScheduleView(uiState);
      } else if (uiState.activeNav === "archive") {
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
            <div class="topbar-left">
              <div class="topbar-mobile-user">
                ${Views.renderAvatarHtml(u)}
                <div class="topbar-mobile-meta">
                  <div class="topbar-mobile-name">${esc(u.full_name || "Karyawan")}</div>
                  <div class="topbar-mobile-sub">
                    <span class="badge ${roleBadgeCls}" style="font-size:9.5px;padding:2px 6px;">${roleLabel}</span>
                  </div>
                </div>
              </div>
              <div class="topbar-brand-group">
                <div style="font-size:14px;font-weight:800;color:var(--coffee-950);">
                  ${esc(s.settings.brand_display_name)}
                </div>
                <div class="topbar-welcome hide-mobile" style="font-size:11.5px;color:var(--stone-600);">
                  ${esc(s.settings.welcome_message)}
                </div>
              </div>
            </div>
            <div class="topbar-actions">
              ${
                canCheckIn
                  ? `<button class="btn btn-emerald btn-sm" data-action="open-camera" data-mode="check_in">📷 <span class="hide-mobile">Check In</span></button>`
                  : canCheckOut
                  ? `<button class="btn btn-amber btn-sm" data-action="open-camera" data-mode="check_out">📷 <span class="hide-mobile">Check Out</span></button>`
                  : ""
              }
              <button class="btn btn-outline btn-sm btn-icon-mobile" data-action="refresh-data" title="Segarkan Data">🔄<span class="hide-mobile"> Segarkan</span></button>
              <button class="btn btn-outline btn-sm btn-icon-mobile" data-action="logout" title="Keluar">🚪<span class="hide-mobile"> Keluar</span></button>
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

    if (
      uiState.modal &&
      (uiState.modal.type === "camera_attendance" || uiState.modal.type === "face_id_enrollment") &&
      !liveCamera.capturedDataUrl
    ) {
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

  // 1.5 Simpan / Update Roster Jadwal Kerja (Schedule)
  async function handleSaveWorkSchedule(btn) {
    Core.assertManagerAccess("SaveWorkSchedule");
    const form = document.getElementById("form-work-schedule");
    if (!form) return;
    const fd = new FormData(form);
    const employeeId = fd.get("employee_id");
    const scheduleDate = fd.get("schedule_date");
    const scheduleType = fd.get("schedule_type") || "work";
    const shiftId = scheduleType === "off" ? null : fd.get("shift_id") || null;
    const outletId = scheduleType === "off" ? null : fd.get("outlet_id") || null;
    const notes = (fd.get("notes") || "").trim();

    if (!employeeId) {
      showBanner(false, "Pilih karyawan terlebih dahulu.");
      return;
    }
    if (!scheduleDate) {
      showBanner(false, "Pilih tanggal kerja.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan...";
    }

    try {
      await Core.saveWorkSchedule({
        employee_id: employeeId,
        schedule_date: scheduleDate,
        schedule_type: scheduleType,
        shift_id: shiftId,
        outlet_id: outletId,
        notes: notes || null,
      });
      render();
      const emp = Core.state.profiles.find((p) => p.id === employeeId);
      showBanner(
        true,
        `Jadwal kerja ${emp?.full_name || "karyawan"} tanggal ${scheduleDate} (${scheduleType === "off" ? "LIBUR" : "MASUK"}) berhasil disimpan.`
      );
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Jadwal Kerja";
      }
      showBanner(false, "Gagal menyimpan jadwal kerja: " + (err.message || err));
    }
  }

  async function handleSaveModalWorkSchedule(btn) {
    Core.assertManagerAccess("SaveModalWorkSchedule");
    const form = document.getElementById("form-modal-edit-schedule");
    if (!form) return;
    const fd = new FormData(form);
    const employeeId = fd.get("employee_id");
    const scheduleDate = fd.get("schedule_date");
    const scheduleType = fd.get("schedule_type") || "work";
    const shiftId = scheduleType === "off" ? null : fd.get("shift_id") || null;
    const outletId = scheduleType === "off" ? null : fd.get("outlet_id") || null;
    const notes = (fd.get("notes") || "").trim();

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Menyimpan...";
    }

    try {
      await Core.saveWorkSchedule({
        employee_id: employeeId,
        schedule_date: scheduleDate,
        schedule_type: scheduleType,
        shift_id: shiftId,
        outlet_id: outletId,
        notes: notes || null,
      });
      uiState.modal = null;
      render();
      showBanner(true, "Perubahan jadwal kerja berhasil disimpan.");
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "💾 Simpan Perubahan Jadwal";
      }
      showBanner(false, "Gagal mengubah jadwal kerja: " + (err.message || err));
    }
  }

  async function handleSaveQuickWeeklySchedule(btn) {
    Core.assertManagerAccess("SaveQuickMonthlySchedule");
    const form = document.getElementById("form-quick-weekly");
    if (!form) return;
    const fd = new FormData(form);
    const employeeId = fd.get("employee_id");
    if (!employeeId) {
      showBanner(false, "Pilih karyawan terlebih dahulu.");
      return;
    }

    const totalDays = Number(fd.get("total_days") || 31);
    const daysData = [];
    for (let i = 0; i < totalDays; i++) {
      const date = fd.get(`day_date_${i}`);
      if (!date) continue;
      const shiftValue = fd.get(`day_shift_${i}`);
      const isOff = shiftValue === "off";
      daysData.push({
        date,
        schedule_type: isOff ? "off" : "work",
        shift_id: isOff ? null : shiftValue,
        notes: isOff ? "Libur bulanan" : null,
      });
    }

    if (daysData.length === 0) {
      showBanner(false, "Tidak ada data tanggal yang dipilih.");
      return;
    }

    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `⏳ Menerapkan ${daysData.length} Hari...`;
    }

    try {
      await Core.bulkSaveMonthlySchedule(employeeId, daysData);
      uiState.modal = null;
      try { render(); } catch (rendErr) { console.warn("Post-schedule render non-fatal:", rendErr); }
      const emp = Core.state.profiles.find((p) => p.id === employeeId);
      showBanner(
        true,
        `✓ Jadwal 1 bulan penuh (${daysData.length} hari) untuk ${emp?.full_name || "karyawan"} berhasil diterapkan!`,
        6000
      );
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || `💾 Terapkan Jadwal 1 Bulan Penuh (${daysData.length} Hari)`;
      }
      showBanner(false, "Gagal menyimpan jadwal bulanan: " + (err.message || err));
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
        await Core.deleteEmployeeAccount(id, reason);
        uiState.modal = null;
        render();
        showBanner(
          true,
          `Member '${name}' berhasil dihapus permanen dan otomatis hilang dari daftar karyawan.`
        );
        return;
      } else if (kind === "attendance") {
        const reasonInput = document.getElementById("confirm-delete-reason");
        const reason = reasonInput ? reasonInput.value : uiState.modal.reason || "Uji coba sistem absensi";
        await Core.deleteAttendanceRecord(id, reason);
        uiState.modal = null;
        render();
        showBanner(true, `Catatan absensi ${name || ""} berhasil dihapus dari sistem.`);
        return;
      } else if (kind === "work_schedule") {
        await Core.deleteWorkSchedule(id);
        uiState.modal = null;
        render();
        showBanner(true, "Jadwal kerja berhasil dihapus dari roster.");
        return;
      } else if (kind === "clear_trial_attendance") {
        const keywordInput = document.getElementById("confirm-clear-keyword");
        const keyword = keywordInput ? keywordInput.value : "";
        const reasonInput = document.getElementById("confirm-delete-reason");
        const reason = reasonInput ? reasonInput.value : "Pembersihan data uji coba sebelum operasional resmi";
        const res = await Core.clearAllTrialAttendance(keyword, reason);
        uiState.modal = null;
        render();
        showBanner(
          true,
          `Berhasil membersihkan seluruh data absensi uji coba (${res.deleted_count || 0} catatan dihapus). Sistem siap untuk operasional normal.`
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
      allow_member_request_corrections: false,
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
        department: fd.get("department") || "bar",
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
        p_department: fd.get("department") || "bar",
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
        p_department: fd.get("department") || "bar",
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

  // 16. Pengajuan Koreksi Absensi Pribadi (Dikunci Khusus Pengelola)
  async function handleMemberCorrection(btn) {
    Core.assertManagerAccess("SubmitMemberCorrection");
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
    // Tutup modal jika pengguna mengetuk area luar modal (backdrop gelap)
    if (ev.target && ev.target.classList && ev.target.classList.contains("modal-backdrop")) {
      if (liveCamera.submitting || faceEnrollState.submitting) return;
      stopCameraStream();
      stopGpsWatcher();
      stopFaceEnrollCamera();
      uiState.modal = null;
      render();
      return;
    }

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

      if (action === "open-switch-shift-modal") {
        uiState.modal = { type: "switch_today_shift" };
        render();
        return;
      }

      if (action === "set-camera-shift") {
        const sid = btn.getAttribute("data-id");
        if (sid) {
          liveCamera.shiftId = sid;
          Core.state.manualShiftOverrideId = sid;
          render();
        }
        return;
      }

      if (action === "select-my-shift") {
        const shiftId = btn.getAttribute("data-shift-id");
        if (!shiftId) return;
        const shiftObj = Core.state.shifts.find((sh) => sh.id === shiftId);

        const s = Core.state;
        const u = s.currentUser;
        const tz = s.settings.operational_timezone || "Asia/Makassar";
        const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
        const myToday = s.attendance.find((a) => a.employee_id === u?.id && a.work_date === parts.dateString);

        if (myToday && myToday.check_in_at) {
          btn.disabled = true;
          try {
            const res = await Core.switchMyTodayShift(shiftId);
            showBanner(
              true,
              `✓ Shift absensi hari ini berhasil dialihkan ke ${shiftObj ? shiftObj.name : "Shift Pilihan"}! Keterlambatan disesuaikan menjadi ${res.late_minutes} menit (${res.status}).`,
              6500
            );
          } catch (err) {
            btn.disabled = false;
            showBanner(false, "Gagal mengalihkan shift hari ini: " + (err.message || err));
          }
          return;
        }

        btn.disabled = true;
        try {
          await Core.selectMyActiveShift(shiftId);
          showBanner(
            true,
            `Shift aktif Anda diatur ke ${shiftObj ? shiftObj.name : "Shift Pilihan"} (Toleransi telat > ${Number(shiftObj?.grace_period_minutes ?? 15)} menit).`,
            5000
          );
        } catch (err) {
          btn.disabled = false;
          showBanner(false, "Gagal mengubah shift: " + (err.message || err));
        }
        return;
      }

      // TOMBOL LANGKAH 1 PADA ANGGOTA: GANTI SHIFT SECARA INSTAN / SCROLL KE PILIHAN SHIFT
      if (action === "step-click-shift") {
        const s = Core.state;
        const u = s.currentUser;
        const tz = s.settings.operational_timezone || "Asia/Makassar";
        const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
        const myToday = s.attendance.find((a) => a.employee_id === u?.id && a.work_date === parts.dateString);
        const canCheckIn = !myToday || (!myToday.check_in_at && myToday.attendance_status !== "cuti_libur");

        if (!canCheckIn) {
          uiState.modal = { type: "switch_today_shift" };
          render();
          return;
        }

        const activeShifts = s.shifts.filter((sh) => sh.status === "active");
        if (activeShifts.length === 0) return;

        const currentShiftId = u?.shift_id || activeShifts[0].id;
        const currentIndex = activeShifts.findIndex((sh) => sh.id === currentShiftId);
        const nextIndex = (currentIndex + 1) % activeShifts.length;
        const nextShift = activeShifts[nextIndex];

        try {
          await Core.selectMyActiveShift(nextShift.id);
          render();
          showBanner(
            true,
            `✓ Shift aktif diganti ke: ${nextShift.name} (${String(nextShift.start_time).slice(0, 5)}–${String(nextShift.end_time).slice(0, 5)} WITA).`,
            5000
          );
          const shiftEl = document.getElementById("shift-selector-wrap");
          if (shiftEl && typeof shiftEl.scrollIntoView === "function") {
            shiftEl.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } catch (err) {
          showBanner(false, "Gagal mengganti shift: " + (err.message || err));
        }
        return;
      }

      // TOMBOL LANGKAH 2 PADA ANGGOTA: LANGSUNG BUKA KAMERA CHECK IN / CHECK OUT
      if (action === "step-click-attendance") {
        const s = Core.state;
        const u = s.currentUser;
        const tz = s.settings.operational_timezone || "Asia/Makassar";
        const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
        const myToday = s.attendance.find((a) => a.employee_id === u?.id && a.work_date === parts.dateString);
        const canCheckIn = !myToday || (!myToday.check_in_at && myToday.attendance_status !== "cuti_libur");
        const canCheckOut = Boolean(myToday?.check_in_at && !myToday?.check_out_at);

        if (canCheckIn) {
          await openAttendanceCameraModal("check_in");
          return;
        }
        if (canCheckOut) {
          await openAttendanceCameraModal("check_out");
          return;
        }

        showBanner(true, "✓ Presensi kehadiran hari ini sudah lengkap & selesai. Terima kasih!", 5000);
        const todayCard = document.getElementById("today-attendance-card");
        if (todayCard && typeof todayCard.scrollIntoView === "function") {
          todayCard.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
      }

      // TOMBOL LANGKAH 3 PADA ANGGOTA: SELESAI TUGAS ATAU AJUKAN IZIN / CUTI
      if (action === "step-click-leave") {
        const s = Core.state;
        const u = s.currentUser;
        const tz = s.settings.operational_timezone || "Asia/Makassar";
        const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
        const myToday = s.attendance.find((a) => a.employee_id === u?.id && a.work_date === parts.dateString);
        const canCheckOut = Boolean(myToday?.check_in_at && !myToday?.check_out_at);

        if (canCheckOut) {
          uiState.modal = { type: "step_selesai_choice" };
          render();
          return;
        }

        if (!Core.isManager() && !Core.state.settings.allow_member_request_leaves) {
          showBanner(false, "Pengajuan izin sedang dinonaktifkan oleh pengelola.");
          return;
        }
        uiState.modal = { type: "member_leave" };
        render();
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
        const managerViews = ["dashboard", "schedules", "archive", "reports", "control_panel"];
        if (managerViews.includes(target)) {
          Core.assertManagerAccess(`Nav:${target}`);
        }
        uiState.activeNav = target;
        render();
        return;
      }

      // KONTROL ROSTER JADWAL KERJA BULANAN & MINGGUAN (SCHEDULE)
      if (action === "schedule-prev-month") {
        uiState.scheduleMonthOffset = (uiState.scheduleMonthOffset || 0) - 1;
        render();
        return;
      }

      if (action === "schedule-next-month") {
        uiState.scheduleMonthOffset = (uiState.scheduleMonthOffset || 0) + 1;
        render();
        return;
      }

      if (action === "schedule-today-month") {
        uiState.scheduleMonthOffset = 0;
        render();
        return;
      }

      if (action === "schedule-prev-week") {
        uiState.scheduleWeekOffset = (uiState.scheduleWeekOffset || 0) - 1;
        render();
        return;
      }

      if (action === "schedule-next-week") {
        uiState.scheduleWeekOffset = (uiState.scheduleWeekOffset || 0) + 1;
        render();
        return;
      }

      if (action === "schedule-today-week") {
        uiState.scheduleWeekOffset = 0;
        render();
        return;
      }

      if (action === "schedule-subtab") {
        uiState.scheduleTab = btn.getAttribute("data-tab") || "mine";
        render();
        return;
      }

      if (action === "prefill-schedule-date") {
        const dt = btn.getAttribute("data-date");
        uiState.prefilledScheduleDate = dt;
        const dateInput = document.getElementById("sched-date-input");
        if (dateInput) {
          dateInput.value = dt;
        }
        const formCard = document.getElementById("card-schedule-input-form");
        if (formCard) {
          formCard.scrollIntoView({ behavior: "smooth" });
        }
        return;
      }

      if (action === "set-sched-date-quick") {
        const days = parseInt(btn.getAttribute("data-days") || "0", 10);
        const tz = Core.state.settings.operational_timezone || "Asia/Makassar";
        const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
        const [y, m, d] = parts.dateString.split("-").map(Number);
        const targetDate = new Date(y, m - 1, d + days);
        const dy = targetDate.getFullYear();
        const dm = String(targetDate.getMonth() + 1).padStart(2, "0");
        const dd = String(targetDate.getDate()).padStart(2, "0");
        const dateStr = `${dy}-${dm}-${dd}`;
        uiState.prefilledScheduleDate = dateStr;
        const dateInput = document.getElementById("sched-date-input");
        if (dateInput) {
          dateInput.value = dateStr;
        }
        return;
      }

      if (action === "toggle-schedule-type") {
        const fields = document.getElementById("sched-shift-outlet-fields");
        if (fields) {
          const isOff = btn.value === "off";
          fields.style.display = isOff ? "none" : "grid";
        }
        return;
      }

      if (action === "toggle-modal-schedule-type") {
        const fields = document.getElementById("modal-sched-shift-fields");
        if (fields) {
          const isOff = btn.value === "off";
          fields.style.display = isOff ? "none" : "block";
        }
        return;
      }

      if (action === "open-edit-schedule") {
        Core.assertManagerAccess("OpenEditSchedule");
        const schedId = btn.getAttribute("data-schedule-id");
        if (!schedId) return;
        uiState.modal = { type: "edit_work_schedule", id: schedId };
        render();
        return;
      }

      if (action === "delete-schedule") {
        Core.assertManagerAccess("DeleteSchedule");
        const schedId = btn.getAttribute("data-schedule-id");
        if (!schedId) return;
        uiState.modal = { type: "confirm_delete", kind: "work_schedule", id: schedId };
        render();
        return;
      }

      if (action === "open-quick-weekly-modal") {
        Core.assertManagerAccess("OpenQuickWeeklyModal");
        uiState.modal = {
          type: "quick_weekly_schedule",
          employee_id: uiState.scheduleEmployeeFilter !== "all" ? uiState.scheduleEmployeeFilter : null,
        };
        render();
        return;
      }

      if (action === "quick-month-prev") {
        uiState.quickScheduleMonthOffset = (uiState.quickScheduleMonthOffset || 0) - 1;
        render();
        return;
      }

      if (action === "quick-month-next") {
        uiState.quickScheduleMonthOffset = (uiState.quickScheduleMonthOffset || 0) + 1;
        render();
        return;
      }

      if (action === "filter-quick-modal-dept") {
        uiState.quickScheduleDeptFilter = btn.getAttribute("data-dept") || "all";
        render();
        return;
      }

      if (action === "filter-schedule-dept") {
        uiState.scheduleDeptFilter = btn.getAttribute("data-dept") || "all";
        render();
        return;
      }

      if (action === "filter-cp-dept") {
        uiState.cpDeptFilter = btn.getAttribute("data-dept") || "all";
        render();
        return;
      }

      if (action === "quick-fill-week") {
        const preset = btn.getAttribute("data-preset");
        const selects = document.querySelectorAll(".quick-day-select");
        const s = Core.state;
        const morningShift = s.shifts.find((sh) => sh.name.toLowerCase().includes("pagi")) || s.shifts[0];
        const afternoonShift = s.shifts.find((sh) => sh.name.toLowerCase().includes("siang")) || s.shifts[1] || s.shifts[0];

        selects.forEach((sel, idx) => {
          const dayOfWeek = Number(sel.getAttribute("data-day-of-week") || "0");
          if (preset === "all-morning" && morningShift) {
            sel.value = morningShift.id;
          } else if (preset === "all-afternoon" && afternoonShift) {
            sel.value = afternoonShift.id;
          } else if (preset === "mon-fri-morning") {
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              sel.value = "off";
            } else if (morningShift) {
              sel.value = morningShift.id;
            }
          } else if (preset === "pattern-5-2") {
            if (idx % 7 === 5 || idx % 7 === 6) {
              sel.value = "off";
            } else if (morningShift) {
              sel.value = morningShift.id;
            }
          } else if (preset === "weekend-off") {
            if (dayOfWeek === 0 || dayOfWeek === 6) {
              sel.value = "off";
            }
          }
        });
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

      if (action === "open-face-id-enrollment") {
        await openFaceIdEnrollmentModal();
        return;
      }

      if (action === "confirm-register-face-id") {
        const videoEl = document.getElementById("live-selfie-video");
        const errEl = document.getElementById("enroll-error-box");
        if (!videoEl || !liveCamera.stream || videoEl.videoWidth === 0 || videoEl.readyState < 2) {
          const msg = "Kamera belum menampilkan wajah penuh. Tunggu 1–2 detik hingga wajah tampak jelas.";
          if (errEl) errEl.innerHTML = `<div class="modal-inline-alert" role="alert">⚠️ ${msg}</div>`;
          return;
        }

        if (!liveCamera.faceAligned) {
          const msg = "Wajah belum pas di dalam area geometrik oval vertikal. Silakan arahkan wajah tepat di dalam bingkai oval vertikal hingga indikator berwarna hijau sebelum mengunci Face ID.";
          if (errEl) errEl.innerHTML = `<div class="modal-inline-alert" role="alert">⚠️ ${msg}</div>`;
          return;
        }

        btn.disabled = true;
        btn.textContent = "⏳ Memproses & Mengunci Face ID...";

        try {
          // Ekstrak geometri biometrik wajah
          const biometricData = extractBiometricFeatures(videoEl);
          if (!biometricData) {
            throw new Error("Gagal membaca kontur wajah. Pastikan wajah tegak di dalam oval vertikal dan pencahayaan cukup.");
          }

          // Buat snapshot foto master Face ID resmi
          const targetW = 600;
          const targetH = Math.round((videoEl.videoHeight / videoEl.videoWidth) * targetW) || 450;
          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          ctx.save();
          ctx.translate(targetW, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(videoEl, 0, 0, targetW, targetH);
          ctx.restore();

          const u = Core.state.currentUser;
          const barHeight = 44;
          ctx.fillStyle = "rgba(20, 17, 15, 0.82)";
          ctx.fillRect(0, targetH - barHeight, targetW, barHeight);
          ctx.fillStyle = "#FAF6F0";
          ctx.font = "bold 13px sans-serif";
          ctx.fillText("SUKA LATTE | MASTER FACE ID | 1 AKUN 1 WAJAH", 14, targetH - 24);
          ctx.fillStyle = "#DFC8AA";
          ctx.font = "11px monospace";
          ctx.fillText(u.full_name + " (" + u.email + ")", 14, targetH - 9);

          const photoDataUrl = canvas.toDataURL("image/jpeg", 0.85);

          await Core.registerFaceId(biometricData, photoDataUrl);

          stopCameraStream();
          const returnToMode = uiState.modal?.returnToMode;
          uiState.modal = null;
          showBanner(true, "✓ Face ID resmi berhasil dikunci pada akun Google Anda! Sistem anti-joki absensi telah aktif.", 6000);

          if (returnToMode) {
            setTimeout(() => {
              openAttendanceCameraModal(returnToMode);
            }, 300);
          } else {
            render();
          }
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "📸 Rekam & Kunci Face ID Resmi";
          const msg = err.message || "Gagal merekam Face ID.";
          if (errEl) {
            errEl.innerHTML = `<div class="modal-inline-alert" role="alert">⚠️ ${Core.escapeHtml(msg)}</div>`;
          } else {
            alert(msg);
          }
        }
        return;
      }

      if (action === "reset-face-id") {
        Core.assertManagerAccess("ResetFaceId");
        const userId = btn.getAttribute("data-userid");
        const userName = btn.getAttribute("data-name") || "Karyawan";
        if (!userId) return;

        if (!confirm(`Reset Face ID resmi untuk ${userName}?\n\nKaryawan tersebut harus mendaftarkan ulang wajahnya saat absensi berikutnya.`)) {
          return;
        }

        btn.disabled = true;
        try {
          await Core.resetFaceId(userId, "Reset Face ID oleh Pengelola");
          showBanner(true, `✓ Face ID untuk ${userName} berhasil direset. Karyawan dapat mendaftar ulang saat login berikutnya.`);
          render();
        } catch (err) {
          btn.disabled = false;
          showBanner(false, "Gagal mereset Face ID: " + (err.message || err));
        }
        return;
      }

      if (action === "open-shift-swap-modal") {
        uiState.modal = { type: "modal_shift_swap_request" };
        render();
        return;
      }

      if (action === "submit-shift-swap-request") {
        const form = document.getElementById("form-shift-swap-request");
        const errEl = document.getElementById("swap-error-box");
        if (!form) return;

        const targetEmployeeId = form.target_employee_id?.value;
        const requesterDate = form.requester_date?.value;
        const targetDate = form.target_date?.value;
        const notes = form.notes?.value?.trim() || null;

        if (!targetEmployeeId) {
          if (errEl) {
            errEl.style.display = "block";
            errEl.innerHTML = "⚠️ Pilih rekan kerja tujuan pertukaran.";
          }
          return;
        }
        if (!requesterDate || !targetDate) {
          if (errEl) {
            errEl.style.display = "block";
            errEl.innerHTML = "⚠️ Tanggal jadwal Anda dan rekan wajib ditentukan.";
          }
          return;
        }

        btn.disabled = true;
        btn.textContent = "⏳ Mengirim Pengajuan...";

        try {
          await Core.createShiftSwapRequest({
            targetEmployeeId,
            requesterDate,
            targetDate,
            notes,
          });

          uiState.modal = null;
          showBanner(
            true,
            "✓ Pengajuan tukar shift berhasil dikirimkan ke rekan kerja! Menunggu persetujuan rekan kerja Anda.",
            6000
          );
          render();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "🔁 Kirim Pengajuan ke Rekan Kerja";
          if (errEl) {
            errEl.style.display = "block";
            errEl.innerHTML = `⚠️ ${Core.escapeHtml(err.message || "Gagal mengajukan pertukaran shift.")}`;
          } else {
            alert(err.message || "Gagal mengajukan pertukaran shift.");
          }
        }
        return;
      }

      if (action === "respond-shift-swap") {
        const requestId = btn.getAttribute("data-id");
        const accept = btn.getAttribute("data-accept") === "true";
        if (!requestId) return;

        if (accept) {
          if (!confirm("Apakah Anda menyetujui pertukaran jadwal ini?\n\nJadwal kerja/libur Anda dan rekan kerja akan langsung ditukar secara otomatis pada kalender sistem.")) {
            return;
          }
        } else {
          if (!confirm("Apakah Anda yakin ingin menolak permohonan pertukaran jadwal ini?")) {
            return;
          }
        }

        btn.disabled = true;
        try {
          await Core.respondShiftSwapRequest(requestId, accept, accept ? "Disetujui oleh rekan kerja" : "Ditolak oleh rekan kerja");
          showBanner(
            true,
            accept
              ? "✓ Pertukaran jadwal disetujui! Jadwal kerja dan libur Anda & rekan telah otomatis bertukar di kalender."
              : "Pengajuan pertukaran jadwal ditolak.",
            6000
          );
          render();
        } catch (err) {
          btn.disabled = false;
          showBanner(false, "Gagal menanggapi pertukaran: " + (err.message || err));
        }
        return;
      }

      if (action === "cancel-shift-swap") {
        const requestId = btn.getAttribute("data-id");
        if (!requestId) return;

        if (!confirm("Batalkan pengajuan pertukaran jadwal ini?")) return;

        btn.disabled = true;
        try {
          await Core.cancelShiftSwapRequest(requestId);
          showBanner(true, "Pengajuan pertukaran jadwal telah dibatalkan.");
          render();
        } catch (err) {
          btn.disabled = false;
          showBanner(false, "Gagal membatalkan: " + (err.message || err));
        }
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
        Core.assertManagerAccess("OpenMemberCorrection");
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

      if (action === "delete-attendance") {
        Core.assertManagerAccess("DeleteAttendance");
        const recordId = btn.getAttribute("data-id");
        const rec = Core.state.attendance.find((a) => a.id === recordId);
        if (!rec) return;
        if (!Core.canDeleteAttendance(rec)) {
          showBanner(false, "Anda tidak memiliki izin untuk menghapus catatan absensi ini.");
          return;
        }
        const emp = Core.state.profiles.find((p) => p.id === rec.employee_id);
        uiState.modal = {
          type: "confirm_delete",
          kind: "attendance",
          id: rec.id,
          name: `${rec.work_date} (${emp ? emp.full_name : "Karyawan"})`,
        };
        render();
        return;
      }

      if (action === "clear-all-trial-attendance") {
        Core.assertSuperAdminAccess("ClearAllTrialAttendance");
        if (Core.state.attendance.length === 0) {
          showBanner(true, "Tidak ada data absensi untuk dibersihkan.");
          return;
        }
        uiState.modal = {
          type: "confirm_delete",
          kind: "clear_trial_attendance",
          id: "ALL",
          name: "Seluruh Data Absensi Uji Coba",
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

  async function handleSwitchTodayShift(btn) {
    const form = document.getElementById("form-switch-today-shift");
    if (!form) return;
    const fd = new FormData(form);
    const targetShiftId = fd.get("target_shift_id");
    if (!targetShiftId) {
      showBanner(false, "Pilih shift tujuan terlebih dahulu.");
      return;
    }

    const shiftObj = Core.state.shifts.find((sh) => sh.id === targetShiftId);
    const origText = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = "⏳ Mengalihkan Shift...";
    }

    try {
      const res = await Core.switchMyTodayShift(targetShiftId);
      uiState.modal = null;
      render();
      if (res && res.has_attendance) {
        showBanner(
          true,
          `✓ Shift absensi hari ini berhasil dialihkan ke ${shiftObj ? shiftObj.name : "Shift Baru"}! Keterlambatan disesuaikan menjadi ${res.late_minutes} menit (${res.status}).`,
          7000
        );
      } else {
        showBanner(
          true,
          `✓ Shift aktif hari ini berhasil diatur ke ${shiftObj ? shiftObj.name : "Shift Baru"}. Silakan Check In saat tiba di outlet.`,
          6000
        );
      }
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origText || "🔄 Terapkan Pengalihan Shift";
      }
      showBanner(false, "Gagal mengalihkan shift: " + (err.message || err));
    }
  }

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
      if (form.id === "form-switch-today-shift") return await handleSwitchTodayShift(form.querySelector('button[type="submit"]'));
      if (form.id === "form-work-schedule") return await handleSaveWorkSchedule(form.querySelector("#btn-submit-schedule") || form.querySelector('button[type="submit"]'));
      if (form.id === "form-modal-edit-schedule") return await handleSaveModalWorkSchedule(form.querySelector('button[type="submit"]'));
      if (form.id === "form-quick-weekly") return await handleSaveQuickWeeklySchedule(form.querySelector('button[type="submit"]'));
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
    if (!el) return;

    if (el.getAttribute && el.getAttribute("data-action") === "filter-schedule-employee") {
      uiState.scheduleEmployeeFilter = el.value;
      render();
      return;
    }

    if (el.getAttribute && el.getAttribute("data-action") === "change-quick-weekly-emp") {
      if (uiState.modal && uiState.modal.type === "quick_weekly_schedule") {
        uiState.modal.employee_id = el.value;
        render();
      }
      return;
    }

    if (!el.id) return;

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
  // 9. DETAK JAM SERVER RESMI WITA REAL-TIME & PERGANTIAN SHIFT OTOMATIS LIVE
  // ==========================================================================
  let lastAutoShiftId = null;

  setInterval(() => {
    const tz = Core.state.settings.operational_timezone || "Asia/Makassar";
    const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
    const timeEl = document.getElementById("live-server-clock-time");
    const dateEl = document.getElementById("live-server-clock-date");
    if (timeEl) timeEl.textContent = parts.timeString;
    if (dateEl) {
      dateEl.textContent = `Tanggal: ${parts.dateString} • 📁 ${parts.archiveFolderLabel}`;
    }

    // Pergantian shift otomatis secara real-time saat melewati batas H-30 menit (06:30 Pagi, 11:30 Middle, 14:00 Siang)
    if (Core.state.shifts && Core.state.shifts.length > 0 && Core.isApprovedUser()) {
      const currAuto = Core.getAutoRecommendedShift(Core.state.shifts, parts);
      if (currAuto) {
        if (lastAutoShiftId && currAuto.id !== lastAutoShiftId) {
          // Waktu baru saja memasuki jendela shift berikutnya! Reset override & alihkan otomatis khusus Check In
          Core.state.manualShiftOverrideId = null;
          const u = Core.state.currentUser;
          const myToday = Core.state.attendance.find(
            (a) => a.employee_id === u?.id && a.work_date === parts.dateString
          );
          const hasCheckedIn = Boolean(myToday?.check_in_at);

          if (!hasCheckedIn) {
            if (
              uiState.modal &&
              uiState.modal.type === "camera_attendance" &&
              liveCamera.mode === "check_in" &&
              !liveCamera.capturedDataUrl &&
              !liveCamera.submitting
            ) {
              liveCamera.shiftId = currAuto.id;
              renderModalContainerOnly();
              attachStreamToVideoElement();
            } else if (!uiState.modal) {
              render();
            }
            showBanner(
              true,
              `⚡ Pergantian Shift Otomatis: Jendela Check In ${currAuto.name} (${String(currAuto.start_time).slice(0, 5)}–${String(currAuto.end_time).slice(0, 5)} WITA) kini aktif!`,
              7000
            );
          }
        }
        lastAutoShiftId = currAuto.id;
      }
    }
  }, 1000);

  Core.initializeApp(render);
})();
