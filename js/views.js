/**
 * ============================================================================
 * SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — FINAL PRODUCTION)
 * File: js/views.js
 * Deskripsi: Komponen antarmuka produksi (Tanpa Mode Demo / Tanpa Akun Dummy).
 *            Memisahkan secara ketat tampilan Anggota vs Super Admin & Admin,
 *            serta mengaktifkan seluruh formulir Edit langsung di browser.
 * ============================================================================
 */

(function () {
  "use strict";

  const Core = window.SukaCore;
  const esc = Core.escapeHtml;

  const GOOGLE_G_ICON_SVG = `
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  `;

  function renderAvatarHtml(userOrIdentity) {
    const avatar = userOrIdentity?.avatar_url;
    const name = userOrIdentity?.full_name || "SL";
    if (avatar) {
      return `<img src="${esc(avatar)}" alt="${esc(name)}" class="user-avatar" referrerpolicy="no-referrer" />`;
    }
    const initials = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return `<span class="user-avatar">${esc(initials)}</span>`;
  }

  // ==========================================================================
  // 1. LAYAR KONFIGURASI AWAL CLOUD SUPABASE (TANPA VS CODE)
  // ==========================================================================
  function renderCloudSetupScreen(uiState) {
    const s = Core.state;
    const isFileProto = window.location.protocol === "file:";

    return `
      <div style="min-height:100vh;background:linear-gradient(135deg,var(--coffee-950),var(--coffee-900));display:flex;align-items:center;justify-content:center;padding:20px;">
        <div class="modal-window" style="max-width:860px;">
          <div class="grid-12" style="gap:0;">
            <div class="col-5" style="background:var(--coffee-900);color:var(--cream);padding:28px;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div class="brand-box" style="margin-bottom:20px;">
                  <div class="brand-logo-wrap lg">
                    <img src="assets/branding/suka-logo.png" alt="Logo Asli SUKA.pdf" />
                  </div>
                  <div>
                    <div class="brand-title" style="font-size:15px;">SUKA LATTE</div>
                    <div class="brand-sub">ATTENDANCE SYSTEM V1.1</div>
                    <div class="brand-tagline">"Your home cooking taste"</div>
                  </div>
                </div>
                <div style="background:rgba(24,14,7,0.55);border:1px solid var(--coffee-700);border-radius:14px;padding:14px;font-size:11.5px;line-height:1.65;color:var(--coffee-200);">
                  <strong style="color:var(--white);display:block;margin-bottom:6px;">Keamanan Produksi Final:</strong>
                  • <strong>Tanpa Mode Demo:</strong> 100% data nyata terhubung ke database Supabase Anda.<br/>
                  • <strong>Wajib Login Akun Google:</strong> Menjaga privasi identitas setiap karyawan.<br/>
                  • <strong>Persetujuan Login Pertama:</strong> Akun baru wajib disetujui Admin; login berikutnya langsung masuk otomatis.<br/>
                  • <strong>Pengaturan Tanpa VS Code:</strong> Seluruh konfigurasi diedit langsung dari aplikasi.
                </div>
              </div>
              <div style="font-size:11px;color:var(--coffee-400);margin-top:20px;">
                Zona Waktu Default: WITA (Asia/Makassar)
              </div>
            </div>

            <div class="col-7" style="padding:28px;">
              ${
                uiState.banner
                  ? `<div style="margin-bottom:14px;padding:12px;border-radius:12px;background:${uiState.banner.ok ? "var(--emerald-50)" : "var(--rose-50)"};color:${uiState.banner.ok ? "var(--emerald-900)" : "var(--rose-800)"};font-size:12px;font-weight:700;">
                      ${esc(uiState.banner.message)}
                    </div>`
                  : ""
              }

              ${
                isFileProto
                  ? `<div style="margin-bottom:14px;padding:12px;border-radius:12px;background:var(--amber-50);border:1px solid #fde68a;color:var(--amber-800);font-size:11.5px;line-height:1.55;">
                      <strong>Penting (Akses Kamera &amp; Google Login):</strong> Anda sedang membuka file via <code>file://</code>. Agar Login Google OAuth &amp; Kamera Selfie diizinkan oleh browser, jalankan melalui <strong><code>Jalankan-Server-Lokal.command</code></strong> (klik 2x di folder ini) atau deploy ke <strong>Vercel (HTTPS)</strong>.
                    </div>`
                  : ""
              }

              ${
                s.schemaMissing
                  ? `<h2 style="font-size:18px;font-weight:800;margin-bottom:6px;">Langkah Terakhir Database: Jalankan Skema SQL</h2>
                     <p style="font-size:12px;color:var(--stone-600);margin-bottom:14px;line-height:1.6;">
                       Koneksi ke Supabase berhasil, namun tabel belum dibuat. Buka <strong>Supabase Dashboard → SQL Editor</strong>, lalu jalankan isi file:
                       <br/><code style="font-weight:700;color:var(--coffee-900);">supabase/migrations/001_suka_latte_schema.sql</code>
                     </p>
                     <div style="display:flex;gap:10px;flex-wrap:wrap;">
                       <button class="btn btn-primary" data-action="retry-connection">🔄 Saya Sudah Menjalankan SQL — Muat Ulang</button>
                       <button class="btn btn-outline" data-action="reset-cloud-config">Ubah URL / Key Supabase</button>
                     </div>`
                  : `<h2 style="font-size:18px;font-weight:800;margin-bottom:6px;">Hubungkan Server Supabase Suka Latte</h2>
                     <p style="font-size:12px;color:var(--stone-600);margin-bottom:16px;">
                       Masukkan <strong>Project URL</strong> dan <strong>anon public key</strong> dari menu <em>Project Settings → API</em> Supabase Anda (tanpa perlu membuka VS Code).
                     </p>
                     <form id="form-cloud-connect">
                       <div class="form-group">
                         <label class="form-label">Supabase Project URL *</label>
                         <input class="form-input mono" name="supabase_url" placeholder="https://xxxxxxxxxxxx.supabase.co" value="${esc(s.supabaseUrl)}" required />
                       </div>
                       <div class="form-group">
                         <label class="form-label">Supabase Anon Public Key *</label>
                         <textarea class="form-textarea mono" name="supabase_anon_key" rows="3" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." required>${esc(s.supabaseAnonKey)}</textarea>
                       </div>
                       <button type="submit" class="btn btn-primary" style="width:100%;padding:12px;">
                         Simpan &amp; Hubungkan ke Sistem Produksi
                       </button>
                     </form>`
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 2. LAYAR LOGIN WAJIB AKUN GOOGLE & BOOTSTRAP SUPER ADMIN PERTAMA
  // ==========================================================================
  function renderGoogleLoginOrBootstrapScreen(uiState) {
    const s = Core.state;
    const isBootstrapDone = s.bootstrapCompleted;
    const hasGoogleSession = Boolean(s.session && s.session.user);
    const isFileProto = window.location.protocol === "file:";

    return `
      <div class="login-page">
        <div class="login-shell">
          <!-- KIRI: BRANDING & STANDAR HOSPITALITY SUKA LATTE -->
          <div class="login-showcase">
            <div>
              <div class="brand-box" style="margin-bottom:22px;">
                <div class="brand-logo-wrap lg">
                  <img src="assets/branding/suka-logo.png" alt="Logo Asli Suka Latte" />
                </div>
                <div>
                  <div class="brand-title" style="font-size:16px;">${esc(s.settings.brand_display_name)}</div>
                  <div class="brand-sub">SUKA LATTE • ${esc(s.settings.brand_subtitle)}</div>
                  <div class="brand-tagline">"${esc(s.settings.brand_tagline)}"</div>
                </div>
              </div>

              <div style="margin-bottom:18px;">
                <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--gold-300);margin-bottom:6px;">
                  Portal Kehadiran Resmi Karyawan
                </div>
                <h2 class="font-serif" style="font-size:24px;line-height:1.25;color:var(--white);font-weight:700;">
                  Presensi Cepat, Akurat &amp; Transparan
                </h2>
              </div>

              <div class="login-feature-list">
                <div class="login-feature-item">
                  <span style="font-size:16px;">🔐</span>
                  <div style="font-size:12px;line-height:1.5;color:var(--coffee-100);">
                    <strong style="color:var(--white);display:block;">Login Akun Google Pribadi</strong>
                    Masuk sekali klik. Setelah persetujuan pertama oleh Admin, akses berikutnya langsung aktif otomatis.
                  </div>
                </div>
                <div class="login-feature-item">
                  <span style="font-size:16px;">📸</span>
                  <div style="font-size:12px;line-height:1.5;color:var(--coffee-100);">
                    <strong style="color:var(--white);display:block;">Selfie Kamera Langsung &amp; GPS Outlet</strong>
                    Foto dan titik lokasi hanya diambil saat Anda menekan Check In atau Check Out.
                  </div>
                </div>
                <div class="login-feature-item">
                  <span style="font-size:16px;">⏱️</span>
                  <div style="font-size:12px;line-height:1.5;color:var(--coffee-100);">
                    <strong style="color:var(--white);display:block;">Waktu Server Resmi (${esc(s.settings.operational_timezone)})</strong>
                    Perhitungan jam hadir, terlambat (&gt;15 menit), dan durasi kerja dicatat objektif di server.
                  </div>
                </div>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--gold-200);border-top:1px solid rgba(218,175,118,0.18);padding-top:14px;">
              <span>SUKA LATTE CAFÉ &amp; CATERING</span>
              <span class="mono">${esc(s.settings.operational_timezone)}</span>
            </div>
          </div>

          <!-- KANAN: LOGIN GOOGLE / KONFIRMASI SUPER ADMIN PERTAMA -->
          <div class="login-auth-panel">
            ${
              uiState.banner
                ? `<div style="margin-bottom:16px;padding:12px 14px;border-radius:12px;background:${uiState.banner.ok ? "var(--emerald-50)" : "var(--rose-50)"};color:${uiState.banner.ok ? "var(--emerald-800)" : "var(--rose-800)"};border:1px solid ${uiState.banner.ok ? "#a7f3d0" : "#fecdd3"};font-size:12px;font-weight:700;">
                    ${esc(uiState.banner.message)}
                  </div>`
                : ""
            }

            ${
              s.initError
                ? `<div style="margin-bottom:16px;padding:12px 14px;border-radius:12px;background:var(--rose-50);color:var(--rose-800);border:1px solid #fecdd3;font-size:12px;">
                    <strong>Info Sistem:</strong> ${esc(s.initError)}
                  </div>`
                : ""
            }

            ${
              isFileProto
                ? `<div style="margin-bottom:16px;padding:12px 14px;border-radius:12px;background:var(--amber-50);border:1px solid #fde68a;color:var(--amber-800);font-size:11.5px;">
                    Gunakan domain HTTPS resmi atau <code>http://localhost:8080</code> agar Google OAuth berfungsi.
                  </div>`
                : ""
            }

            ${
              !isBootstrapDone
                ? hasGoogleSession
                  ? `<!-- TAHAP 2 BOOTSTRAP: AKUN GOOGLE SUDAH TERVERIFIKASI, KUNCI SEBAGAI SUPER ADMIN PERTAMA -->
                     <span class="badge badge-super" style="align-self:flex-start;margin-bottom:12px;">Inisialisasi Pertama • Satu Super Admin Tunggal</span>
                     <h2 style="font-size:21px;font-weight:800;margin-bottom:6px;color:var(--coffee-950);">Konfirmasi Akun Super Admin Pertama</h2>
                     <p style="font-size:12.5px;color:var(--stone-600);margin-bottom:16px;">
                       Akun Google Anda telah terverifikasi. Setelah dikunci, akun ini menjadi <strong>Super Admin utama</strong> di Suka Latte dan proses inisialisasi ditutup permanen.
                     </p>
                     <div class="card-subtle" style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                       ${renderAvatarHtml(s.googleIdentity)}
                       <div>
                         <div style="font-weight:800;font-size:14px;">${esc(s.googleIdentity?.full_name)}</div>
                         <div style="font-size:12px;color:var(--stone-600);">${esc(s.googleIdentity?.email)}</div>
                       </div>
                     </div>
                     <form id="form-complete-bootstrap">
                       <div class="grid-2" style="gap:10px;">
                         <div class="form-group">
                           <label class="form-label">ID Karyawan Super Admin</label>
                           <input class="form-input mono" id="bootstrap-employee-code" name="employee_code" value="SL-0001" required />
                         </div>
                         <div class="form-group">
                           <label class="form-label">Nomor Telepon / WhatsApp</label>
                           <input class="form-input" id="bootstrap-phone" name="phone" placeholder="0811xxxx" />
                         </div>
                       </div>
                       <button type="submit" id="btn-submit-bootstrap" class="btn btn-primary btn-lg" style="width:100%;margin-bottom:10px;" data-action="submit-bootstrap">
                         🔒 Tetapkan Sebagai Super Admin &amp; Kunci Sistem
                       </button>
                       <button type="button" class="btn btn-outline" style="width:100%;" data-action="logout">
                         Ganti Akun Google Lain
                       </button>
                     </form>`
                  : `<!-- TAHAP 1 BOOTSTRAP: BELUM ADA SUPER ADMIN -->
                     <span class="badge badge-warning" style="align-self:flex-start;margin-bottom:12px;">Instalasi Baru • Menunggu Super Admin Pertama</span>
                     <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;color:var(--coffee-950);">Inisialisasi Super Admin Suka Latte</h2>
                     <p style="font-size:13px;color:var(--stone-600);margin-bottom:22px;line-height:1.6;">
                       Sistem belum memiliki pengelola. Silakan masuk menggunakan <strong>Akun Google Pemilik (Owner)</strong> untuk membentuk akun Super Admin tunggal.
                     </p>
                     <button class="btn-google" data-action="google-login">
                       ${GOOGLE_G_ICON_SVG}
                       <span>Lanjutkan dengan Akun Google (Super Admin Pertama)</span>
                     </button>`
                : `<!-- LOGIN HARIAN NORMAL: WAJIB AKUN GOOGLE -->
                   <span class="badge badge-success" style="align-self:flex-start;margin-bottom:12px;">Autentikasi Resmi Karyawan</span>
                   <h2 style="font-size:24px;font-weight:800;margin-bottom:8px;color:var(--coffee-950);letter-spacing:-0.02em;">Selamat Datang Kembali</h2>
                   <p style="font-size:13px;color:var(--stone-600);margin-bottom:24px;line-height:1.6;">
                     Masuk dengan <strong>Akun Google</strong> Anda untuk Check In / Check Out hari ini dan melihat riwayat kehadiran pribadi.
                   </p>
                   <button class="btn-google" data-action="google-login">
                     ${GOOGLE_G_ICON_SVG}
                     <span>Masuk dengan Akun Google</span>
                   </button>
                   <div style="margin-top:18px;padding:12px 14px;border-radius:12px;background:var(--coffee-50);border:1px solid var(--border-soft);font-size:11.5px;color:var(--stone-600);line-height:1.5;">
                     💡 <strong>Baru pertama kali masuk?</strong> Login Google terlebih dahulu lalu hubungi Admin atau Super Admin agar akun Anda langsung disetujui.
                   </div>`
            }

            ${
              !isBootstrapDone
                ? `<div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--coffee-200);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--stone-500);">
                     <span>Server Supabase Terhubung</span>
                     <button style="background:transparent;border:none;text-decoration:underline;color:var(--coffee-700);font-weight:700;cursor:pointer;" data-action="reset-cloud-config">Ubah Koneksi Server</button>
                   </div>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 3. LAYAR MENUNGGU PERSETUJUAN LOGIN PERTAMA ADMIN / DITOLAK / NONAKTIF
  // ==========================================================================
  function renderPendingOrBlockedScreen(uiState) {
    const u = Core.state.currentUser;
    const isPending = u.status === "pending_approval" || !u.first_login_approved;
    const isRejected = u.status === "rejected";

    return `
      <div style="min-height:100vh;background:linear-gradient(135deg,var(--coffee-950),var(--coffee-900));display:flex;align-items:center;justify-content:center;padding:20px;">
        <div class="modal-window sm" style="padding:30px;text-align:center;">
          <div style="display:flex;justify-content:center;margin-bottom:14px;">
            <div class="brand-logo-wrap">
              <img src="assets/branding/suka-logo.png" alt="Suka Latte" />
            </div>
          </div>

          <span class="badge ${isPending ? "badge-warning" : "badge-danger"}" style="margin-bottom:12px;">
            ${
              isPending
                ? "⏳ Menunggu Persetujuan Login Pertama"
                : isRejected
                ? "✕ Permintaan Akses Ditolak"
                : "⊘ Akun Sedang Dinonaktifkan"
            }
          </span>

          <h2 style="font-size:20px;font-weight:800;margin-bottom:8px;">
            ${
              isPending
                ? "Akun Google Anda Menunggu Verifikasi Admin"
                : isRejected
                ? "Akses Login Tidak Disetujui"
                : "Akun Karyawan Tidak Aktif"
            }
          </h2>

          <div class="card-subtle" style="display:flex;align-items:center;gap:12px;text-align:left;margin:16px 0;">
            ${renderAvatarHtml(u)}
            <div>
              <div style="font-weight:800;font-size:14px;">${esc(u.full_name)}</div>
              <div style="font-size:12px;color:var(--stone-600);">${esc(u.email)}</div>
            </div>
          </div>

          <p style="font-size:12.5px;color:var(--stone-600);line-height:1.65;margin-bottom:20px;">
            ${
              isPending
                ? "Demi menjaga privasi dan keamanan internal Suka Latte, setiap akun Google yang baru pertama kali masuk wajib disetujui oleh <strong>Admin atau Super Admin</strong>. Setelah disetujui, saat Anda login kembali dengan akun Google ini Anda akan <strong>langsung masuk otomatis</strong>."
                : isRejected
                ? `Catatan Pengelola: ${esc(u.rejection_reason || "Silakan hubungi Admin Suka Latte untuk konfirmasi akun kerja Anda.")}`
                : "Status akun Anda saat ini sedang dinonaktifkan oleh pengelola Suka Latte. Hubungi Admin atau Super Admin apabila Anda membutuhkan akses kembali."
            }
          </p>

          ${
            uiState.banner
              ? `<div style="margin-bottom:14px;padding:10px;border-radius:10px;background:var(--coffee-100);font-size:12px;font-weight:700;">
                  ${esc(uiState.banner.message)}
                </div>`
              : ""
          }

          <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
            ${
              isPending
                ? `<button class="btn btn-primary" data-action="check-approval-status">
                    🔄 Cek Status Persetujuan Sekarang
                  </button>`
                : ""
            }
            <button class="btn btn-outline" data-action="logout">Keluar (Logout)</button>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 4. PETA RADAR GEOFENCE & KARTU BUKTI SELFIE BERDAMPINGAN
  // ==========================================================================
  function renderGeofenceMapCard(outlet, userGps) {
    if (!outlet) return "";
    const hasGps = userGps && typeof userGps.lat === "number" && typeof userGps.lng === "number";
    const dist = hasGps
      ? Core.calculateDistanceMeters(userGps.lat, userGps.lng, outlet.latitude, outlet.longitude)
      : null;
    const inside = dist !== null && dist <= outlet.geofence_radius_meters;

    let dotX = 180;
    let dotY = 105;
    if (hasGps) {
      const dLatM = (outlet.latitude - userGps.lat) * 111320;
      const dLngM =
        (userGps.lng - outlet.longitude) *
        111320 *
        Math.cos((outlet.latitude * Math.PI) / 180);
      const scale = 70 / Math.max(outlet.geofence_radius_meters, 20);
      dotX = Math.max(28, Math.min(332, 180 + dLngM * scale));
      dotY = Math.max(24, Math.min(186, 105 + dLatM * scale));
    }

    return `
      <div class="card" style="padding:0;overflow:hidden;">
        <div style="padding:14px 18px;background:var(--coffee-50);border-bottom:1px solid var(--coffee-200);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:12.5px;font-weight:800;text-transform:uppercase;">📍 Lokasi Geofence: ${esc(outlet.name)}</div>
            <div style="font-size:11px;color:var(--stone-600);">${esc(outlet.address)}</div>
          </div>
          <span class="badge badge-success mono">Radius: ${outlet.geofence_radius_meters}m • Min Akurasi: ±${outlet.minimum_gps_accuracy_meters}m</span>
        </div>
        <div style="background:#191512;padding:16px;text-align:center;color:var(--cream);">
          <svg viewBox="0 0 360 210" style="width:100%;max-width:420px;height:190px;">
            <rect width="360" height="210" rx="12" fill="#211A14"/>
            <path d="M 0 105 L 360 105 M 180 0 L 180 210" stroke="#2E241B" stroke-width="5"/>
            <circle cx="180" cy="105" r="70" fill="rgba(16,185,129,0.16)" stroke="#10B981" stroke-width="2" stroke-dasharray="6 4"/>
            <circle cx="180" cy="105" r="7" fill="#C8A67D" stroke="#FFFFFF" stroke-width="2"/>
            <text x="180" y="91" text-anchor="middle" fill="#FDFBF8" font-size="10" font-weight="bold">OUTLET SUKA LATTE</text>
            ${
              hasGps
                ? `<line x1="180" y1="105" x2="${dotX}" y2="${dotY}" stroke="${inside ? "#34D399" : "#F87171"}" stroke-width="1.5" stroke-dasharray="3 3"/>
                   <circle cx="${dotX}" cy="${dotY}" r="6" fill="${inside ? "#10B981" : "#EF4444"}" stroke="#FFFFFF" stroke-width="2"/>
                   <text x="${dotX}" y="${dotY + 16}" text-anchor="middle" fill="${inside ? "#6EE7B7" : "#FCA5A5"}" font-size="9.5" font-weight="bold">POSISI ANDA (${dist}m)</text>`
                : ""
            }
          </svg>
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--coffee-300);margin-top:6px;flex-wrap:wrap;gap:6px;">
            <span id="radar-outlet-coords-label" class="mono">Titik Outlet: ${Number(outlet.latitude).toFixed(6)}, ${Number(outlet.longitude).toFixed(6)}</span>
            <div style="display:flex;gap:10px;">
              <a id="radar-google-maps-link" href="https://maps.google.com/?q=${outlet.latitude},${outlet.longitude}" target="_blank" rel="noreferrer" style="color:var(--coffee-200);text-decoration:underline;">📍 Buka Google Maps ↗</a>
              <a href="https://www.openstreetmap.org/?mlat=${outlet.latitude}&mlon=${outlet.longitude}#map=18/${outlet.latitude}/${outlet.longitude}" target="_blank" rel="noreferrer" style="color:var(--coffee-200);">OpenStreetMap ↗</a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAttendanceRecordCard(rec, tz, allowManagerEdit) {
    const s = Core.state;
    const emp =
      s.profiles.find((p) => p.id === rec.employee_id) ||
      rec.employee ||
      (s.currentUser?.id === rec.employee_id ? s.currentUser : null);
    const out = s.outlets.find((o) => o.id === rec.outlet_id) || rec.outlet;
    const sh = s.shifts.find((x) => x.id === rec.shift_id) || rec.shift;

    if (!emp && rec.employee_id && Core.fetchMissingProfile) {
      setTimeout(() => Core.fetchMissingProfile(rec.employee_id), 20);
    }

    const inUrl = Core.getSignedPhotoUrl(rec.check_in_photo_path);
    const outUrl = Core.getSignedPhotoUrl(rec.check_out_photo_path);

    // Otomatis minta signed URL jika belum ada di cache (dan bukan status FAILED)
    const needIn = rec.check_in_photo_path && inUrl === null;
    const needOut = rec.check_out_photo_path && outUrl === null;
    if (needIn || needOut) {
      setTimeout(() => Core.ensureSignedUrlsForAttendance([rec]), 30);
    }

    const renderThumb = (url, path, label, isCheckIn) => {
      if (url && url !== "FAILED") {
        return `<img src="${esc(url)}" alt="${esc(label)}" loading="lazy" />`;
      }
      if (url === "FAILED") {
        return `<div style="padding:10px;text-align:center;font-size:11px;color:var(--coffee-700);"><div style="font-size:16px;margin-bottom:2px;">🔒</div>Foto Privat Tersimpan</div>`;
      }
      if (path) {
        return `<div style="padding:10px;text-align:center;font-size:11px;color:var(--stone-500);"><div style="font-size:14px;margin-bottom:2px;">⏳</div>Memuat Foto...</div>`;
      }
      return `<span style="font-size:11px;color:var(--stone-400);padding:8px;text-align:center;">${isCheckIn ? "Tidak Ada Foto" : "Menunggu Check Out"}</span>`;
    };

    const empName = emp ? emp.full_name : (rec.employee?.full_name || (rec.employee_id ? `Karyawan (${String(rec.employee_id).slice(0, 8)})` : "Karyawan"));
    const empCode = emp?.employee_code ? emp.employee_code : (rec.employee?.employee_code || (rec.employee_id ? String(rec.employee_id).slice(0, 8) : "-"));
    const empDept = emp?.department || rec.employee?.department || "";
    const isMyRecord = s.currentUser?.id === rec.employee_id;

    return `
      <div class="card-subtle" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:13.5px;font-weight:800;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span>${esc(empName)}</span>
              <span class="mono" style="font-size:11px;color:var(--coffee-700);">(${esc(empCode)})</span>
              ${empDept ? getDepartmentBadge(empDept) : ""}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px;">
              <span style="font-size:11px;color:var(--stone-600);">Tanggal Kerja: <strong>${esc(rec.work_date)}</strong> • ${esc(out ? out.name : "-")}</span>
              <span class="badge badge-coffee" style="background:var(--coffee-100);color:var(--coffee-900);border:1px solid var(--coffee-300);">
                ⏱ ${esc(sh ? `${sh.name} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)})` : "-")}
              </span>
              ${isMyRecord ? `<button type="button" class="btn btn-outline btn-xs" data-action="open-switch-shift-modal" style="font-size:10px;padding:1px 6px;border-color:var(--coffee-300);color:var(--coffee-800);">🔄 Ganti Shift</button>` : ""}
            </div>
          </div>
          <div style="text-align:right;">
            ${Core.getStatusBadgeHtml(rec.attendance_status, rec.late_minutes)}
            <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;flex-wrap:wrap;margin-top:3px;">
              <span class="badge" style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;font-size:10px;padding:2px 6px;">
                ✓ Geometri Terverifikasi
              </span>
              <span class="mono" style="font-size:10px;font-weight:700;color:var(--coffee-700);">
                📁 ${esc(rec.archive_folder_label)}
              </span>
            </div>
          </div>
        </div>

        <div class="evidence-pair">
          <div class="evidence-box">
            <div>
              <div class="evidence-box-head checkin">
                <span>1. SELFIE CHECK IN</span>
                <span class="mono">${rec.check_in_at ? Core.formatOperationalDateTime(rec.check_in_at, tz, false) : "-"}</span>
              </div>
              <div class="evidence-thumb">
                ${renderThumb(inUrl, rec.check_in_photo_path, "Foto Check In", true)}
              </div>
            </div>
            <div style="padding:8px;font-size:10.5px;color:var(--stone-600);border-top:1px solid var(--coffee-100);">
              GPS: <strong class="mono">${rec.check_in_distance_meters !== null ? rec.check_in_distance_meters + "m (±" + Math.round(rec.check_in_accuracy || 0) + "m)" : "-"}</strong>
            </div>
          </div>

          <div class="evidence-box">
            <div>
              <div class="evidence-box-head checkout">
                <span>2. SELFIE CHECK OUT</span>
                <span class="mono">${rec.check_out_at ? Core.formatOperationalDateTime(rec.check_out_at, tz, false) : "Belum"}</span>
              </div>
              <div class="evidence-thumb">
                ${renderThumb(outUrl, rec.check_out_photo_path, "Foto Check Out", false)}
              </div>
            </div>
            <div style="padding:8px;font-size:10.5px;color:var(--stone-600);border-top:1px solid var(--coffee-100);">
              Durasi: <strong>${Core.formatDurationMinutes(rec.work_duration_minutes)}</strong>
            </div>
          </div>
        </div>

        ${
          rec.correction_note || rec.anomaly_notes
            ? `<div style="font-size:11px;padding:7px 10px;border-radius:8px;background:var(--amber-50);color:var(--amber-800);border:1px solid #fde68a;">
                ${esc(rec.correction_note || rec.anomaly_notes)}
              </div>`
            : ""
        }

        <div style="display:flex;justify-content:space-between;align-items:center;padding-top:4px;border-top:1px solid var(--coffee-200);gap:8px;flex-wrap:wrap;">
          <button class="btn btn-outline btn-sm" data-action="inspect-record" data-id="${esc(rec.id)}">
            🔍 Lihat Detail Bukti
          </button>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${
              allowManagerEdit && Core.isManager()
                ? `<button class="btn btn-primary btn-sm" data-action="open-admin-edit-att" data-id="${esc(rec.id)}">✏️ Edit</button>`
                : ""
            }
            ${
              Core.canDeleteAttendance(rec)
                ? `<button class="btn btn-outline btn-sm" style="color:var(--rose-700);border-color:#fca5a5;" data-action="delete-attendance" data-id="${esc(rec.id)}" title="Hapus catatan absensi (Uji coba)">🗑️ Hapus</button>`
                : ""
            }
          </div>
        </div>
      </div>
    `;
  }

  function renderShiftSelectorHtml(shifts, selectedShiftId, locked) {
    const activeShifts = (shifts || []).filter((sh) => sh.status === "active");
    if (activeShifts.length === 0) return "";
    const currShift = activeShifts.find((sh) => sh.id === selectedShiftId);
    return `
      <div id="shift-selector-wrap" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap;">
          <div style="font-size:11px;font-weight:700;color:var(--coffee-300);text-transform:uppercase;letter-spacing:0.04em;">
            Shift Bertugas: <strong style="color:var(--gold-200);">${esc(currShift ? currShift.name : "Belum Dipilih")}</strong>
            ${locked ? `<span class="badge" style="background:rgba(218,175,118,0.22);color:var(--gold-200);font-size:9.5px;margin-left:6px;border:1px solid rgba(218,175,118,0.35);">✓ Aktif Hari Ini</span>` : ""}
          </div>
          <button type="button" class="btn btn-outline btn-xs" data-action="open-switch-shift-modal" style="font-size:10.5px;padding:3px 9px;border-color:rgba(218,175,118,0.4);color:var(--gold-200);background:rgba(0,0,0,0.25);">
            🔄 Alihkan / Ganti Shift Hari Ini
          </button>
        </div>
        <div class="shift-selector-grid">
          ${activeShifts
            .map((sh) => {
              const active = sh.id === selectedShiftId;
              const grace = Number(sh.grace_period_minutes ?? 15);
              return `
                <button
                  type="button"
                  class="shift-choice-btn ${active ? "active" : ""}"
                  data-action="select-my-shift"
                  data-shift-id="${esc(sh.id)}"
                  title="${locked ? "Ketuk untuk mengalihkan shift hari ini ke " + sh.name : "Pilih " + sh.name}"
                >
                  <span style="font-weight:800;font-size:12.5px;">${active ? "✓ " : ""}${esc(sh.name)}</span>
                  <span class="mono" style="font-size:10.5px;opacity:0.88;">${esc(String(sh.start_time).slice(0, 5))}–${esc(String(sh.end_time).slice(0, 5))} (Telat &gt;${grace}m)</span>
                </button>`;
            })
            .join("")}
        </div>
        ${
          locked
            ? `<div style="font-size:10.5px;color:var(--coffee-300);margin-top:5px;display:flex;align-items:center;gap:4px;">
                <span>💡 Ingin ganti shift? Ketuk tombol shift di atas atau gunakan tombol <strong>Alihkan Shift</strong>. Jam keterlambatan akan dihitung ulang otomatis.</span>
               </div>`
            : ""
        }
      </div>
    `;
  }

  // ==========================================================================
  // HELPER HARI LIBUR & PENGAJUAN IZIN / CUTI / LIBUR (DARI MANA SAJA)
  // ==========================================================================
  function getLeaveTypeLabel(type) {
    const map = {
      holiday: "Hari Libur",
      jadwal_khusus: "Jadwal Khusus",
      izin: "Izin / Libur",
      cuti: "Cuti / Libur",
      sakit: "Sakit",
    };
    return map[type] || String(type || "Izin").toUpperCase();
  }

  function getApprovalStatusBadgeHtml(status) {
    if (status === "approved") return `<span class="badge badge-success">DISETUJUI</span>`;
    if (status === "rejected") return `<span class="badge badge-danger">DITOLAK</span>`;
    return `<span class="badge badge-warning">MENUNGGU PERSETUJUAN</span>`;
  }

  function getHolidayAndLeaveSummary(dateString, employeeId) {
    const all = Core.state.holidaysAndLeaves || [];
    const outletHolidays = all
      .filter((h) => (!h.employee_id || h.type === "holiday" || h.type === "jadwal_khusus") && h.status !== "rejected")
      .slice()
      .sort((a, b) => String(a.date_start).localeCompare(String(b.date_start)));
    const todayHolidays = outletHolidays.filter((h) => h.date_start <= dateString && h.date_end >= dateString);
    const upcomingOrActiveHolidays = outletHolidays.filter((h) => h.date_end >= dateString);
    const myLeaves = employeeId ? all.filter((h) => h.employee_id === employeeId) : [];
    const myTodayApprovedLeave = myLeaves.find(
      (h) => h.status === "approved" && h.date_start <= dateString && h.date_end >= dateString
    );
    const pendingLeaves = all.filter((h) => h.employee_id && h.status === "pending");
    return {
      outletHolidays,
      todayHolidays,
      upcomingOrActiveHolidays,
      myLeaves,
      myTodayApprovedLeave,
      pendingLeaves,
    };
  }

  function renderMyLeaveListHtml(employeeId) {
    const { myLeaves } = getHolidayAndLeaveSummary("", employeeId);
    if (myLeaves.length === 0) {
      return `<div class="card-subtle" style="text-align:center;color:var(--stone-500);font-size:12px;">Belum ada pengajuan izin, sakit, atau cuti/libur.</div>`;
    }
    return `
      <div style="display:flex;flex-direction:column;gap:9px;">
        ${myLeaves
          .slice(0, 8)
          .map(
            (lv) => `
          <div class="card-subtle" style="padding:11px 13px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
            <div style="min-width:0;flex:1;">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">
                <span class="badge badge-coffee">${esc(getLeaveTypeLabel(lv.type))}</span>
                <strong style="font-size:13px;color:var(--stone-900);">${esc(lv.title)}</strong>
              </div>
              <div class="mono" style="font-size:11px;color:var(--coffee-700);font-weight:700;">
                ${esc(lv.date_start)}${lv.date_end && lv.date_end !== lv.date_start ? ` s/d ${esc(lv.date_end)}` : ""}
              </div>
              <div style="font-size:11.5px;color:var(--stone-600);margin-top:2px;">${esc(lv.reason)}</div>
            </div>
            <div>${getApprovalStatusBadgeHtml(lv.status)}</div>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  function renderMemberHolidayAndLeaveCard(dateString, employeeId) {
    const { todayHolidays, upcomingOrActiveHolidays, outletHolidays } = getHolidayAndLeaveSummary(
      dateString,
      employeeId
    );
    const holidaysToShow = upcomingOrActiveHolidays.length > 0 ? upcomingOrActiveHolidays : outletHolidays;

    return `
      <div class="grid-2" style="margin-bottom:18px;">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
            <div>
              <h3 style="font-size:15.5px;font-weight:800;">🏖️ Hari Libur Outlet &amp; Nasional</h3>
              <p style="font-size:11.5px;color:var(--stone-500);">Ditetapkan oleh Super Admin / Admin di sistem.</p>
            </div>
            ${
              todayHolidays.length > 0
                ? `<span class="badge badge-danger">Hari Ini Libur</span>`
                : `<span class="badge badge-stone">${holidaysToShow.length} Jadwal</span>`
            }
          </div>
          ${
            holidaysToShow.length === 0
              ? `<div class="card-subtle" style="text-align:center;color:var(--stone-500);font-size:12px;">Belum ada jadwal hari libur outlet yang ditambahkan Admin.</div>`
              : `<div style="display:flex;flex-direction:column;gap:8px;">
                  ${holidaysToShow
                    .slice(0, 6)
                    .map((h) => {
                      const isToday = h.date_start <= dateString && h.date_end >= dateString;
                      return `
                        <div class="card-subtle" style="padding:11px 13px;border-color:${isToday ? "#fda4af" : "var(--border-soft)"};background:${isToday ? "var(--rose-50)" : ""};">
                          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                            <strong style="font-size:13px;color:${isToday ? "var(--rose-800)" : "var(--stone-900)"};">${esc(h.title)}</strong>
                            ${isToday ? `<span class="badge badge-danger">HARI INI</span>` : `<span class="badge badge-coffee">${esc(getLeaveTypeLabel(h.type))}</span>`}
                          </div>
                          <div class="mono" style="font-size:11px;color:var(--coffee-700);margin-top:2px;">
                            ${esc(h.date_start)}${h.date_end && h.date_end !== h.date_start ? ` s/d ${esc(h.date_end)}` : ""}
                          </div>
                          <div style="font-size:11.5px;color:var(--stone-600);margin-top:2px;">${esc(h.reason)}</div>
                        </div>`;
                    })
                    .join("")}
                </div>`
          }
        </div>

        <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
              <div>
                <h3 style="font-size:15.5px;font-weight:800;">📅 Izin, Cuti &amp; Pengajuan Libur Saya</h3>
                <p style="font-size:11.5px;color:var(--stone-500);">Bisa diajukan dari luar outlet (tanpa GPS &amp; tanpa selfie).</p>
              </div>
              <button class="btn btn-primary btn-sm" data-action="open-member-leave">
                + Ajukan Izin / Cuti
              </button>
            </div>
            <div style="margin-bottom:10px;padding:9px 12px;border-radius:10px;background:var(--emerald-50);border:1px solid #a7f3d0;color:var(--emerald-800);font-size:11.5px;line-height:1.45;">
              📍 <strong>Tidak harus di outlet:</strong> Pengajuan izin/cuti/libur bisa dikirim dari rumah. Absensi foto wajah di outlet hanya untuk menandakan Anda masuk hadir bekerja.
            </div>
            ${renderMyLeaveListHtml(employeeId)}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 4.5 HELPER ROSTER KALENDER & JADWAL KERJA (INDONESIA)
  // ==========================================================================
  const INDO_DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  const INDO_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  function formatIndoDate(dateStr) {
    if (!dateStr) return "-";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${INDO_DAYS[dt.getDay()]}, ${d} ${INDO_MONTHS_SHORT[m - 1]} ${y}`;
  }

  function getWeekCalendarRange(baseDateStr, weekOffset = 0) {
    const [y, m, d] = baseDateStr.split("-").map(Number);
    const curr = new Date(y, m - 1, d);
    const dayOfWeek = curr.getDay();
    const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + diffToMonday + weekOffset * 7);

    const days = [];
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday);
      dt.setDate(monday.getDate() + i);
      const dy = dt.getFullYear();
      const dm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      const dateStr = `${dy}-${dm}-${dd}`;
      days.push({
        dateStr,
        dayNum: dd,
        dayName: INDO_DAYS[dt.getDay()],
        monthShort: INDO_MONTHS_SHORT[dt.getMonth()],
        dateObj: dt,
      });
    }

    const first = days[0];
    const last = days[6];
    const label = `${first.dayNum} ${first.monthShort} - ${last.dayNum} ${last.monthShort} ${last.dateObj.getFullYear()}`;
    return { days, label, mondayStr: first.dateStr, sundayStr: last.dateStr };
  }

  const INDO_MONTHS_FULL = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];

  function getMonthCalendarRange(baseDateStr, monthOffset = 0) {
    const [baseY, baseM] = baseDateStr.split("-").map(Number);
    const targetDt = new Date(baseY, baseM - 1 + monthOffset, 1);
    const y = targetDt.getFullYear();
    const m = targetDt.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    const days = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const dy = dt.getFullYear();
      const dm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      const dateStr = `${dy}-${dm}-${dd}`;
      days.push({
        dateStr,
        dayNum: dd,
        dayName: INDO_DAYS[dt.getDay()],
        monthShort: INDO_MONTHS_SHORT[m],
        monthFull: INDO_MONTHS_FULL[m],
        year: y,
        dayOfWeek: dt.getDay(),
        dateObj: dt,
      });
    }

    const firstDayOfWeek = new Date(y, m, 1).getDay();
    const leadingDaysCount = (firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1);
    const gridDays = [];

    const prevMonthDaysCount = new Date(y, m, 0).getDate();
    for (let i = leadingDaysCount - 1; i >= 0; i--) {
      const prevD = prevMonthDaysCount - i;
      const prevDt = new Date(y, m - 1, prevD);
      const dy = prevDt.getFullYear();
      const dm = String(prevDt.getMonth() + 1).padStart(2, "0");
      const dd = String(prevD).padStart(2, "0");
      gridDays.push({
        dateStr: `${dy}-${dm}-${dd}`,
        dayNum: dd,
        dayName: INDO_DAYS[prevDt.getDay()],
        monthShort: INDO_MONTHS_SHORT[prevDt.getMonth()],
        year: dy,
        isCurrentMonth: false,
        dateObj: prevDt,
      });
    }

    days.forEach((d) => {
      gridDays.push({
        ...d,
        isCurrentMonth: true,
      });
    });

    const remaining = (7 - (gridDays.length % 7)) % 7;
    for (let j = 1; j <= remaining; j++) {
      const nextDt = new Date(y, m + 1, j);
      const dy = nextDt.getFullYear();
      const dm = String(nextDt.getMonth() + 1).padStart(2, "0");
      const dd = String(j).padStart(2, "0");
      gridDays.push({
        dateStr: `${dy}-${dm}-${dd}`,
        dayNum: dd,
        dayName: INDO_DAYS[nextDt.getDay()],
        monthShort: INDO_MONTHS_SHORT[nextDt.getMonth()],
        year: dy,
        isCurrentMonth: false,
        dateObj: nextDt,
      });
    }

    const first = days[0];
    const last = days[days.length - 1];
    const label = `${INDO_MONTHS_FULL[m]} ${y}`;
    return {
      days,
      gridDays,
      label,
      year: y,
      month: m + 1,
      monthName: INDO_MONTHS_FULL[m],
      startDateStr: first.dateStr,
      endDateStr: last.dateStr,
    };
  }

  function getDepartmentBadge(dept) {
    const d = String(dept || "bar").toLowerCase();
    if (d === "kitchen") {
      return `<span class="badge" style="background:#ffedd5;color:#9a3412;border:1px solid #fed7aa;font-weight:700;">🍳 Kitchen</span>`;
    }
    if (d === "manager") {
      return `<span class="badge" style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;font-weight:700;">👔 Manajer</span>`;
    }
    return `<span class="badge" style="background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0;font-weight:700;">🍹 Bar</span>`;
  }

  function getDepartmentLabel(dept) {
    const d = String(dept || "bar").toLowerCase();
    if (d === "kitchen") return "🍳 Kitchen";
    if (d === "manager") return "👔 Manajer";
    return "🍹 Bar";
  }

  function getColleaguesForSchedule(dateStr, shiftId, currentUserId) {
    const s = Core.state;
    if (!dateStr || !shiftId) return [];
    const activeProfiles = s.profiles.filter((p) => p.status === "active" && p.first_login_approved);

    const matches = s.workSchedules.filter(
      (sc) =>
        sc.schedule_date === dateStr &&
        sc.shift_id === shiftId &&
        sc.schedule_type === "work" &&
        sc.employee_id !== currentUserId
    );

    return matches.map((sc) => {
      const emp =
        activeProfiles.find((p) => p.id === sc.employee_id) ||
        s.profiles.find((p) => p.id === sc.employee_id);
      return {
        id: sc.employee_id,
        name: emp?.full_name || "Karyawan",
        role: emp?.role || "member",
        department: emp?.department || "bar",
        code: emp?.employee_code || "",
        notes: sc.notes,
        profile: emp,
      };
    });
  }

  function renderMemberScheduleHomeWidget(todayDateStr, currentUserId) {
    const s = Core.state;
    const u = s.currentUser;
    const week = getWeekCalendarRange(todayDateStr, 0);

    const todaySched = Core.getScheduleForDate(todayDateStr, currentUserId);
    const todayShift = todaySched?.shift_id
      ? s.shifts.find((x) => x.id === todaySched.shift_id)
      : null;
    const isTodayOff = todaySched?.schedule_type === "off";
    const colleagues = todayShift
      ? getColleaguesForSchedule(todayDateStr, todayShift.id, currentUserId)
      : [];

    return `
      <div class="card" style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
          <div>
            <div style="font-size:11px;font-weight:800;color:var(--coffee-700);text-transform:uppercase;">
              Jadwal Kerja: ${esc(u?.full_name || "Karyawan")} (${esc(u?.employee_code || "KARYAWAN")})
            </div>
            <h3 style="font-size:15px;font-weight:800;margin:0 0 2px 0;">🗓️ Roster Jadwal Kerja Saya (Minggu Ini)</h3>
            <p style="font-size:11.5px;color:var(--stone-500);margin:0;">
              Jadwal shift &amp; hari libur resmi yang diatur oleh Admin Suka Latte.
            </p>
          </div>
          <button class="btn btn-outline btn-sm" data-action="nav" data-target="jadwal_saya" style="font-size:11px;padding:4px 10px;">
            Lihat Jadwal 1 Bulan ›
          </button>
        </div>

        <div class="schedule-week-strip">
          ${week.days
            .map((d) => {
              const isToday = d.dateStr === todayDateStr;
              const sched = Core.getScheduleForDate(d.dateStr, currentUserId);
              const isOff = sched?.schedule_type === "off";
              const sh = sched?.shift_id
                ? s.shifts.find((x) => x.id === sched.shift_id)
                : null;

              return `
                <div class="schedule-day-pill ${isToday ? "is-today" : ""} ${isOff ? "is-off" : ""}">
                  <span class="sched-pill-day">${esc(d.dayName.slice(0, 3))}</span>
                  <span class="sched-pill-date">${d.dayNum}</span>
                  ${
                    isOff
                      ? `<span class="badge-pill-off">LIBUR</span>`
                      : sh
                      ? `<span class="badge-pill-shift">${esc(sh.name.split(" ")[1] || sh.name.slice(0, 5))}</span>`
                      : `<span class="badge-pill-none">-</span>`
                  }
                  ${sched?.notes ? `<span class="sched-pill-note" title="${esc(sched.notes)}">${esc(sched.notes)}</span>` : ""}
                </div>
              `;
            })
            .join("")}
        </div>

        <!-- REKAN SATU SHIFT HARI INI -->
        ${
          !isTodayOff && todayShift
            ? `
          <div style="margin-top:10px;padding:9px 12px;background:#fef3c7;border:1px solid #fde68a;border-radius:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div style="font-size:12px;color:#92400e;">
              👥 <strong>Teman Shift Anda Hari Ini (${esc(todayShift.name)}):</strong>
              ${
                colleagues.length > 0
                  ? `<span style="font-weight:700;"> ${colleagues.map((c) => esc(c.name)).join(", ")}</span>`
                  : `<span style="font-style:italic;"> (Hanya Anda yang bertugas di shift ini)</span>`
              }
            </div>
            <button class="btn btn-outline btn-xs" data-action="nav" data-target="jadwal_saya" style="border-color:#d97706;color:#92400e;padding:3px 8px;font-size:10.5px;">
              Detail Jadwal Bulanan ›
            </button>
          </div>
          `
            : isTodayOff
            ? `
          <div style="margin-top:10px;padding:9px 12px;background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;font-size:12px;color:var(--rose-900);">
            🏖️ <strong>Hari Ini Libur Pribadi (Day Off).</strong> Anda tidak perlu melakukan absensi selfie.
          </div>
          `
            : ""
        }
      </div>
    `;
  }

  // ==========================================================================
  // 5. TAMPILAN TERISOLASI KHUSUS ANGGOTA (HANYA ABSENSI & CEK RIWAYAT SENDIRI)
  //    Anggota TIDAK BISA mengakses Control Panel, Laporan Global, atau Data Orang Lain!
  // ==========================================================================
  function renderMemberAttendanceHome(parts, myToday, canCheckIn, canCheckOut) {
    const s = Core.state;
    const u = s.currentUser;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const myOutlet = s.outlets.find((o) => o.id === u.outlet_id) || s.outlets[0];
    const activeShifts = s.shifts.filter((sh) => sh.status === "active");

    // Sinkronisasi otomatis shift hari ini dari Roster Jadwal Kerja Admin
    const myTodaySchedule = Core.getScheduleForDate(parts.dateString, u.id);
    const scheduledShift = myTodaySchedule?.shift_id
      ? s.shifts.find((sh) => sh.id === myTodaySchedule.shift_id)
      : null;
    const isTodayScheduledOff = myTodaySchedule?.schedule_type === "off";

    const myShift =
      scheduledShift ||
      s.shifts.find((sh) => sh.id === (myToday?.shift_id || u.shift_id)) ||
      activeShifts[0] ||
      s.shifts[0];
    const selectedShiftId = myShift ? myShift.id : u.shift_id;
    const { todayHolidays, myTodayApprovedLeave } = getHolidayAndLeaveSummary(parts.dateString, u.id);

    return `
      ${
        !u.face_id_enrolled
          ? `<div class="card" style="margin-bottom:16px;border:1.5px solid #f59e0b;background:#fffbeb;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <div style="font-size:13.5px;font-weight:800;color:#92400e;display:flex;align-items:center;gap:6px;">
                  <span>🔐</span>
                  <span>Wajib Daftarkan 1 Wajah Face ID Anda</span>
                </div>
                <div style="font-size:11.5px;color:#b45309;margin-top:2px;">
                  Sistem Suka Latte hanya menerima 1 wajah resmi pada 1 akun Google untuk mencegah joki absensi dan menjaga profesionalitas kerja.
                </div>
              </div>
              <button type="button" class="btn btn-primary btn-sm" data-action="open-face-id-enrollment" style="padding:6px 14px;font-size:12px;font-weight:700;">
                📸 Daftarkan Face ID Sekarang
              </button>
            </div>`
          : ""
      }

      ${
        isTodayScheduledOff
          ? `<div class="card" style="margin-bottom:16px;border:1.5px solid #fca5a5;background:#fff1f2;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--rose-900);">
                  🏖️ Hari Ini Adalah Jadwal Libur Anda (Day Off)
                </div>
                <div style="font-size:12px;color:var(--rose-700);">
                  Berdasarkan roster jadwal yang ditetapkan Pengelola, Anda dijadwalkan LIBUR hari ini. Anda tidak perlu melakukan absensi selfie.
                </div>
              </div>
              <span class="badge badge-danger">LIBUR (OFF)</span>
            </div>`
          : ""
      }

      ${
        todayHolidays.length > 0
          ? `<div class="card" style="margin-bottom:16px;border:1.5px solid #fda4af;background:var(--rose-50);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--rose-800);">
                  🏖️ Hari Ini Adalah Hari Libur: ${esc(todayHolidays.map((h) => h.title).join(", "))}
                </div>
                <div style="font-size:12px;color:var(--stone-700);">
                  ${esc(todayHolidays[0].reason)} • Absensi wajah di outlet hanya dilakukan jika Anda dijadwalkan masuk bertugas.
                </div>
              </div>
              <span class="badge badge-danger">LIBUR RESMI</span>
            </div>`
          : ""
      }

      ${
        myTodayApprovedLeave
          ? `<div class="card" style="margin-bottom:16px;border:1.5px solid #6ee7b7;background:var(--emerald-50);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--emerald-800);">
                  ✅ Pengajuan ${esc(getLeaveTypeLabel(myTodayApprovedLeave.type))} Anda Hari Ini Sudah Disetujui: ${esc(myTodayApprovedLeave.title)}
                </div>
                <div style="font-size:12px;color:var(--emerald-700);">
                  Periode ${esc(myTodayApprovedLeave.date_start)} s/d ${esc(myTodayApprovedLeave.date_end)} • Anda tidak perlu Check In wajah di outlet hari ini.
                </div>
              </div>
              <span class="badge badge-success">DISETUJUI</span>
            </div>`
          : ""
      }

      <!-- 3 LANGKAH MUDAH UNTUK KARYAWAN (TOMBOL AKTIF DAPAT DIKLIK) -->
      <div class="staff-steps-grid">
        <button
          type="button"
          class="staff-step-card ${selectedShiftId ? "active" : ""}"
          data-action="step-click-shift"
          title="Ketuk untuk memilih / mengganti shift kerja"
        >
          <div class="staff-step-num">${canCheckIn ? "1" : "✓"}</div>
          <div class="staff-step-content">
            <div class="staff-step-title">1. Shift Kerja</div>
            <div class="staff-step-desc">${esc(myShift ? myShift.name : "Pilih Shift")} ▾</div>
          </div>
        </button>

        <button
          type="button"
          class="staff-step-card ${myToday?.check_in_at ? "active" : ""}"
          data-action="step-click-attendance"
          title="${canCheckIn ? "Ketuk untuk Check In Masuk Sekarang" : canCheckOut ? "Ketuk untuk Check Out Pulang Sekarang" : "Presensi kehadiran hari ini sudah selesai"}"
        >
          <div class="staff-step-num">${myToday?.check_in_at ? "✓" : "2"}</div>
          <div class="staff-step-content">
            <div class="staff-step-title">2. Absen Hadir</div>
            <div class="staff-step-desc">${canCheckIn ? "📷 Klik Check In" : canCheckOut ? "📷 Klik Check Out" : "✓ Sudah Hadir"}</div>
          </div>
        </button>

        <button
          type="button"
          class="staff-step-card ${myToday?.check_out_at ? "active" : ""}"
          data-action="step-click-leave"
          title="Ketuk untuk selesai kerja atau mengajukan izin/cuti"
        >
          <div class="staff-step-num">${myToday?.check_out_at ? "✓" : "3"}</div>
          <div class="staff-step-content">
            <div class="staff-step-title">3. Selesai / Izin</div>
            <div class="staff-step-desc">${canCheckOut ? "Selesai / Izin" : myToday?.check_out_at ? "✓ Sudah Selesai" : "📅 Ajukan Izin"}</div>
          </div>
        </button>
      </div>

      <div class="hero-banner">
        <div class="grid-12" style="align-items:center;">
          <div class="col-7">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
              <span class="badge" style="background:rgba(218,175,118,0.18);color:var(--gold-200);border:1px solid rgba(218,175,118,0.3);">
                ☕ ${esc(parts.dateString)} (${esc(tz)})
              </span>
              <span class="badge badge-coffee mono" style="background:rgba(255,255,255,0.08);color:var(--gold-200);">ID: ${esc(u.employee_code)}</span>
              ${
                u.face_id_enrolled
                  ? `<span class="badge" style="background:rgba(16,185,129,0.18);color:#6ee7b7;border:1px solid rgba(16,185,129,0.35);font-size:10px;">🔒 Face ID Aktif (1 Wajah)</span>`
                  : `<span class="badge" style="background:rgba(245,158,11,0.18);color:#fde68a;border:1px solid rgba(245,158,11,0.35);font-size:10px;">⚠️ Belum Face ID</span>`
              }
            </div>
            <h1 style="font-size:22px;font-weight:800;margin-bottom:4px;letter-spacing:-0.02em;">Selamat Bertugas, ${esc(u.full_name)}</h1>
            <p style="font-size:12px;color:var(--coffee-200);margin-bottom:12px;">
              Outlet: <strong style="color:var(--white);">${esc(myOutlet ? myOutlet.name : "Suka Latte")}</strong> •
              Shift: <strong style="color:var(--white);">${esc(myShift ? `${myShift.name} (${String(myShift.start_time).slice(0, 5)}–${String(myShift.end_time).slice(0, 5)})` : "-")}</strong>
            </p>
            ${renderShiftSelectorHtml(s.shifts, selectedShiftId, !canCheckIn)}
            <div class="hero-actions-wrap">
              ${
                canCheckIn
                  ? `<button class="btn btn-emerald hero-cta-btn" data-action="open-camera" data-mode="check_in">
                      📷 Check In Masuk Sekarang (${esc(myShift ? myShift.name : "Shift")})
                    </button>
                    <div style="font-size:11px;color:var(--coffee-300);text-align:center;margin-top:-2px;margin-bottom:4px;">
                      Ambil foto selfie di area outlet untuk verifikasi kehadiran
                    </div>`
                  : ""
              }
              ${
                canCheckOut
                  ? `<button class="btn btn-amber hero-cta-btn" data-action="open-camera" data-mode="check_out">
                      📷 Check Out Pulang Sekarang (${esc(myShift ? myShift.name : "Shift")})
                    </button>
                    <div style="font-size:11px;color:var(--coffee-300);text-align:center;margin-top:-2px;margin-bottom:4px;">
                      Konfirmasi selfie pulang di akhir jam kerja bertugas
                    </div>`
                  : ""
              }
              ${
                !canCheckIn && !canCheckOut && myToday?.check_in_at && myToday?.check_out_at
                  ? `<div class="hero-completed-card">
                      <div class="hero-completed-icon">✓</div>
                      <div>
                        <div class="hero-completed-title">Presensi Hari Ini Lengkap &amp; Selesai</div>
                        <div class="hero-completed-desc">
                          Masuk: <strong>${Core.formatOperationalDateTime(myToday.check_in_at, tz, false).slice(12, 17)}</strong> • 
                          Pulang: <strong>${Core.formatOperationalDateTime(myToday.check_out_at, tz, false).slice(12, 17)}</strong> • 
                          Durasi: <strong>${Core.formatDurationMinutes(myToday.work_duration_minutes)}</strong><br/>
                          <span style="color:#6ee7b7;font-weight:700;">Terima kasih atas kerja keras Anda hari ini! ☕</span>
                        </div>
                      </div>
                    </div>`
                  : ""
              }
              <div class="hero-secondary-btns">
                <button class="btn btn-outline hero-sub-btn" style="background:rgba(255,255,255,0.12);color:var(--gold-200);border-color:rgba(218,175,118,0.4);" data-action="open-switch-shift-modal" title="Alihkan shift bertugas hari ini">
                  🔄 Alihkan Shift
                </button>
                <button class="btn btn-gold hero-sub-btn" data-action="open-member-leave" title="Ajukan izin tidak masuk kerja atau cuti">
                  📅 Ajukan Izin / Cuti
                </button>
                <button class="btn btn-outline hero-sub-btn" style="background:rgba(255,255,255,0.1);color:var(--gold-200);border-color:rgba(218,175,118,0.35);" data-action="nav" data-target="riwayat_saya">
                  📋 Riwayat Saya
                </button>
              </div>
            </div>
          </div>

          <div class="col-5">
            <div style="background:rgba(12,7,4,0.68);backdrop-filter:blur(10px);border:1px solid rgba(218,175,118,0.24);border-radius:18px;padding:18px;font-size:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
                <span style="color:var(--gold-300);font-weight:800;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;">Ringkasan Hari Ini (${esc(myShift ? myShift.name : "-")})</span>
                ${myToday ? Core.getStatusBadgeHtml(myToday.attendance_status, myToday.late_minutes) : Core.getStatusBadgeHtml("belum_check_in")}
              </div>
              <div class="hero-time-tiles" style="margin-bottom:12px;">
                <div class="hero-time-box">
                  <div class="hero-time-label">Check In (Server)</div>
                  <div class="mono hero-time-val">
                    ${myToday?.check_in_at ? Core.formatOperationalDateTime(myToday.check_in_at, tz, false) : "--:--:--"}
                  </div>
                </div>
                <div class="hero-time-box">
                  <div class="hero-time-label">Check Out (Server)</div>
                  <div class="mono hero-time-val">
                    ${myToday?.check_out_at ? Core.formatOperationalDateTime(myToday.check_out_at, tz, false) : "--:--:--"}
                  </div>
                </div>
              </div>
              <div style="font-size:11.5px;color:var(--coffee-200);display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
                <span>Durasi Kerja: <strong style="color:var(--white);">${Core.formatDurationMinutes(myToday?.work_duration_minutes)}</strong></span>
                ${myToday?.late_minutes > 0 ? `<span style="color:#fdba74;font-weight:800;">⏱ Terlambat ${myToday.late_minutes} menit</span>` : `<span style="color:#6ee7b7;font-weight:700;">● Siap Sinkronisasi</span>`}
              </div>
            </div>
          </div>
        </div>
      </div>

      ${
        myToday
          ? `<div id="today-attendance-card" class="card">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
                <div>
                  <h2 style="font-size:16px;font-weight:800;">Output Absensi Anda Hari Ini</h2>
                  <p style="font-size:11.5px;color:var(--stone-600);">Tercatat langsung di server WITA beserta bukti selfie kamera &amp; jarak GPS outlet.</p>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <button class="btn btn-outline btn-xs" data-action="open-switch-shift-modal" style="border-color:var(--coffee-400);color:var(--coffee-900);padding:4px 10px;font-weight:700;">
                    🔄 Alihkan / Ganti Shift
                  </button>
                  ${Core.getStatusBadgeHtml(myToday.attendance_status, myToday.late_minutes)}
                </div>
              </div>
              ${renderAttendanceRecordCard(myToday, tz, false)}
            </div>`
          : ""
      }

      ${renderMemberScheduleHomeWidget(parts.dateString, u.id)}

      ${renderMemberHolidayAndLeaveCard(parts.dateString, u.id)}

      <div class="grid-12">
        <div class="col-7">
          ${renderGeofenceMapCard(myOutlet, null)}
        </div>
        <div class="col-5 card" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:15px;font-weight:800;margin-bottom:6px;">Panduan Absensi &amp; Izin Staf Suka Latte</h3>
            <ul style="font-size:12px;color:var(--stone-600);line-height:1.7;padding-left:18px;">
              <li>Pilih <strong>Shift Pagi</strong> atau <strong>Shift Siang</strong> sebelum Check In sesuai jadwal jaga Anda.</li>
              <li><strong>Absensi Selfie Wajah + GPS Outlet</strong> hanya diwajibkan untuk menandakan Anda masuk hadir di area <strong>${esc(myOutlet ? myOutlet.name : "Suka Latte")}</strong>.</li>
              <li>Jika berhalangan hadir atau ingin mengajukan <strong>Izin / Sakit / Cuti / Libur</strong>, gunakan tombol <strong>Ajukan Izin / Cuti</strong> dari mana saja tanpa harus berada di outlet.</li>
              <li>Check In melebihi toleransi <strong>15 menit</strong> dari jam mulai shift otomatis tercatat sebagai <strong>Terlambat</strong>.</li>
            </ul>
          </div>
          <div class="card-subtle" style="font-size:11.5px;color:var(--stone-600);">
            🔒 Akun Anggota hanya dapat mengakses Dashboard Absensi, Riwayat Pribadi, dan Pengajuan Izin/Cuti. Control Panel khusus Super Admin &amp; Admin.
          </div>
        </div>
      </div>
    `;
  }

  function renderMemberOwnHistoryView(uiState) {
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const myRecords = s.attendance.filter((a) => a.employee_id === s.currentUser.id);

    const filtered = myRecords.filter((r) => {
      if (uiState.archivePeriodFilter !== "all" && r.archive_period_key !== uiState.archivePeriodFilter) {
        return false;
      }
      return true;
    });

    const periodSet = Array.from(new Set(myRecords.map((r) => r.archive_period_key))).sort().reverse();
    const totalMins = filtered.reduce((acc, r) => acc + (r.work_duration_minutes || 0), 0);

    return `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--coffee-700);">Riwayat Pribadi Anggota</span>
          <h2 style="font-size:19px;font-weight:800;">Riwayat Kehadiran &amp; Bukti Selfie Saya</h2>
          <p style="font-size:12px;color:var(--stone-600);">Menampilkan catatan kehadiran milik akun Anda sendiri (${esc(s.currentUser.full_name)}) • Total Durasi: <strong>${Core.formatDurationMinutes(totalMins)}</strong></p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" data-action="open-member-leave">
            📅 + Ajukan Izin / Cuti
          </button>
          <select id="member-period-select" class="form-select" style="width:auto;">
            <option value="all" ${uiState.archivePeriodFilter === "all" ? "selected" : ""}>Semua Bulan</option>
            ${periodSet
              .map(
                (pk) =>
                  `<option value="${esc(pk)}" ${uiState.archivePeriodFilter === pk ? "selected" : ""}>Periode ${esc(pk)}</option>`
              )
              .join("")}
          </select>
        </div>
      </div>

      ${
        filtered.length === 0
          ? `<div class="card" style="text-align:center;padding:42px;margin-bottom:18px;">
              <div style="font-size:15px;font-weight:800;">Belum Ada Catatan Absensi Pribadi</div>
              <p style="font-size:12px;color:var(--stone-500);margin-top:4px;">Catatan Check In dan Check Out Anda akan otomatis muncul di sini.</p>
            </div>`
          : `<div class="grid-2" style="margin-bottom:18px;">
              ${filtered.map((rec) => renderAttendanceRecordCard(rec, tz, false)).join("")}
            </div>`
      }

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
          <div>
            <h3 style="font-size:16px;font-weight:800;">Riwayat Pengajuan Izin, Sakit &amp; Cuti Saya</h3>
            <p style="font-size:11.5px;color:var(--stone-500);">Pengajuan tidak masuk atau libur pribadi yang dikirim ke Admin / Super Admin.</p>
          </div>
          <button class="btn btn-outline btn-sm" data-action="open-member-leave">
            + Ajukan Izin / Cuti Baru
          </button>
        </div>
        ${renderMyLeaveListHtml(s.currentUser.id)}
      </div>
    `;
  }

  // ==========================================================================
  // 5.2 TAMPILAN KHUSUS ANGGOTA: ROSTER JADWAL KERJA BULANAN & REKAN SHIFT
  // ==========================================================================
  function renderMemberScheduleView(uiState) {
    const s = Core.state;
    const u = s.currentUser;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
    const offset = uiState.scheduleMonthOffset || 0;
    const month = getMonthCalendarRange(parts.dateString, offset);
    const subTab = uiState.scheduleTab || "mine";

    // Hitung ringkasan statistik jadwal bulanan untuk karyawan aktif
    let totalWorkDays = 0;
    let morningCount = 0;
    let afternoonCount = 0;
    let offCount = 0;

    month.days.forEach((d) => {
      const sched = Core.getScheduleForDate(d.dateStr, u.id);
      if (sched?.schedule_type === "off") {
        offCount++;
      } else {
        totalWorkDays++;
        const sh = sched?.shift_id ? s.shifts.find((x) => x.id === sched.shift_id) : null;
        if (sh && sh.name.toLowerCase().includes("siang")) {
          afternoonCount++;
        } else {
          morningCount++;
        }
      }
    });

    const incomingSwaps = (s.shiftSwaps || []).filter(
      (sw) => sw.target_employee_id === u.id && sw.status === "pending"
    );

    return `
      <div class="hero-banner">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="badge" style="background:rgba(218,175,118,0.18);color:var(--gold-200);border:1px solid rgba(218,175,118,0.3);">
              🗓️ Roster Jadwal Kerja Bulanan
            </span>
            <span class="badge badge-coffee mono" style="background:rgba(255,255,255,0.08);color:var(--gold-200);">
              ${esc(u.employee_code || "KARYAWAN")}
            </span>
          </div>

          <button class="btn btn-amber btn-sm" data-action="open-shift-swap-modal" style="display:flex;align-items:center;gap:5px;font-size:12px;padding:6px 12px;font-weight:700;">
            <span>🔁</span>
            <span>Ajukan Tukar Shift / Libur</span>
          </button>
        </div>

        <h2 style="font-size:21px;font-weight:800;margin-bottom:4px;letter-spacing:-0.02em;">
          Jadwal Kerja: ${esc(u.full_name)}
        </h2>
        <p style="font-size:12px;color:var(--coffee-200);margin-bottom:14px;max-width:720px;">
          Jadwal operasional &amp; rekan satu shift bulan <strong>${esc(month.label)}</strong> di Suka Latte. Disusun rapi per nama agar mudah dibaca di layar HP.
        </p>

        <!-- KONTROL NAVIGASI BULANAN -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;background:rgba(12,7,4,0.6);border:1px solid rgba(218,175,118,0.25);border-radius:14px;padding:10px 14px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" data-action="schedule-prev-month" style="color:var(--gold-200);border-color:rgba(218,175,118,0.35);padding:5px 10px;font-size:12px;">
              ‹ Bulan Lalu
            </button>
            <button class="btn btn-primary btn-sm" data-action="schedule-today-month" style="padding:5px 12px;font-size:12px;">
              Bulan Ini
            </button>
            <button class="btn btn-outline btn-sm" data-action="schedule-next-month" style="color:var(--gold-200);border-color:rgba(218,175,118,0.35);padding:5px 10px;font-size:12px;">
              Bulan Depan ›
            </button>
          </div>
          <div style="font-size:13.5px;font-weight:800;color:var(--gold-200);">
            📅 ${esc(month.label)}
          </div>
        </div>
      </div>

      <!-- NOTIFIKASI PERMINTAAN TUKAR SHIFT DARI REKAN KERJA -->
      ${
        incomingSwaps.length > 0
          ? `
        <div class="card" style="margin-bottom:16px;border:1.5px solid #f59e0b;background:#fffbeb;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <div>
            <div style="font-size:13.5px;font-weight:800;color:#92400e;display:flex;align-items:center;gap:6px;">
              <span>🔔</span>
              <span>Ada ${incomingSwaps.length} Permintaan Tukar Shift Menunggu Persetujuan Anda!</span>
            </div>
            <div style="font-size:11.5px;color:#b45309;margin-top:2px;">
              Rekan kerja Anda mengajukan pertukaran shift kerja / libur. Persetujuan kedua belah pihak diperlukan agar jadwal diperbarui otomatis.
            </div>
          </div>
          <button class="btn btn-amber btn-sm" data-action="schedule-subtab" data-tab="swaps" style="padding:6px 14px;font-size:12px;font-weight:700;">
            Lihat &amp; Tanggapi Permintaan ›
          </button>
        </div>
        `
          : ""
      }

      <!-- RINGKASAN STATISTIK BULANAN SAYA -->
      <div class="schedule-month-stats">
        <div class="sched-stat-card">
          <span class="sched-stat-label">Total Hari Kerja</span>
          <span class="sched-stat-num">${totalWorkDays} <span style="font-size:12px;font-weight:normal;color:var(--stone-500);">Hari</span></span>
        </div>
        <div class="sched-stat-card">
          <span class="sched-stat-label">Shift Pagi</span>
          <span class="sched-stat-num" style="color:#b45309;">${morningCount} <span style="font-size:12px;font-weight:normal;color:var(--stone-500);">Hari</span></span>
        </div>
        <div class="sched-stat-card">
          <span class="sched-stat-label">Shift Siang</span>
          <span class="sched-stat-num" style="color:#4338ca;">${afternoonCount} <span style="font-size:12px;font-weight:normal;color:var(--stone-500);">Hari</span></span>
        </div>
        <div class="sched-stat-card">
          <span class="sched-stat-label">Libur (Day Off)</span>
          <span class="sched-stat-num" style="color:var(--rose-700);">${offCount} <span style="font-size:12px;font-weight:normal;color:var(--stone-500);">Hari</span></span>
        </div>
      </div>

      <!-- TAB PILIHAN ANGGOTA: JADWAL SAYA VS REKAN TIM VS KALENDER VS TUKAR SHIFT -->
      <div class="tab-pills" style="margin-bottom:16px;">
        <button class="tab-pill ${subTab === "mine" ? "active" : ""}" data-action="schedule-subtab" data-tab="mine">
          <span>📅 Jadwal Saya Sendiri (1 Bulan)</span>
        </button>
        <button class="tab-pill ${subTab === "team" ? "active" : ""}" data-action="schedule-subtab" data-tab="team">
          <span>👥 Jadwal Tim Outlet (${esc(s.outlets[0]?.name || "Suka Latte")})</span>
        </button>
        <button class="tab-pill ${subTab === "calendar" ? "active" : ""}" data-action="schedule-subtab" data-tab="calendar">
          <span>🗓️ Kalender Bulanan</span>
        </button>
        <button class="tab-pill ${subTab === "swaps" ? "active" : ""}" data-action="schedule-subtab" data-tab="swaps">
          <span>🔁 Tukar Shift &amp; Libur ${incomingSwaps.length > 0 ? `<span class="badge badge-amber" style="margin-left:4px;font-size:10px;padding:2px 6px;">${incomingSwaps.length} Baru</span>` : ""}</span>
        </button>
      </div>

      ${
        subTab === "mine"
          ? renderMemberOwnScheduleList(month, parts.dateString, u, s, tz)
          : subTab === "team"
          ? renderMemberTeamScheduleList(month, parts.dateString, u, s, uiState)
          : subTab === "calendar"
          ? renderMemberMonthCalendarGrid(month, parts.dateString, u.id, s)
          : renderMemberShiftSwapsView(u, s, tz)
      }
    `;
  }

  function renderMemberOwnScheduleList(month, todayDateStr, u, s, tz) {
    return `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${month.days
          .map((d) => {
            const isToday = d.dateStr === todayDateStr;
            const sched = Core.getScheduleForDate(d.dateStr, u.id);
            const sh = sched?.shift_id
              ? s.shifts.find((x) => x.id === sched.shift_id)
              : null;
            const isOff = sched?.schedule_type === "off";
            const outlet = sched?.outlet_id
              ? s.outlets.find((o) => o.id === sched.outlet_id)
              : s.outlets[0];

            // Cari rekan-rekan yang satu shift dengan anggota ini pada tanggal ini
            const colleagues = !isOff && sh
              ? getColleaguesForSchedule(d.dateStr, sh.id, u.id)
              : [];

            // Cek absensi pada tanggal tersebut
            const att = s.attendance.find(
              (a) => a.employee_id === u.id && a.work_date === d.dateStr
            );

            return `
              <div class="schedule-roster-day-card ${isToday ? "is-today" : ""}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                  <div style="flex:1;min-width:240px;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      <strong style="font-size:14px;color:var(--stone-900);">${esc(d.dayName)}, ${d.dayNum} ${esc(d.monthShort)} ${d.year}</strong>
                      ${isToday ? `<span class="badge badge-amber" style="font-size:10px;">HARI INI</span>` : ""}
                    </div>

                    <div style="font-size:11.5px;font-weight:700;color:var(--coffee-800);margin-top:2px;">
                      👤 ${esc(u.full_name)} (${esc(u.employee_code || "KARYAWAN")})
                    </div>

                    <div style="margin-top:6px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                      ${
                        isOff
                          ? `<span class="badge badge-rose" style="font-size:11.5px;">🏖️ LIBUR / DAY OFF</span>`
                          : sh
                          ? `<span class="badge badge-amber" style="font-size:11.5px;">🌅 ${esc(sh.name)} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)})</span>`
                          : `<span class="badge" style="background:var(--stone-100);color:var(--stone-700);font-size:11.5px;">📋 Shift Standar</span>`
                      }
                      <span style="font-size:11.5px;color:var(--stone-600);">• Outlet: <strong>${esc(outlet ? outlet.name : "Suka Latte")}</strong></span>
                    </div>

                    <!-- DAFTAR NAMA REKAN SATU SHIFT -->
                    <div style="margin-top:8px;padding:8px 10px;background:var(--stone-50);border:1px solid var(--stone-200);border-radius:8px;">
                      <div style="font-size:11px;font-weight:700;color:var(--stone-600);margin-bottom:3px;">
                        👥 Rekan Satu Shift Anda:
                      </div>
                      ${
                        isOff
                          ? `<span style="font-size:11.5px;color:var(--rose-700);">🏖️ Anda dijadwalkan Libur (Day Off) hari ini.</span>`
                          : colleagues.length > 0
                          ? `<div class="colleague-tag-list">
                              ${colleagues
                                .map(
                                  (c) => `
                                <span class="colleague-tag">
                                  🤝 ${esc(c.name)} <span style="font-size:10px;opacity:0.8;">(${esc(c.role)})</span>
                                </span>
                              `
                                )
                                .join("")}
                            </div>`
                          : `<span style="font-size:11.5px;color:var(--stone-500);font-style:italic;">(Hanya Anda yang bertugas di shift ini)</span>`
                      }
                    </div>

                    ${
                      sched?.notes
                        ? `<div style="font-size:11.5px;color:var(--coffee-800);margin-top:5px;font-style:italic;">
                             💬 Catatan: "${esc(sched.notes)}"
                           </div>`
                        : ""
                    }
                  </div>

                  <div style="text-align:right;">
                    ${
                      att
                        ? `<span class="badge badge-emerald" style="font-size:11px;">
                             ✓ Hadir (${att.check_in_at ? Core.formatOperationalDateTime(att.check_in_at, tz, false).slice(12, 17) : "--:--"})
                           </span>`
                        : isToday && !isOff
                        ? `<button class="btn btn-emerald btn-sm" data-action="nav" data-target="absensi_saya" style="padding:6px 12px;font-size:12px;">
                             📷 Absen Sekarang
                           </button>`
                        : `<span style="font-size:11px;color:var(--stone-400);">${d.dateStr < todayDateStr ? "Selesai" : "Mendatang"}</span>`
                    }
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderMemberTeamScheduleList(month, todayDateStr, u, s, uiState = {}) {
    const activeProfiles = s.profiles.filter(
      (p) => p.status === "active" && p.first_login_approved
    );
    const deptFilter = uiState?.scheduleDeptFilter || "all";

    const allMonthScheds = s.workSchedules.filter(
      (sc) => sc.schedule_date >= month.startDateStr && sc.schedule_date <= month.endDateStr
    );
    const barCount = allMonthScheds.filter((sc) => {
      const p = activeProfiles.find((x) => x.id === sc.employee_id) || s.profiles.find((x) => x.id === sc.employee_id);
      return (p?.department || "bar") === "bar";
    }).length;
    const kitchenCount = allMonthScheds.filter((sc) => {
      const p = activeProfiles.find((x) => x.id === sc.employee_id) || s.profiles.find((x) => x.id === sc.employee_id);
      return p?.department === "kitchen";
    }).length;

    return `
      <!-- TAB FILTER 2 JADWAL: TIM BAR VS TIM KITCHEN -->
      <div class="tab-pills" style="margin-bottom:14px;gap:6px;flex-wrap:wrap;">
        <button class="tab-pill ${deptFilter === 'all' ? 'active' : ''}" data-action="filter-schedule-dept" data-dept="all">
          👥 Semua Tim (${allMonthScheds.length})
        </button>
        <button class="tab-pill ${deptFilter === 'bar' ? 'active' : ''}" data-action="filter-schedule-dept" data-dept="bar" style="${deptFilter === 'bar' ? '' : 'color:#065f46;'}">
          🍹 Tim Bar (${barCount})
        </button>
        <button class="tab-pill ${deptFilter === 'kitchen' ? 'active' : ''}" data-action="filter-schedule-dept" data-dept="kitchen" style="${deptFilter === 'kitchen' ? '' : 'color:#9a3412;'}">
          🍳 Tim Kitchen (${kitchenCount})
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${month.days
          .map((d) => {
            const isToday = d.dateStr === todayDateStr;
            let dayScheds = s.workSchedules.filter((x) => x.schedule_date === d.dateStr);

            if (deptFilter !== "all") {
              dayScheds = dayScheds.filter((sc) => {
                const emp = activeProfiles.find((p) => p.id === sc.employee_id) || s.profiles.find((p) => p.id === sc.employee_id);
                return (emp?.department || "bar") === deptFilter;
              });
            }

            // Shift user aktif hari ini
            const mySched = Core.getScheduleForDate(d.dateStr, u.id);
            const myIsOff = mySched?.schedule_type === "off";
            const myShift = mySched?.shift_id ? s.shifts.find((x) => x.id === mySched.shift_id) : null;

            const morningScheds = dayScheds.filter((sc) => {
              const sh = s.shifts.find((x) => x.id === sc.shift_id);
              return sc.schedule_type === "work" && (!sh || sh.name.toLowerCase().includes("pagi"));
            });
            const afternoonScheds = dayScheds.filter((sc) => {
              const sh = s.shifts.find((x) => x.id === sc.shift_id);
              return sc.schedule_type === "work" && sh && sh.name.toLowerCase().includes("siang");
            });
            const offScheds = dayScheds.filter((sc) => sc.schedule_type === "off");

            const renderTeamMemberItem = (sc, shiftType) => {
              const emp = activeProfiles.find((p) => p.id === sc.employee_id) || s.profiles.find((p) => p.id === sc.employee_id);
              const isMe = sc.employee_id === u.id;
              const isMyPartner = !myIsOff && myShift && myShift.name.toLowerCase().includes(shiftType) && !isMe;
              const bg = isMe
                ? (shiftType === "pagi" ? "#fef9c3" : shiftType === "siang" ? "#e0e7ff" : "#ffe4e6")
                : isMyPartner
                ? (shiftType === "pagi" ? "#fef3c7" : "#ede9fe")
                : "transparent";

              return `
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11.5px;padding:4px 6px;border-radius:6px;background:${bg};">
                  ${renderAvatarHtml(emp)}
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                      <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(emp?.full_name || "Karyawan")}</span>
                      ${getDepartmentBadge(emp?.department)}
                      ${isMe ? `<span class="badge badge-amber" style="font-size:9.5px;padding:1px 4px;">(Anda)</span>` : ""}
                    </div>
                    ${
                      isMyPartner
                        ? `<div style="font-size:10px;color:${shiftType === 'siang' ? '#4338ca' : '#b45309'};font-weight:700;">🤝 Partner Shift Anda</div>`
                        : sc.notes
                        ? `<div style="font-size:10px;color:var(--stone-500);">${esc(sc.notes)}</div>`
                        : ""
                    }
                  </div>
                </div>
              `;
            };

            return `
              <div class="schedule-roster-day-card ${isToday ? "is-today" : ""}">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:6px;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <strong style="font-size:14px;color:var(--stone-900);">${esc(d.dayName)}, ${d.dayNum} ${esc(d.monthShort)} ${d.year}</strong>
                    ${isToday ? `<span class="badge badge-amber" style="font-size:10px;">HARI INI</span>` : ""}
                  </div>
                  <div style="font-size:11.5px;color:var(--stone-600);">
                    ${
                      myIsOff
                        ? `<span class="badge badge-rose" style="font-size:10.5px;">🏖️ Anda Libur</span>`
                        : myShift
                        ? `<span class="badge badge-amber" style="font-size:10.5px;">Shift Anda: ${esc(myShift.name)}</span>`
                        : `<span style="color:var(--stone-500);">${dayScheds.length} jadwal</span>`
                    }
                  </div>
                </div>

                <div class="grid-3" style="gap:10px;">
                  <!-- SHIFT PAGI -->
                  <div style="background:var(--stone-50);border-radius:10px;padding:10px;border:1px solid #fef3c7;">
                    <div style="font-size:12px;font-weight:800;color:#92400e;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
                      <span>🌅 Shift Pagi</span>
                      <span class="badge" style="background:#fde68a;font-size:10px;">${morningScheds.length}</span>
                    </div>
                    ${
                      morningScheds.length > 0
                        ? morningScheds.map((sc) => renderTeamMemberItem(sc, "pagi")).join("")
                        : `<div style="font-size:11px;color:var(--stone-400);font-style:italic;">Belum ada jadwal</div>`
                    }
                  </div>

                  <!-- SHIFT SIANG -->
                  <div style="background:var(--stone-50);border-radius:10px;padding:10px;border:1px solid #e0e7ff;">
                    <div style="font-size:12px;font-weight:800;color:#3730a3;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
                      <span>🌇 Shift Siang</span>
                      <span class="badge" style="background:#c7d2fe;font-size:10px;">${afternoonScheds.length}</span>
                    </div>
                    ${
                      afternoonScheds.length > 0
                        ? afternoonScheds.map((sc) => renderTeamMemberItem(sc, "siang")).join("")
                        : `<div style="font-size:11px;color:var(--stone-400);font-style:italic;">Belum ada jadwal</div>`
                    }
                  </div>

                  <!-- LIBUR / OFF -->
                  <div style="background:var(--stone-50);border-radius:10px;padding:10px;border:1px solid #fecdd3;">
                    <div style="font-size:12px;font-weight:800;color:#9f1239;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
                      <span>🏖️ Libur (OFF)</span>
                      <span class="badge" style="background:#ffe4e6;font-size:10px;">${offScheds.length}</span>
                    </div>
                    ${
                      offScheds.length > 0
                        ? offScheds.map((sc) => renderTeamMemberItem(sc, "off")).join("")
                        : `<div style="font-size:11px;color:var(--stone-400);font-style:italic;">Tidak ada</div>`
                    }
                  </div>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderMemberMonthCalendarGrid(month, todayDateStr, userId, s) {
    const dayNames = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
    return `
      <div class="card" style="padding:14px;">
        <div style="font-size:13.5px;font-weight:800;color:var(--stone-900);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
          <span>🗓️ Kalender Bulanan: ${esc(month.label)}</span>
          <span style="font-size:11.5px;color:var(--stone-500);font-weight:normal;">Ketuk tanggal untuk cek shift</span>
        </div>

        <div class="month-calendar-grid">
          ${dayNames.map((name) => `<div class="month-calendar-day-header">${esc(name)}</div>`).join("")}
          ${month.gridDays
            .map((d) => {
              const isToday = d.dateStr === todayDateStr;
              const sched = d.isCurrentMonth ? Core.getScheduleForDate(d.dateStr, userId) : null;
              const isOff = sched?.schedule_type === "off";
              const sh = sched?.shift_id ? s.shifts.find((x) => x.id === sched.shift_id) : null;
              const isMorning = sh && sh.name.toLowerCase().includes("pagi");
              const isAfternoon = sh && sh.name.toLowerCase().includes("siang");

              return `
                <div class="month-calendar-day-cell ${!d.isCurrentMonth ? "other-month" : ""} ${isToday ? "is-today" : ""} ${isOff ? "is-off" : ""}">
                  <div class="month-cell-num">${d.dayNum}</div>
                  ${
                    d.isCurrentMonth
                      ? `
                    <div class="month-cell-badge">
                      ${
                        isOff
                          ? `<span class="badge badge-rose" style="font-size:9.5px;padding:1px 3px;">Libur</span>`
                          : isMorning
                          ? `<span class="badge badge-amber" style="font-size:9.5px;padding:1px 3px;">Pagi</span>`
                          : isAfternoon
                          ? `<span class="badge badge-coffee" style="font-size:9.5px;padding:1px 3px;">Siang</span>`
                          : sh
                          ? `<span class="badge" style="font-size:9.5px;padding:1px 3px;background:var(--stone-200);">${esc(sh.name.slice(0, 4))}</span>`
                          : `<span style="font-size:9px;color:var(--stone-400);">-</span>`
                      }
                    </div>
                  `
                      : ""
                  }
                </div>
              `;
            })
            .join("")}
        </div>

        <!-- LEGENDA KALENDER -->
        <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--border-soft,#e7e5e4);display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:11.5px;color:var(--stone-600);">
          <span style="font-weight:700;">Keterangan:</span>
          <span style="display:flex;align-items:center;gap:4px;"><span class="badge badge-amber" style="font-size:10px;padding:2px 6px;">Pagi</span> Shift Pagi</span>
          <span style="display:flex;align-items:center;gap:4px;"><span class="badge badge-coffee" style="font-size:10px;padding:2px 6px;">Siang</span> Shift Siang</span>
          <span style="display:flex;align-items:center;gap:4px;"><span class="badge badge-rose" style="font-size:10px;padding:2px 6px;">Libur</span> Day Off (Libur)</span>
          <span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;border:2px solid #10b981;"></span> Hari Ini</span>
        </div>
      </div>
    `;
  }

  function renderMemberShiftSwapsView(u, s, tz) {
    const allSwaps = s.shiftSwaps || [];
    const incoming = allSwaps.filter((sw) => sw.target_employee_id === u.id && sw.status === "pending");
    const outgoing = allSwaps.filter((sw) => sw.requester_id === u.id && sw.status === "pending");
    const history = allSwaps.filter(
      (sw) =>
        (sw.target_employee_id === u.id || sw.requester_id === u.id) &&
        sw.status !== "pending"
    );

    const getShiftLabel = (schedType, shiftId) => {
      if (schedType === "off") return "🏖️ Libur (Day Off)";
      const sh = s.shifts.find((x) => x.id === shiftId);
      return sh ? `🌅 ${sh.name} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)})` : "📋 Shift Kerja";
    };

    return `
      <div style="display:flex;flex-direction:column;gap:16px;">
        <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;background:linear-gradient(135deg,#fff8f0,#ffffff);border:1px solid #fde68a;">
          <div>
            <h3 style="font-size:15.5px;font-weight:800;margin:0 0 4px 0;color:var(--coffee-950);">
              🔁 Pertukaran Shift &amp; Libur Antar Karyawan
            </h3>
            <p style="font-size:12px;color:var(--stone-600);margin:0;max-width:680px;line-height:1.5;">
              Tukar jadwal shift masuk atau hari libur dengan rekan kerja atas persetujuan kedua belah pihak. Jadwal akan otomatis langsung diperbarui di roster setelah rekan Anda menyetujui.
            </p>
          </div>
          <button type="button" class="btn btn-amber" data-action="open-shift-swap-modal" style="display:flex;align-items:center;gap:6px;font-size:13px;padding:9px 16px;font-weight:700;">
            <span>➕</span>
            <span>Ajukan Tukar Shift / Libur</span>
          </button>
        </div>

        <!-- 1. PERMINTAAN MASUK (MENUNGGU PERSETUJUAN ANDA) -->
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
            <h4 style="font-size:14px;font-weight:800;color:var(--stone-900);margin:0;">
              📥 Permintaan Masuk Menunggu Persetujuan Anda
            </h4>
            <span class="badge ${incoming.length > 0 ? "badge-amber" : ""}" style="font-size:11px;">${incoming.length}</span>
          </div>

          ${
            incoming.length === 0
              ? `<div class="card-subtle" style="padding:16px;text-align:center;font-size:12px;color:var(--stone-500);font-style:italic;">
                  Tidak ada permintaan pertukaran shift dari rekan kerja saat ini.
                </div>`
              : `<div style="display:flex;flex-direction:column;gap:10px;">
                  ${incoming
                    .map((sw) => {
                      const reqEmp = s.profiles.find((p) => p.id === sw.requester_id);
                      return `
                        <div class="card" style="border:1.5px solid #fde68a;background:#fffdf7;padding:14px;">
                          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                              ${renderAvatarHtml(reqEmp)}
                              <div>
                                <div style="font-size:13.5px;font-weight:800;color:var(--stone-900);">
                                  ${esc(reqEmp ? reqEmp.full_name : "Rekan Kerja")}
                                  <span style="font-size:11px;color:var(--stone-500);font-weight:normal;">(${esc(reqEmp?.employee_code || "-")})</span>
                                </div>
                                <div style="font-size:11px;color:var(--coffee-700);">
                                  Diajukan pada ${esc(sw.created_at ? Core.formatOperationalDateTime(sw.created_at, tz, true) : "-")}
                                </div>
                              </div>
                            </div>
                            <span class="badge badge-amber" style="font-size:10.5px;">MENUNGGU ANDA</span>
                          </div>

                          <!-- RINCIAN PERTUKARAN -->
                          <div class="grid-2" style="gap:10px;background:var(--stone-50);padding:10px 12px;border-radius:10px;border:1px solid var(--stone-200);margin-bottom:10px;">
                            <div>
                              <div style="font-size:10.5px;font-weight:700;color:var(--stone-500);text-transform:uppercase;">
                                Jadwal Rekan (${esc(reqEmp?.full_name || "Pemohon")}):
                              </div>
                              <div style="font-size:12.5px;font-weight:800;color:var(--stone-900);margin-top:2px;">
                                📅 ${esc(sw.requester_date)}
                              </div>
                              <div style="font-size:12px;color:var(--coffee-900);font-weight:700;margin-top:2px;">
                                ${esc(getShiftLabel(sw.requester_schedule_type, sw.requester_shift_id))}
                              </div>
                            </div>

                            <div>
                              <div style="font-size:10.5px;font-weight:700;color:var(--stone-500);text-transform:uppercase;">
                                Ditukar Dengan Jadwal Anda:
                              </div>
                              <div style="font-size:12.5px;font-weight:800;color:var(--stone-900);margin-top:2px;">
                                📅 ${esc(sw.target_date)}
                              </div>
                              <div style="font-size:12px;color:var(--coffee-900);font-weight:700;margin-top:2px;">
                                ${esc(getShiftLabel(sw.target_schedule_type, sw.target_shift_id))}
                              </div>
                            </div>
                          </div>

                          ${
                            sw.requester_notes
                              ? `<div style="font-size:12px;color:var(--coffee-900);background:#fef3c7;padding:8px 10px;border-radius:8px;margin-bottom:12px;">
                                  💬 <strong>Alasan Rekan:</strong> "${esc(sw.requester_notes)}"
                                </div>`
                              : ""
                          }

                          <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
                            <button type="button" class="btn btn-outline btn-sm" data-action="respond-shift-swap" data-id="${esc(sw.id)}" data-accept="false" style="color:var(--rose-700);border-color:#fca5a5;font-size:12px;padding:6px 12px;">
                              ✕ Tolak Pertukaran
                            </button>
                            <button type="button" class="btn btn-emerald btn-sm" data-action="respond-shift-swap" data-id="${esc(sw.id)}" data-accept="true" style="font-size:12px;padding:6px 16px;font-weight:700;">
                              ✓ Setujui &amp; Tukar Jadwal Otomatis
                            </button>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>`
          }
        </div>

        <!-- 2. PENGAJUAN ANDA (MENUNGGU PERSETUJUAN REKAN) -->
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
            <h4 style="font-size:14px;font-weight:800;color:var(--stone-900);margin:0;">
              📤 Pengajuan Anda Yang Masih Menunggu Persetujuan Rekan
            </h4>
            <span class="badge" style="font-size:11px;">${outgoing.length}</span>
          </div>

          ${
            outgoing.length === 0
              ? `<div class="card-subtle" style="padding:14px;text-align:center;font-size:12px;color:var(--stone-500);font-style:italic;">
                  Tidak ada pengajuan tukar shift aktif yang sedang menunggu persetujuan.
                </div>`
              : `<div style="display:flex;flex-direction:column;gap:10px;">
                  ${outgoing
                    .map((sw) => {
                      const targetEmp = s.profiles.find((p) => p.id === sw.target_employee_id);
                      return `
                        <div class="card-subtle" style="padding:12px 14px;">
                          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                            <div>
                              <div style="font-size:13px;font-weight:800;color:var(--stone-900);">
                                Mengajukan ke: ${esc(targetEmp ? targetEmp.full_name : "Rekan Kerja")} (${esc(targetEmp?.employee_code || "-")})
                              </div>
                              <div style="font-size:11px;color:var(--stone-500);margin-top:2px;">
                                Jadwal Anda (${esc(sw.requester_date)}: ${esc(getShiftLabel(sw.requester_schedule_type, sw.requester_shift_id))}) ⇄ 
                                Jadwal Rekan (${esc(sw.target_date)}: ${esc(getShiftLabel(sw.target_schedule_type, sw.target_shift_id))})
                              </div>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                              <span class="badge badge-amber" style="font-size:10.5px;">MENUNGGU RESPON REKAN</span>
                              <button type="button" class="btn btn-outline btn-xs" data-action="cancel-shift-swap" data-id="${esc(sw.id)}" style="color:var(--rose-700);border-color:#fca5a5;font-size:11px;padding:3px 8px;">
                                Batalkan
                              </button>
                            </div>
                          </div>
                          ${
                            sw.requester_notes
                              ? `<div style="font-size:11.5px;color:var(--stone-600);font-style:italic;">
                                  💬 Catatan Anda: "${esc(sw.requester_notes)}"
                                </div>`
                              : ""
                          }
                        </div>
                      `;
                    })
                    .join("")}
                </div>`
          }
        </div>

        <!-- 3. RIWAYAT PERTUKARAN SELESAI -->
        <div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
            <h4 style="font-size:14px;font-weight:800;color:var(--stone-900);margin:0;">
              📜 Riwayat Pertukaran Shift
            </h4>
            <span class="badge" style="font-size:11px;">${history.length}</span>
          </div>

          ${
            history.length === 0
              ? `<div class="card-subtle" style="padding:14px;text-align:center;font-size:12px;color:var(--stone-500);font-style:italic;">
                  Belum ada riwayat pertukaran shift sebelumnya.
                </div>`
              : `<div style="display:flex;flex-direction:column;gap:8px;">
                  ${history.slice(0, 15).map((sw) => {
                    const isRequester = sw.requester_id === u.id;
                    const otherEmp = s.profiles.find((p) => p.id === (isRequester ? sw.target_employee_id : sw.requester_id));
                    const badgeCls = sw.status === "approved" ? "badge-success" : sw.status === "rejected" ? "badge-danger" : "badge";
                    const statusLabel = sw.status === "approved" ? "✓ DISETUJUI & TERTUKAR" : sw.status === "rejected" ? "✕ DITOLAK" : "DIBATALKAN";

                    return `
                      <div class="card-subtle" style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
                        <div>
                          <div style="font-size:12.5px;font-weight:700;color:var(--stone-900);">
                            ${isRequester ? `Anda ⇄ ${esc(otherEmp?.full_name || "Rekan")}` : `${esc(otherEmp?.full_name || "Rekan")} ⇄ Anda`}
                          </div>
                          <div style="font-size:11px;color:var(--stone-500);margin-top:2px;">
                            ${esc(sw.requester_date)} (${esc(getShiftLabel(sw.requester_schedule_type, sw.requester_shift_id))}) ⇄ 
                            ${esc(sw.target_date)} (${esc(getShiftLabel(sw.target_schedule_type, sw.target_shift_id))})
                          </div>
                          ${
                            sw.target_response_notes
                              ? `<div style="font-size:10.5px;color:var(--stone-600);margin-top:2px;">Tanggapan: "${esc(sw.target_response_notes)}"</div>`
                              : ""
                          }
                        </div>
                        <span class="badge ${badgeCls}" style="font-size:10px;">${statusLabel}</span>
                      </div>
                    `;
                  }).join("")}
                </div>`
          }
        </div>
      </div>
    `;
  }

  // ==========================================================================
  // 5.3 TAMPILAN PENGELOLA: ROSTER JADWAL KERJA BULANAN & SHIFT STAF
  // ==========================================================================
  function renderManagerScheduleView(uiState, isEmbeddedInCp = false) {
    Core.assertManagerAccess("ManagerScheduleView");
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const parts = Core.getTimePartsInTimezone(Core.getServerNow(), tz);
    const offset = uiState.scheduleMonthOffset || 0;
    const month = getMonthCalendarRange(parts.dateString, offset);
    const empFilter = uiState.scheduleEmployeeFilter || "all";
    const deptFilter = uiState.scheduleDeptFilter || "all";

    const activeEmployees = s.profiles.filter(
      (p) => p.status !== "rejected" && p.status !== "inactive"
    );

    // Filter jadwal untuk bulan aktif
    const monthStart = month.startDateStr;
    const monthEnd = month.endDateStr;
    const monthSchedules = s.workSchedules.filter(
      (sc) => sc.schedule_date >= monthStart && sc.schedule_date <= monthEnd
    );

    const filteredSchedules = monthSchedules.filter((sc) => {
      if (empFilter !== "all" && sc.employee_id !== empFilter) return false;
      if (deptFilter !== "all") {
        const emp = s.profiles.find((p) => p.id === sc.employee_id);
        const dept = emp?.department || "bar";
        if (dept !== deptFilter) return false;
      }
      return true;
    });

    const barMonthCount = monthSchedules.filter((sc) => {
      const p = s.profiles.find((x) => x.id === sc.employee_id);
      return (p?.department || "bar") === "bar";
    }).length;
    const kitchenMonthCount = monthSchedules.filter((sc) => {
      const p = s.profiles.find((x) => x.id === sc.employee_id);
      return p?.department === "kitchen";
    }).length;
    const managerMonthCount = monthSchedules.filter((sc) => {
      const p = s.profiles.find((x) => x.id === sc.employee_id);
      return p?.department === "manager";
    }).length;

    // Default tanggal untuk form jadwal
    const defaultDate = uiState.prefilledScheduleDate || parts.dateString;

    return `
      ${
        !isEmbeddedInCp
          ? `
        <div class="hero-banner">
          <span class="badge" style="background:rgba(218,175,118,0.18);color:var(--gold-200);border:1px solid rgba(218,175,118,0.3);margin-bottom:8px;">
            🗓️ Roster Jadwal Operasional Bulanan
          </span>
          <h2 style="font-size:22px;font-weight:800;margin-bottom:4px;letter-spacing:-0.02em;">Pengaturan Jadwal Kerja &amp; Shift Karyawan</h2>
          <p style="font-size:12px;color:var(--coffee-200);margin-bottom:14px;max-width:720px;">
            Atur jadwal shift pagi, shift siang, atau hari libur (day off) untuk seluruh staf Suka Latte per bulan. Pisahkan jadwal antara Tim Bar dan Tim Kitchen agar terorganisir rapi di HP.
          </p>

          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;background:rgba(12,7,4,0.6);border:1px solid rgba(218,175,118,0.25);border-radius:14px;padding:10px 14px;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <button class="btn btn-outline btn-sm" data-action="schedule-prev-month" style="color:var(--gold-200);border-color:rgba(218,175,118,0.35);padding:5px 10px;font-size:12px;">‹ Bulan Lalu</button>
              <button class="btn btn-primary btn-sm" data-action="schedule-today-month" style="padding:5px 12px;font-size:12px;">Bulan Ini</button>
              <button class="btn btn-outline btn-sm" data-action="schedule-next-month" style="color:var(--gold-200);border-color:rgba(218,175,118,0.35);padding:5px 10px;font-size:12px;">Bulan Depan ›</button>
            </div>
            <div style="font-size:13.5px;font-weight:800;color:var(--gold-200);">
              📅 ${esc(month.label)}
            </div>
          </div>
        </div>
        `
          : `
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;background:var(--coffee-900);color:white;border-radius:14px;padding:12px 16px;margin-bottom:16px;">
          <div>
            <div style="font-size:15px;font-weight:800;color:var(--gold-200);">🗓️ Navigasi Roster Jadwal Bulanan</div>
            <div style="font-size:12px;color:var(--coffee-200);">${esc(month.label)}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" data-action="schedule-prev-month" style="color:white;border-color:rgba(255,255,255,0.3);padding:5px 10px;font-size:12px;">‹ Bulan Lalu</button>
            <button class="btn btn-primary btn-sm" data-action="schedule-today-month" style="padding:5px 12px;font-size:12px;">Bulan Ini</button>
            <button class="btn btn-outline btn-sm" data-action="schedule-next-month" style="color:white;border-color:rgba(255,255,255,0.3);padding:5px 10px;font-size:12px;">Bulan Depan ›</button>
          </div>
        </div>
        `
      }

      <!-- AKSI PINTAS & FILTER -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
        <button class="btn btn-amber" data-action="open-quick-weekly-modal" style="display:flex;align-items:center;gap:6px;font-weight:700;">
          <span>⚡</span>
          <span>Atur Cepat Jadwal 1 Bulan Penuh</span>
        </button>

        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:12px;font-weight:700;color:var(--stone-600);">Filter Staf:</span>
          <select class="form-input" data-action="filter-schedule-employee" style="max-width:220px;padding:6px 10px;font-size:12px;">
            <option value="all" ${empFilter === "all" ? "selected" : ""}>👥 Semua Karyawan (${activeEmployees.length})</option>
            ${activeEmployees
              .map(
                (emp) => `
              <option value="${emp.id}" ${empFilter === emp.id ? "selected" : ""}>
                ${getDepartmentLabel(emp.department)} • ${esc(emp.full_name)} (${esc(emp.role)})
              </option>
            `
              )
              .join("")}
          </select>
        </div>
      </div>

      <!-- FILTER TAB 2 JADWAL: TIM BAR VS TIM KITCHEN -->
      <div class="tab-pills" style="margin-bottom:14px;gap:6px;flex-wrap:wrap;">
        <button class="tab-pill ${deptFilter === 'all' ? 'active' : ''}" data-action="filter-schedule-dept" data-dept="all">
          👥 Semua Jadwal (${monthSchedules.length})
        </button>
        <button class="tab-pill ${deptFilter === 'bar' ? 'active' : ''}" data-action="filter-schedule-dept" data-dept="bar" style="${deptFilter === 'bar' ? '' : 'color:#065f46;'}">
          🍹 Jadwal Tim Bar (${barMonthCount})
        </button>
        <button class="tab-pill ${deptFilter === 'kitchen' ? 'active' : ''}" data-action="filter-schedule-dept" data-dept="kitchen" style="${deptFilter === 'kitchen' ? '' : 'color:#9a3412;'}">
          🍳 Jadwal Tim Kitchen (${kitchenMonthCount})
        </button>
        <button class="tab-pill ${deptFilter === 'manager' ? 'active' : ''}" data-action="filter-schedule-dept" data-dept="manager" style="${deptFilter === 'manager' ? '' : 'color:#92400e;'}">
          👔 Tim Manajer (${managerMonthCount})
        </button>
      </div>

      <!-- FORM INPUT JADWAL HARIAN BARU -->
      <div class="card" id="card-schedule-input-form" style="margin-bottom:18px;border-top:3px solid var(--amber-600);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="font-size:15px;font-weight:800;margin:0 0 2px 0;">➕ Input / Perbarui Jadwal Kerja Karyawan</h3>
            <p style="font-size:11.5px;color:var(--stone-500);margin:0;">
              Tetapkan shift atau hari libur untuk karyawan pada tanggal tertentu.
            </p>
          </div>
          <span class="badge badge-amber" style="font-size:11px;">Input Mandiri Admin</span>
        </div>

        <form id="form-work-schedule" style="display:flex;flex-direction:column;gap:12px;">
          <div class="grid-2" style="gap:12px;">
            <!-- PILIH KARYAWAN -->
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:12px;font-weight:700;">Pilih Karyawan <span style="color:var(--rose-600);">*</span></label>
              <select name="employee_id" id="sched-emp-select" class="form-input" required style="font-size:13px;">
                <option value="">-- Pilih Anggota / Karyawan --</option>
                ${activeEmployees
                  .map(
                    (p) => `
                  <option value="${p.id}" ${empFilter === p.id ? "selected" : ""}>
                    ${getDepartmentLabel(p.department)} • ${esc(p.full_name)} [${esc(p.employee_code || "KARYAWAN")}] - ${esc(p.role)}
                  </option>
                `
                  )
                  .join("")}
              </select>
            </div>

            <!-- TANGGAL JADWAL -->
            <div class="form-group" style="margin:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <label class="form-label" style="font-size:12px;font-weight:700;margin:0;">Tanggal Kerja <span style="color:var(--rose-600);">*</span></label>
                <div style="display:flex;gap:4px;">
                  <button type="button" class="btn btn-outline btn-xs" data-action="set-sched-date-quick" data-days="0" style="padding:2px 6px;font-size:10.5px;">Hari Ini</button>
                  <button type="button" class="btn btn-outline btn-xs" data-action="set-sched-date-quick" data-days="1" style="padding:2px 6px;font-size:10.5px;">+1 Besok</button>
                  <button type="button" class="btn btn-outline btn-xs" data-action="set-sched-date-quick" data-days="2" style="padding:2px 6px;font-size:10.5px;">+2 Lusa</button>
                </div>
              </div>
              <input type="date" name="schedule_date" id="sched-date-input" class="form-input" value="${defaultDate}" required style="font-size:13px;" />
            </div>
          </div>

          <!-- TIPE JADWAL (MASUK VS LIBUR) -->
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:12px;font-weight:700;">Status Kehadiran Hari Itu</label>
            <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer;background:var(--stone-50);padding:8px 14px;border-radius:10px;border:1px solid var(--stone-200);">
                <input type="radio" name="schedule_type" value="work" checked data-action="toggle-schedule-type" />
                <span>💼 Masuk Kerja Sesuai Shift</span>
              </label>
              <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer;background:#fff1f2;padding:8px 14px;border-radius:10px;border:1px solid #fecdd3;color:var(--rose-800);">
                <input type="radio" name="schedule_type" value="off" data-action="toggle-schedule-type" />
                <span>🏖️ Libur / Day Off (Tidak Perlu Absen)</span>
              </label>
            </div>
          </div>

          <!-- SHIFT & OUTLET (DISEMBUNYIKAN JIKA LIBUR) -->
          <div id="sched-shift-outlet-fields" class="grid-2" style="gap:12px;">
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:12px;font-weight:700;">Pilih Shift Kerja</label>
              <select name="shift_id" id="sched-shift-select" class="form-input" style="font-size:13px;">
                ${s.shifts
                  .map(
                    (sh) => `
                  <option value="${sh.id}">
                    ${esc(sh.name)} (${String(sh.start_time).slice(0, 5)} - ${String(sh.end_time).slice(0, 5)})
                  </option>
                `
                  )
                  .join("")}
              </select>
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label" style="font-size:12px;font-weight:700;">Pilih Lokasi Outlet</label>
              <select name="outlet_id" id="sched-outlet-select" class="form-input" style="font-size:13px;">
                ${s.outlets
                  .map(
                    (o) => `
                  <option value="${o.id}">${esc(o.name)}</option>
                `
                  )
                  .join("")}
              </select>
            </div>
          </div>

          <!-- CATATAN TAMBAHAN -->
          <div class="form-group" style="margin:0;">
            <label class="form-label" style="font-size:12px;font-weight:700;">Catatan Khusus (Opsional)</label>
            <input type="text" name="notes" id="sched-notes-input" class="form-input" placeholder="Contoh: Buka outlet pagi, lembur promo, tukar shift dengan Rizky" style="font-size:12.5px;" />
          </div>

          <div style="display:flex;justify-content:flex-end;margin-top:4px;">
            <button type="submit" id="btn-submit-schedule" class="btn btn-primary" style="min-width:180px;">
              💾 Simpan Jadwal Kerja
            </button>
          </div>
        </form>
      </div>

      <!-- ROSTER SEBULAN PENUH -->
      <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="font-size:15px;font-weight:800;color:var(--stone-800);margin:0;">
          📅 Roster Bulanan (${esc(month.label)})
        </h3>
        <span style="font-size:11.5px;color:var(--stone-500);">
          ${filteredSchedules.length} jadwal terdaftar
        </span>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px;">
        ${month.days
          .map((d) => {
            const isToday = d.dateStr === parts.dateString;
            const dayScheds = filteredSchedules.filter((x) => x.schedule_date === d.dateStr);

            const renderScheduleRow = (sc) => {
              const emp = s.profiles.find((p) => p.id === sc.employee_id) || sc.employee;
              const sh = sc.shift_id ? (s.shifts.find((x) => x.id === sc.shift_id) || sc.shift) : null;
              const isOff = sc.schedule_type === "off";
              const outl = sc.outlet_id ? (s.outlets.find((o) => o.id === sc.outlet_id) || sc.outlet) : s.outlets[0];

              return `
                <div class="schedule-emp-row" style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:var(--stone-50);border-radius:8px;border:1px solid var(--stone-200);flex-wrap:wrap;gap:8px;">
                  <div style="display:flex;align-items:center;gap:8px;min-width:180px;">
                    ${renderAvatarHtml(emp)}
                    <div>
                      <div style="font-size:12.5px;font-weight:700;color:var(--stone-900);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span>${esc(emp?.full_name || "Karyawan")}</span>
                        ${getDepartmentBadge(emp?.department)}
                        <span style="font-size:10px;color:var(--stone-500);font-weight:normal;">(${esc(emp?.role || "member")})</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:6px;margin-top:2px;flex-wrap:wrap;">
                        ${
                          isOff
                            ? `<span class="badge badge-rose" style="font-size:10.5px;">🏖️ LIBUR / OFF</span>`
                            : sh
                            ? `<span class="badge badge-amber" style="font-size:10.5px;">🌅 ${esc(sh.name)} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)})</span>`
                            : `<span class="badge" style="background:#e2e8f0;font-size:10.5px;">📋 Shift Standar</span>`
                        }
                        <span style="font-size:10.5px;color:var(--stone-500);">• ${esc(outl?.name || "Outlet")}</span>
                      </div>
                      ${
                        sc.notes
                          ? `<div style="font-size:11px;color:var(--coffee-800);margin-top:2px;font-style:italic;">💬 "${esc(sc.notes)}"</div>`
                          : ""
                      }
                    </div>
                  </div>

                  <div style="display:flex;align-items:center;gap:6px;">
                    <button class="btn btn-outline btn-xs" data-action="open-edit-schedule" data-schedule-id="${sc.id}" style="padding:4px 8px;font-size:11px;">
                      ✏️ Edit
                    </button>
                    <button class="btn btn-outline btn-xs" data-action="delete-schedule" data-schedule-id="${sc.id}" style="padding:4px 8px;font-size:11px;color:var(--rose-700);border-color:#fca5a5;">
                      🗑️ Hapus
                    </button>
                  </div>
                </div>
              `;
            };

            const barDayScheds = dayScheds.filter((sc) => {
              const emp = s.profiles.find((p) => p.id === sc.employee_id) || sc.employee;
              return (sc.department || emp?.department || "bar") === "bar";
            });
            const kitchenDayScheds = dayScheds.filter((sc) => {
              const emp = s.profiles.find((p) => p.id === sc.employee_id) || sc.employee;
              return (sc.department || emp?.department) === "kitchen";
            });
            const managerDayScheds = dayScheds.filter((sc) => {
              const emp = s.profiles.find((p) => p.id === sc.employee_id) || sc.employee;
              return (sc.department || emp?.department) === "manager";
            });

            return `
              <div class="schedule-roster-day-card ${isToday ? "is-today" : ""}">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--stone-100);margin-bottom:8px;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <strong style="font-size:14px;color:var(--stone-900);">
                      ${esc(d.dayName)}, ${d.dayNum} ${esc(d.monthShort)} ${d.year}
                    </strong>
                    ${isToday ? `<span class="badge badge-amber" style="font-size:10px;">HARI INI</span>` : ""}
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:11px;color:var(--stone-500);">${dayScheds.length} staf terjadwal</span>
                    <button class="btn btn-outline btn-xs" data-action="prefill-schedule-date" data-date="${d.dateStr}" style="padding:2px 8px;font-size:10.5px;">
                      + Tambah di Tanggal Ini
                    </button>
                  </div>
                </div>

                ${
                  dayScheds.length === 0
                    ? `
                  <div style="padding:10px 0;font-size:11.5px;color:var(--stone-400);font-style:italic;">
                    Belum ada jadwal khusus yang diatur untuk hari ${esc(d.dayName)} ini. (Karyawan menggunakan shift default profil).
                  </div>
                `
                    : deptFilter === "all"
                    ? `
                  <div style="display:flex;flex-direction:column;gap:10px;">
                    <!-- JADWAL TIM BAR -->
                    ${
                      barDayScheds.length > 0
                        ? `
                      <div style="background:#f0fdf4;border-left:3px solid #10b981;border-radius:8px;padding:8px 10px;">
                        <div style="font-size:11.5px;font-weight:800;color:#065f46;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
                          <span>🍹 JADWAL TIM BAR</span>
                          <span class="badge" style="background:#d1fae5;color:#065f46;font-size:10px;">${barDayScheds.length} Staf</span>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:5px;">
                          ${barDayScheds.map(renderScheduleRow).join("")}
                        </div>
                      </div>
                    `
                        : ""
                    }

                    <!-- JADWAL TIM KITCHEN -->
                    ${
                      kitchenDayScheds.length > 0
                        ? `
                      <div style="background:#fff7ed;border-left:3px solid #f97316;border-radius:8px;padding:8px 10px;">
                        <div style="font-size:11.5px;font-weight:800;color:#9a3412;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
                          <span>🍳 JADWAL TIM KITCHEN</span>
                          <span class="badge" style="background:#ffedd5;color:#9a3412;font-size:10px;">${kitchenDayScheds.length} Staf</span>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:5px;">
                          ${kitchenDayScheds.map(renderScheduleRow).join("")}
                        </div>
                      </div>
                    `
                        : ""
                    }

                    <!-- JADWAL MANAJER / PENGAWAS -->
                    ${
                      managerDayScheds.length > 0
                        ? `
                      <div style="background:#fffbeb;border-left:3px solid #f59e0b;border-radius:8px;padding:8px 10px;">
                        <div style="font-size:11.5px;font-weight:800;color:#92400e;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;">
                          <span>👔 PENGAWAS / MANAJER</span>
                          <span class="badge" style="background:#fef3c7;color:#92400e;font-size:10px;">${managerDayScheds.length} Staf</span>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:5px;">
                          ${managerDayScheds.map(renderScheduleRow).join("")}
                        </div>
                      </div>
                    `
                        : ""
                    }
                  </div>
                `
                    : `
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    ${dayScheds.map(renderScheduleRow).join("")}
                  </div>
                `
                }
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderCpSchedule(uiState) {
    return renderManagerScheduleView(uiState, true);
  }

  // ==========================================================================
  // 6. TAMPILAN PENGELOLA (SUPER ADMIN & ADMIN): DASHBOARD, ARSIP, LAPORAN
  // ==========================================================================
  function renderManagerDashboardView(parts, myToday, canCheckIn, canCheckOut) {
    Core.assertManagerAccess("ManagerDashboard");
    const s = Core.state;
    const u = s.currentUser;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    const myOutlet = s.outlets.find((o) => o.id === u.outlet_id) || s.outlets[0];
    const myShift = s.shifts.find((sh) => sh.id === u.shift_id) || s.shifts[0];

    const pendingUsers = s.profiles.filter(
      (p) => p.status === "pending_approval" || (!p.first_login_approved && p.status !== "rejected")
    );
    const activeEmployees = s.profiles.filter((p) => p.status === "active" && p.first_login_approved);
    const todayRecs = s.attendance.filter((a) => a.work_date === parts.dateString);
    const presentToday = todayRecs.filter((a) => a.check_in_at).length;
    const workingNow = todayRecs.filter((a) => a.check_in_at && !a.check_out_at).length;
    const lateToday = todayRecs.filter((a) => a.late_minutes > 0 || a.attendance_status === "terlambat").length;
    const {
      todayHolidays,
      upcomingOrActiveHolidays,
      outletHolidays,
      pendingLeaves,
    } = getHolidayAndLeaveSummary(parts.dateString, u.id);
    const holidaysToShow = upcomingOrActiveHolidays.length > 0 ? upcomingOrActiveHolidays : outletHolidays;
    const recentEmployeeLeaves = (s.holidaysAndLeaves || []).filter((h) => Boolean(h.employee_id));

    // Pastikan Signed URL foto selfie 8 transaksi terbaru termuat
    Core.ensureSignedUrlsForAttendance(s.attendance.slice(0, 8));

    return `
      ${
        pendingUsers.length > 0
          ? `<div class="card" style="margin-bottom:14px;border:2px solid var(--amber-600);background:var(--amber-50);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--amber-800);">
                  🔔 ${pendingUsers.length} Akun Google Baru Menunggu Persetujuan Login Pertama!
                </div>
                <div style="font-size:12px;color:var(--stone-700);">
                  Setujui agar karyawan tersebut dapat masuk dan melakukan absensi (login mereka berikutnya akan langsung masuk otomatis).
                </div>
              </div>
              <button class="btn btn-amber" data-action="jump-cp" data-tab="employees">
                Tinjau &amp; Setujui Sekarang →
              </button>
            </div>`
          : ""
      }

      ${
        pendingLeaves.length > 0
          ? `<div class="card" style="margin-bottom:14px;border:1.5px solid var(--coffee-400);background:var(--coffee-50);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
              <div>
                <div style="font-size:14px;font-weight:800;color:var(--coffee-900);">
                  📅 ${pendingLeaves.length} Pengajuan Izin / Cuti / Libur Karyawan Menunggu Persetujuan
                </div>
                <div style="font-size:12px;color:var(--stone-600);">
                  Anda dapat langsung menyetujui atau menolak dari kartu Pengajuan Izin &amp; Cuti di bawah atau via Control Panel → Kalender.
                </div>
              </div>
              <button class="btn btn-primary btn-sm" data-action="jump-cp" data-tab="calendar">
                Buka Kalender &amp; Izin →
              </button>
            </div>`
          : ""
      }

      <div class="hero-banner">
        <div class="grid-12" style="align-items:center;">
          <div class="col-7">
            <span class="badge" style="background:rgba(218,175,118,0.18);color:var(--gold-200);border:1px solid rgba(218,175,118,0.3);margin-bottom:10px;">
              Dashboard Operasional Pengelola • ${esc(parts.dateString)} (${esc(tz)})
            </span>
            <h1 style="font-size:25px;font-weight:800;margin-bottom:6px;letter-spacing:-0.02em;">Halo, ${esc(u.full_name)}</h1>
            <p style="font-size:13px;color:var(--coffee-200);margin-bottom:14px;">
              Outlet Aktif: <strong style="color:var(--white);">${esc(myOutlet ? myOutlet.name : "-")}</strong> •
              Shift: <strong style="color:var(--white);">${esc(myShift ? `${myShift.name} (${String(myShift.start_time).slice(0, 5)}–${String(myShift.end_time).slice(0, 5)})` : "-")}</strong>
            </p>
            ${renderShiftSelectorHtml(s.shifts, myToday?.shift_id || u.shift_id || myShift?.id, !canCheckIn)}
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${
                canCheckIn
                  ? `<button class="btn btn-emerald" data-action="open-camera" data-mode="check_in">📷 Check In Pribadi</button>`
                  : canCheckOut
                  ? `<button class="btn btn-amber" data-action="open-camera" data-mode="check_out">📷 Check Out Pribadi</button>`
                  : ""
              }
              <button class="btn btn-outline" style="background:rgba(255,255,255,0.12);color:var(--gold-200);border-color:rgba(218,175,118,0.4);" data-action="open-switch-shift-modal">
                🔄 Alihkan Shift
              </button>
              <button class="btn btn-gold" data-action="nav" data-target="control_panel">
                ⚙️ Control Panel &amp; Edit
              </button>
              <button class="btn btn-outline" style="background:rgba(255,255,255,0.1);color:var(--gold-200);border-color:rgba(218,175,118,0.35);" data-action="nav" data-target="archive">
                🗂️ Arsip Foto (${esc(parts.archiveFolderLabel)})
              </button>
            </div>
          </div>

          <div class="col-5">
            <div style="background:rgba(12,7,4,0.68);backdrop-filter:blur(10px);border:1px solid rgba(218,175,118,0.24);border-radius:18px;padding:18px;font-size:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:8px;flex-wrap:wrap;">
                <span style="color:var(--gold-300);font-weight:800;font-size:11px;letter-spacing:0.06em;">ABSENSI PRIBADI ANDA HARI INI</span>
                ${myToday ? Core.getStatusBadgeHtml(myToday.attendance_status, myToday.late_minutes) : Core.getStatusBadgeHtml("belum_check_in")}
              </div>
              <div class="hero-time-tiles" style="margin-bottom:10px;">
                <div class="hero-time-box">
                  <div class="hero-time-label">Check In</div>
                  <div class="mono hero-time-val">
                    ${myToday?.check_in_at ? Core.formatOperationalDateTime(myToday.check_in_at, tz, false) : "--:--:--"}
                  </div>
                </div>
                <div class="hero-time-box">
                  <div class="hero-time-label">Check Out</div>
                  <div class="mono hero-time-val">
                    ${myToday?.check_out_at ? Core.formatOperationalDateTime(myToday.check_out_at, tz, false) : "--:--:--"}
                  </div>
                </div>
              </div>
              <div class="mono" style="font-size:11.5px;color:var(--coffee-200);">
                Durasi Kerja Hari Ini: <strong style="color:var(--white);">${Core.formatDurationMinutes(myToday?.work_duration_minutes)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom:18px;">
        <div class="kpi-card">
          <div class="kpi-head">
            <div>
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:var(--stone-500);">Karyawan Aktif</div>
              <div class="mono" style="font-size:30px;font-weight:800;color:var(--coffee-950);margin:4px 0;">${activeEmployees.length}</div>
            </div>
            <div class="kpi-icon-orb">👥</div>
          </div>
          <div style="font-size:11.5px;color:var(--stone-500);">${pendingUsers.length} menunggu persetujuan login pertama</div>
        </div>

        <div class="kpi-card kpi-emerald">
          <div class="kpi-head">
            <div>
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:var(--emerald-700);">Hadir Hari Ini</div>
              <div class="mono" style="font-size:30px;font-weight:800;color:var(--emerald-800);margin:4px 0;">${presentToday}</div>
            </div>
            <div class="kpi-icon-orb">✅</div>
          </div>
          <div style="font-size:11.5px;color:var(--emerald-700);">Terverifikasi Selfie &amp; GPS Outlet</div>
        </div>

        <div class="kpi-card kpi-amber">
          <div class="kpi-head">
            <div>
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:var(--amber-700);">Sedang Bertugas</div>
              <div class="mono" style="font-size:30px;font-weight:800;color:var(--amber-800);margin:4px 0;">${workingNow}</div>
            </div>
            <div class="kpi-icon-orb">☕</div>
          </div>
          <div style="font-size:11.5px;color:var(--amber-700);">Aktif berjalan (belum Check Out)</div>
        </div>

        <div class="kpi-card kpi-rose">
          <div class="kpi-head">
            <div>
              <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:var(--rose-700);">Terlambat Hari Ini</div>
              <div class="mono" style="font-size:30px;font-weight:800;color:var(--rose-800);margin:4px 0;">${lateToday}</div>
            </div>
            <div class="kpi-icon-orb">⏱️</div>
          </div>
          <div style="font-size:11.5px;color:var(--rose-700);">Mengacu waktu resmi server WITA</div>
        </div>
      </div>

      <!-- KARTU HARI LIBUR OUTLET & ANTREAN IZIN / CUTI KARYAWAN DI DASHBOARD -->
      <div class="grid-2" style="margin-bottom:18px;">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
            <div>
              <h3 style="font-size:15.5px;font-weight:800;">🏖️ Hari Libur Outlet &amp; Nasional</h3>
              <p style="font-size:11.5px;color:var(--stone-500);">Tampil otomatis di Dashboard seluruh Anggota.</p>
            </div>
            <button class="btn btn-outline btn-sm" data-action="jump-cp" data-tab="calendar">
              + Atur Hari Libur
            </button>
          </div>
          ${
            todayHolidays.length > 0
              ? `<div style="margin-bottom:10px;padding:9px 12px;border-radius:10px;background:var(--rose-50);border:1px solid #fecdd3;color:var(--rose-800);font-size:12px;font-weight:700;">
                  🔴 Hari ini tercatat Libur: ${esc(todayHolidays.map((h) => h.title).join(", "))}
                </div>`
              : ""
          }
          ${
            holidaysToShow.length === 0
              ? `<div class="card-subtle" style="text-align:center;color:var(--stone-500);font-size:12px;">Belum ada jadwal hari libur. Klik <strong>+ Atur Hari Libur</strong> untuk menambahkan.</div>`
              : `<div style="display:flex;flex-direction:column;gap:8px;">
                  ${holidaysToShow
                    .slice(0, 5)
                    .map((h) => {
                      const isToday = h.date_start <= parts.dateString && h.date_end >= parts.dateString;
                      return `
                        <div class="card-subtle" style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
                          <div>
                            <strong style="font-size:13px;">${esc(h.title)}</strong>
                            <div class="mono" style="font-size:11px;color:var(--coffee-700);">${esc(h.date_start)}${h.date_end !== h.date_start ? ` s/d ${esc(h.date_end)}` : ""}</div>
                            <div style="font-size:11.5px;color:var(--stone-600);">${esc(h.reason)}</div>
                          </div>
                          ${isToday ? `<span class="badge badge-danger">HARI INI</span>` : `<span class="badge badge-coffee">${esc(getLeaveTypeLabel(h.type))}</span>`}
                        </div>`;
                    })
                    .join("")}
                </div>`
          }
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
            <div>
              <h3 style="font-size:15.5px;font-weight:800;">📝 Pengajuan Izin, Sakit &amp; Cuti Karyawan</h3>
              <p style="font-size:11.5px;color:var(--stone-500);">Anggota dapat mengajukan libur/izin/cuti tanpa harus di outlet.</p>
            </div>
            <span class="badge ${pendingLeaves.length > 0 ? "badge-warning" : "badge-stone"}">${pendingLeaves.length} Menunggu</span>
          </div>
          ${
            recentEmployeeLeaves.length === 0
              ? `<div class="card-subtle" style="text-align:center;color:var(--stone-500);font-size:12px;">Belum ada pengajuan izin atau cuti dari karyawan.</div>`
              : `<div style="display:flex;flex-direction:column;gap:8px;">
                  ${recentEmployeeLeaves
                    .slice(0, 5)
                    .map((lv) => {
                      const emp = s.profiles.find((p) => p.id === lv.employee_id);
                      return `
                        <div class="card-subtle" style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
                          <div style="min-width:0;flex:1;">
                            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                              <strong style="font-size:13px;">${esc(emp ? emp.full_name : "Karyawan")}</strong>
                              <span class="badge badge-coffee">${esc(getLeaveTypeLabel(lv.type))}</span>
                              ${getApprovalStatusBadgeHtml(lv.status)}
                            </div>
                            <div class="mono" style="font-size:11px;color:var(--coffee-700);margin-top:2px;">
                              ${esc(lv.date_start)}${lv.date_end !== lv.date_start ? ` s/d ${esc(lv.date_end)}` : ""} • ${esc(lv.title)}
                            </div>
                            <div style="font-size:11.5px;color:var(--stone-600);">${esc(lv.reason)}</div>
                          </div>
                          ${
                            lv.status === "pending"
                              ? `<div style="display:flex;gap:6px;">
                                  <button class="btn btn-emerald btn-sm" data-action="approve-leave" data-id="${esc(lv.id)}" data-decision="approved">✓ Setujui</button>
                                  <button class="btn btn-danger btn-sm" data-action="approve-leave" data-id="${esc(lv.id)}" data-decision="rejected">✕ Tolak</button>
                                </div>`
                              : ""
                          }
                        </div>`;
                    })
                    .join("")}
                </div>`
          }
        </div>
      </div>

      <div class="grid-12">
        <div class="col-7">
          ${renderGeofenceMapCard(myOutlet, null)}
        </div>
        <div class="col-5 card" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
          <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
              <strong style="font-size:13px;text-transform:uppercase;">Jejak Audit Log Terbaru</strong>
              <button style="font-size:11.5px;font-weight:700;color:var(--coffee-700);text-decoration:underline;" data-action="jump-cp" data-tab="audit">Buka Semua</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${
                s.auditLogs.length === 0
                  ? `<div style="font-size:12px;color:var(--stone-500);">Belum ada aktivitas tercatat.</div>`
                  : s.auditLogs
                      .slice(0, 4)
                      .map(
                        (log) => `
                      <div class="card-subtle" style="padding:10px 12px;font-size:11.5px;">
                        <div class="mono" style="display:flex;justify-content:space-between;font-size:10px;font-weight:800;color:var(--coffee-700);">
                          <span>${esc(log.action)}</span>
                          <span>${Core.formatOperationalDateTime(log.created_at, tz, false)}</span>
                        </div>
                        <div style="font-weight:600;margin-top:2px;">${esc(log.detail)}</div>
                        <div style="font-size:10px;color:var(--stone-500);">Pelaku: ${esc(log.actor_name)}</div>
                      </div>`
                      )
                      .join("")
              }
            </div>
          </div>
          <button class="btn btn-primary" style="width:100%;" data-action="nav" data-target="control_panel">
            Kelola Karyawan, Shift, Outlet &amp; Aturan di Control Panel →
          </button>
        </div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div>
            <h2 style="font-size:16px;font-weight:800;">Aktivitas Kehadiran &amp; Bukti Selfie Terbaru</h2>
            <p style="font-size:11.5px;color:var(--stone-600);">Anda dapat memeriksa bukti foto maupun mengedit koreksi kehadiran secara terkontrol.</p>
          </div>
          <button class="btn btn-outline btn-sm" data-action="nav" data-target="archive">Semua Arsip Foto Bulanan →</button>
        </div>
        ${
          s.attendance.length === 0
            ? `<div style="padding:28px;text-align:center;font-size:12.5px;color:var(--stone-500);">Belum ada transaksi absensi yang masuk.</div>`
            : `<div class="grid-2">
                ${s.attendance
                  .slice(0, 6)
                  .map((rec) => renderAttendanceRecordCard(rec, tz, true))
                  .join("")}
              </div>`
        }
      </div>
    `;
  }

  function renderManagerArchiveView(parts, uiState) {
    Core.assertManagerAccess("MonthlyArchive");
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";

    const periodMap = {};
    s.attendance.forEach((r) => {
      if (!periodMap[r.archive_period_key]) {
        periodMap[r.archive_period_key] = {
          key: r.archive_period_key,
          label: r.archive_folder_label,
          photos: 0,
          records: 0,
        };
      }
      periodMap[r.archive_period_key].records += 1;
      if (r.check_in_photo_path) periodMap[r.archive_period_key].photos += 1;
      if (r.check_out_photo_path) periodMap[r.archive_period_key].photos += 1;
    });
    const periods = Object.values(periodMap).sort((a, b) => b.key.localeCompare(a.key));

    const filtered = s.attendance.filter((r) => {
      if (uiState.archivePeriodFilter !== "all" && r.archive_period_key !== uiState.archivePeriodFilter)
        return false;
      if (uiState.archiveOutletFilter !== "all" && r.outlet_id !== uiState.archiveOutletFilter)
        return false;
      if (uiState.archiveSearch.trim()) {
        const q = uiState.archiveSearch.trim().toLowerCase();
        const emp = s.profiles.find((p) => p.id === r.employee_id);
        const matchName = emp && emp.full_name.toLowerCase().includes(q);
        const matchCode = emp && emp.employee_code.toLowerCase().includes(q);
        if (!matchName && !matchCode && !r.work_date.includes(q)) return false;
      }
      return true;
    });

    Core.ensureSignedUrlsForAttendance(filtered.slice(0, 24));

    return `
      <div class="hero-banner">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px;">
          <div style="max-width:680px;">
            <span class="badge" style="background:rgba(16,185,129,0.2);color:#6ee7b7;margin-bottom:8px;">
              🔒 Supabase Private Bucket • Arsip Foto Bulanan Otomatis
            </span>
            <h2 style="font-size:21px;font-weight:800;margin-bottom:6px;">Arsip Foto Absensi Bulanan Seluruh Karyawan</h2>
            <p style="font-size:12.5px;color:var(--coffee-200);line-height:1.55;">
              Setiap foto selfie Check In &amp; Check Out otomatis masuk ke folder periode bulan berjalan berdasarkan waktu resmi server (<strong>${esc(tz)}</strong>) tanpa menghapus arsip bulan sebelumnya.
            </p>
          </div>
          <div style="background:rgba(20,17,15,0.8);border:1px solid var(--coffee-700);border-radius:14px;padding:14px;font-size:11.5px;min-width:230px;">
            <div style="color:var(--coffee-300);font-weight:700;">PERIODE BERJALAN SERVER:</div>
            <div class="mono" style="font-size:16px;font-weight:800;color:#6ee7b7;margin:3px 0;">📁 ${esc(parts.archiveFolderLabel)}</div>
            <div style="color:var(--coffee-300);">Akses: Super Admin &amp; Admin</div>
          </div>
        </div>

        <div class="grid-4" style="margin-top:16px;">
          <button class="card-subtle" style="background:${uiState.archivePeriodFilter === "all" ? "var(--coffee-700)" : "rgba(44,26,14,0.7)"};color:var(--cream);border-color:var(--coffee-600);text-align:left;" data-action="set-archive-period" data-period="all">
            <div style="font-weight:800;font-size:12.5px;">📂 Semua Periode Bulan</div>
            <div style="font-size:11px;color:var(--coffee-200);margin-top:3px;">Total ${s.attendance.length} transaksi tercatat</div>
          </button>
          ${periods
            .map((p) => {
              const isCurr = p.key === parts.archivePeriodKey;
              return `
                <button class="card-subtle" style="background:${uiState.archivePeriodFilter === p.key ? "var(--coffee-700)" : "rgba(44,26,14,0.7)"};color:var(--cream);border-color:var(--coffee-600);text-align:left;" data-action="set-archive-period" data-period="${esc(p.key)}">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
                    <span class="mono" style="font-weight:800;font-size:12px;">📁 ${esc(p.label)}</span>
                    <span class="badge ${isCurr ? "badge-success" : "badge-warning"}" style="font-size:9.5px;">${isCurr ? "Berjalan" : "Historis"}</span>
                  </div>
                  <div style="font-size:11px;color:var(--coffee-200);margin-top:3px;"><strong>${p.photos}</strong> Foto (${p.records} Absensi)</div>
                </button>`;
            })
            .join("")}
        </div>
      </div>

      <div class="card">
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;flex:1;">
            <input id="archive-search-input" class="form-input" style="max-width:340px;" value="${esc(uiState.archiveSearch)}" placeholder="Cari nama, kode karyawan, atau tanggal YYYY-MM-DD..." />
            <select id="archive-outlet-select" class="form-select" style="max-width:240px;">
              <option value="all">Semua Outlet</option>
              ${s.outlets
                .map(
                  (o) =>
                    `<option value="${esc(o.id)}" ${uiState.archiveOutletFilter === o.id ? "selected" : ""}>${esc(o.name)}</option>`
                )
                .join("")}
            </select>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--coffee-800);">${filtered.length} Catatan Ditemukan</span>
        </div>

        ${
          filtered.length === 0
            ? `<div style="padding:36px;text-align:center;color:var(--stone-500);font-size:13px;">Belum ada arsip foto pada filter yang dipilih.</div>`
            : `<div class="grid-2">
                ${filtered.map((rec) => renderAttendanceRecordCard(rec, tz, true)).join("")}
              </div>`
        }
      </div>
    `;
  }

  function renderManagerReportsView(uiState) {
    Core.assertManagerAccess("ReportsAndExports");
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";

    const filtered = s.attendance.filter((r) => {
      if (uiState.reportDateFrom && r.work_date < uiState.reportDateFrom) return false;
      if (uiState.reportDateTo && r.work_date > uiState.reportDateTo) return false;
      if (uiState.reportEmpId !== "all" && r.employee_id !== uiState.reportEmpId) return false;
      if (uiState.reportOutletId !== "all" && r.outlet_id !== uiState.reportOutletId) return false;
      return true;
    });

    const totalDuration = filtered.reduce((acc, r) => acc + (r.work_duration_minutes || 0), 0);

    return `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--coffee-700);">Laporan Operasional Pengelola</span>
          <h2 style="font-size:20px;font-weight:800;">Rekapitulasi Kehadiran, Keterlambatan, &amp; Ekspor Data</h2>
          <p style="font-size:12px;color:var(--stone-600);">Total ${filtered.length} catatan • Akumulasi Durasi: <strong>${Core.formatDurationMinutes(totalDuration)}</strong></p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;" class="no-print">
          ${
            Core.isManager() && s.attendance.length > 0
              ? `<button class="btn btn-outline" style="color:var(--rose-700);border-color:#fca5a5;" data-action="clear-all-trial-attendance" title="Bersihkan seluruh catatan absensi uji coba sebelum operasional normal">🗑️ Bersihkan Data Uji Coba</button>`
              : ""
          }
          <button class="btn btn-emerald" data-action="export-csv">📊 Ekspor CSV / Excel</button>
          <button class="btn btn-primary" data-action="export-pdf">🖨️ Cetak / Simpan PDF</button>
        </div>
      </div>

      <div class="card no-print">
        <div class="grid-4">
          <div class="form-group" style="margin:0;">
            <label class="form-label">Dari Tanggal</label>
            <input type="date" id="rep-date-from" class="form-input" value="${esc(uiState.reportDateFrom)}" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Sampai Tanggal</label>
            <input type="date" id="rep-date-to" class="form-input" value="${esc(uiState.reportDateTo)}" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Filter Karyawan</label>
            <select id="rep-emp-select" class="form-select">
              <option value="all">Semua Karyawan</option>
              ${s.profiles
                .filter((p) => p.first_login_approved && p.status === "active")
                .map(
                  (p) =>
                    `<option value="${esc(p.id)}" ${uiState.reportEmpId === p.id ? "selected" : ""}>${esc(p.full_name)} (${esc(p.employee_code)})</option>`
                )
                .join("")}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Filter Outlet</label>
            <select id="rep-outlet-select" class="form-select">
              <option value="all">Semua Outlet</option>
              ${s.outlets
                .map(
                  (o) =>
                    `<option value="${esc(o.id)}" ${uiState.reportOutletId === o.id ? "selected" : ""}>${esc(o.name)}</option>`
                )
                .join("")}
            </select>
          </div>
        </div>
      </div>

      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Tanggal &amp; Arsip</th>
              <th>Karyawan</th>
              <th>Outlet &amp; Shift</th>
              <th>Check In (Server)</th>
              <th>Check Out (Server)</th>
              <th>Durasi &amp; Terlambat</th>
              <th>Status</th>
              <th class="no-print">Aksi Edit</th>
            </tr>
          </thead>
          <tbody>
            ${
              filtered.length === 0
                ? `<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--stone-500);">Tidak ada data pada rentang filter ini.</td></tr>`
                : filtered
                    .map((r) => {
                      const emp = s.profiles.find((p) => p.id === r.employee_id);
                      const out = s.outlets.find((o) => o.id === r.outlet_id);
                      const sh = s.shifts.find((x) => x.id === r.shift_id);
                      return `
                        <tr>
                          <td>
                            <strong>${esc(r.work_date)}</strong><br/>
                            <span class="mono" style="font-size:10.5px;color:var(--coffee-700);">${esc(r.archive_folder_label)}</span>
                          </td>
                          <td>
                            <strong>${esc(emp ? emp.full_name : "-")}</strong><br/>
                            <span style="font-size:11px;color:var(--stone-500);">${esc(emp ? emp.employee_code : "")}</span>
                          </td>
                          <td>
                            ${esc(out ? out.name : "-")}<br/>
                            <span style="font-size:11px;color:var(--stone-500);">${esc(sh ? sh.name : "")}</span>
                          </td>
                          <td class="mono">${Core.formatOperationalDateTime(r.check_in_at, tz, false)}</td>
                          <td class="mono">${r.check_out_at ? Core.formatOperationalDateTime(r.check_out_at, tz, false) : "Belum Check Out"}</td>
                          <td>
                            <strong>${Core.formatDurationMinutes(r.work_duration_minutes)}</strong>
                            ${r.late_minutes > 0 ? `<br/><span style="color:var(--orange-700);font-weight:700;font-size:11px;">Terlambat ${r.late_minutes} mnt</span>` : ""}
                          </td>
                          <td>${Core.getStatusBadgeHtml(r.attendance_status, r.late_minutes)}</td>
                          <td class="no-print">
                            <div style="display:inline-flex;gap:4px;flex-wrap:wrap;">
                              <button class="btn btn-outline btn-sm" data-action="open-admin-edit-att" data-id="${esc(r.id)}">✏️ Edit</button>
                              ${
                                Core.canDeleteAttendance(r)
                                  ? `<button class="btn btn-outline btn-sm" style="color:var(--rose-700);border-color:#fca5a5;" data-action="delete-attendance" data-id="${esc(r.id)}" title="Hapus catatan absensi">🗑️ Hapus</button>`
                                  : ""
                              }
                            </div>
                          </td>
                        </tr>`;
                    })
                    .join("")
            }
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================================================
  // 7. CONTROL PANEL LENGKAP — SEMUA FITUR EDIT AKTIF TANPA VS CODE
  //    Hanya dapat diakses oleh Super Admin & Admin!
  // ==========================================================================
  function renderControlPanelView(uiState) {
    Core.assertManagerAccess("ControlPanel");
    const s = Core.state;
    const isSuper = Core.isSuperAdmin();
    const pendingCount = s.profiles.filter(
      (p) => p.status === "pending_approval" || (!p.first_login_approved && p.status !== "rejected")
    ).length;
    const pendingCorrCount = s.corrections.filter((c) => c.status === "pending").length;

    const tabs = [
      {
        id: "employees",
        label: "Persetujuan Google & Karyawan",
        count: pendingCount,
      },
      { id: "roles", label: "Role & Admin" },
      { id: "schedule", label: "🗓️ Roster Jadwal Kerja" },
      { id: "shifts", label: "Jadwal Shift" },
      { id: "outlets", label: "Outlet & Geofence GPS" },
      { id: "rules", label: "Aturan & Zona Waktu" },
      { id: "corrections", label: "Koreksi Kehadiran", count: pendingCorrCount },
      { id: "calendar", label: "Kalender, Libur & Izin" },
      { id: "branding", label: "Branding & Tampilan" },
      { id: "audit", label: "Audit Log" },
      { id: "security", label: "Keamanan & Cloud" },
    ];

    const tab = uiState.activeControlTab;

    return `
      <div class="hero-banner">
        <span class="badge" style="background:rgba(218,175,118,0.18);color:var(--gold-200);border:1px solid rgba(218,175,118,0.3);margin-bottom:10px;">
          Control Panel Pengelola (${isSuper ? "Super Admin — Akses Penuh" : "Admin Operasional"})
        </span>
        <h2 style="font-size:22px;font-weight:800;margin-bottom:4px;letter-spacing:-0.02em;">Pusat Kendali &amp; Manajemen Operasional</h2>
        <p style="font-size:12.5px;color:var(--coffee-200);margin-bottom:18px;max-width:780px;">
          Kelola persetujuan akun Google, promosi Admin 1-klik, jadwal Shift Pagi/Siang, radius GPS outlet, aturan keterlambatan, koreksi absensi, dan tampilan aplikasi secara langsung.
        </p>
        <div class="tab-pills">
          ${tabs
            .map(
              (t) => `
            <button class="tab-pill ${tab === t.id ? "active" : ""}" data-action="cp-tab" data-tab="${t.id}">
              <span>${esc(t.label)}</span>
              ${t.count ? `<span class="count-pill">${t.count}</span>` : ""}
            </button>`
            )
            .join("")}
        </div>
      </div>

      ${tab === "employees" ? renderCpEmployeesAndApproval(uiState) : ""}
      ${tab === "roles" ? renderCpRoles() : ""}
      ${tab === "schedule" ? renderCpSchedule(uiState) : ""}
      ${tab === "shifts" ? renderCpShifts(uiState) : ""}
      ${tab === "outlets" ? renderCpOutlets(uiState) : ""}
      ${tab === "rules" ? renderCpRules() : ""}
      ${tab === "corrections" ? renderCpCorrections() : ""}
      ${tab === "calendar" ? renderCpCalendar(uiState) : ""}
      ${tab === "branding" ? renderCpBranding() : ""}
      ${tab === "audit" ? renderCpAudit() : ""}
      ${tab === "security" ? renderCpSecurity() : ""}
    `;
  }

  // 7.1 Persetujuan Login Pertama Akun Google + Pra-Daftar + Edit Penuh Karyawan
  function renderCpEmployeesAndApproval(uiState) {
    const s = Core.state;
    const pendingUsers = s.profiles.filter(
      (p) => p.status === "pending_approval" || (!p.first_login_approved && p.status !== "rejected")
    );
    const activeUsers = s.profiles.filter((p) => p.first_login_approved && p.status === "active");
    const resignedUsers = s.profiles.filter(
      (p) => (p.first_login_approved && p.status !== "active") || p.status === "rejected"
    );
    const managedUsers = activeUsers;

    return `
      <!-- BAGIAN A: ANTREAN PERSETUJUAN LOGIN PERTAMA AKUN GOOGLE -->
      <div class="card" style="border:2px solid ${pendingUsers.length > 0 ? "var(--amber-600)" : "var(--coffee-200)"};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;">
              1. Antrean Persetujuan Login Pertama Akun Google (${pendingUsers.length} Menunggu)
            </h3>
            <p style="font-size:12px;color:var(--stone-600);">
              Saat karyawan login pertama kali menggunakan Akun Google, tetapkan ID Karyawan, Jabatan, Outlet, &amp; Shift di bawah ini lalu klik <strong>Setujui</strong>. Untuk login berikutnya, mereka akan langsung masuk otomatis.
            </p>
          </div>
          <button class="btn btn-outline btn-sm" data-action="refresh-data">🔄 Segarkan Daftar</button>
        </div>

        ${
          pendingUsers.length === 0
            ? `<div class="card-subtle" style="text-align:center;color:var(--stone-500);font-size:12.5px;">
                Tidak ada akun Google baru yang sedang menunggu persetujuan saat ini.
              </div>`
            : `<div style="display:flex;flex-direction:column;gap:12px;">
                ${pendingUsers
                  .map(
                    (p, idx) => `
                  <form class="card-subtle form-approve-first-login" data-userid="${esc(p.id)}" novalidate>
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
                      <div style="display:flex;align-items:center;gap:10px;">
                        ${renderAvatarHtml(p)}
                        <div>
                          <div style="font-weight:800;font-size:14px;">${esc(p.full_name)}</div>
                          <div style="font-size:12px;color:var(--stone-600);">${esc(p.email)}</div>
                        </div>
                      </div>
                      <span class="badge badge-warning">Menunggu Persetujuan Pertama</span>
                    </div>
                    <div class="grid-3" style="gap:10px;">
                      <div class="form-group" style="margin:0;">
                        <label class="form-label">ID Karyawan *</label>
                        <input class="form-input mono" name="employee_code" value="SL-0${101 + managedUsers.length + idx}" required />
                      </div>
                      <div class="form-group" style="margin:0;">
                        <label class="form-label">Divisi / Stasiun Kerja *</label>
                        <select class="form-select" name="department" style="font-weight:700;">
                          <option value="bar" selected>🍹 Tim Bar</option>
                          <option value="kitchen">🍳 Tim Kitchen</option>
                          <option value="manager">👔 Pengawas / Manajer</option>
                        </select>
                      </div>
                      <div class="form-group" style="margin:0;">
                        <label class="form-label">Jabatan / Posisi *</label>
                        <input class="form-input" name="position_title" value="Barista / Crew" required />
                      </div>
                    </div>
                    <div class="grid-2" style="gap:10px;margin-top:10px;">
                      <div class="form-group" style="margin:0;">
                        <label class="form-label">Outlet Penugasan *</label>
                        <select class="form-select" name="outlet_id">
                          ${s.outlets
                            .filter((o) => o.status === "active")
                            .map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`)
                            .join("")}
                        </select>
                      </div>
                      <div class="form-group" style="margin:0;">
                        <label class="form-label">Jadwal Shift *</label>
                        <select class="form-select" name="shift_id">
                          ${s.shifts
                            .filter((sh) => sh.status === "active")
                            .map(
                              (sh) =>
                                `<option value="${esc(sh.id)}">${esc(sh.name)} (${String(sh.start_time).slice(0, 5)}–${String(sh.end_time).slice(0, 5)})</option>`
                            )
                            .join("")}
                        </select>
                      </div>
                    </div>
                    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;">
                      ${
                        Core.canDeleteEmployee(p)
                          ? `<button type="button" class="btn btn-outline btn-sm" style="color:var(--rose-700);border-color:#fecdd3;" data-action="delete-employee" data-userid="${esc(p.id)}">🗑️ Hapus</button>`
                          : ""
                      }
                      <button type="button" class="btn btn-danger btn-sm" data-action="reject-first-login" data-userid="${esc(p.id)}">✕ Tolak Akses</button>
                      <button type="button" class="btn btn-emerald btn-sm" data-action="submit-approve-first-login">✓ Setujui Login Pertama &amp; Aktifkan</button>
                    </div>
                  </form>`
                  )
                  .join("")}
              </div>`
        }
      </div>

      <div class="grid-12">
        <!-- BAGIAN B: PRA-DAFTARKAN EMAIL GOOGLE KARYAWAN -->
        <div class="col-5 card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:6px;">2. Pra-Setujui Email Google Karyawan</h3>
          <p style="font-size:12px;color:var(--stone-600);margin-bottom:12px;">
            Opsional: Daftarkan alamat Gmail karyawan terlebih dahulu agar saat mereka login Google pertama kali langsung aktif tanpa perlu menunggu.
          </p>
          <form id="form-preapprove-email" novalidate>
            <div class="form-group">
              <label class="form-label">Alamat Email Google (Gmail) *</label>
              <input type="email" class="form-input" name="email" placeholder="nama.karyawan@gmail.com" required />
            </div>
            <div class="grid-3" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">ID Karyawan *</label>
                <input class="form-input mono" name="employee_code" placeholder="SL-0105" required />
              </div>
              <div class="form-group">
                <label class="form-label">Divisi / Stasiun *</label>
                <select class="form-select" name="department" style="font-weight:700;">
                  <option value="bar" selected>🍹 Tim Bar</option>
                  <option value="kitchen">🍳 Tim Kitchen</option>
                  <option value="manager">👔 Pengawas / Manajer</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Jabatan *</label>
                <input class="form-input" name="position_title" value="Barista / Crew" required />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Nama Lengkap *</label>
                <input class="form-input" name="full_name" placeholder="Nama Karyawan" required />
              </div>
              <div class="form-group">
                <label class="form-label">No. Telepon / WA</label>
                <input class="form-input" name="phone" placeholder="0812xxxx" />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Outlet</label>
                <select class="form-select" name="outlet_id">
                  ${s.outlets.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join("")}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Shift</label>
                <select class="form-select" name="shift_id">
                  ${s.shifts.map((sh) => `<option value="${esc(sh.id)}">${esc(sh.name)}</option>`).join("")}
                </select>
              </div>
            </div>
            <button type="button" id="btn-save-preapprove" class="btn btn-primary" style="width:100%;" data-action="submit-preapprove-email">+ Simpan ke Daftar Pra-Persetujuan</button>
          </form>

          ${
            s.preapprovedEmails.length > 0
              ? `<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--coffee-200);">
                  <div style="font-size:12px;font-weight:800;margin-bottom:8px;">Menunggu Login Google Pertama (${s.preapprovedEmails.length}):</div>
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    ${s.preapprovedEmails
                      .map(
                        (pe) => `
                      <div class="card-subtle" style="padding:8px 10px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
                        <div>
                          <strong>${esc(pe.full_name)}</strong> (${esc(pe.employee_code)})<br/>
                          <span style="color:var(--stone-600);">${esc(pe.email)}</span>
                        </div>
                        <button class="btn btn-danger btn-sm" data-action="delete-preapproved" data-id="${esc(pe.id)}">Hapus</button>
                      </div>`
                      )
                      .join("")}
                  </div>
                </div>`
              : ""
          }
        </div>

        <!-- BAGIAN C: DAFTAR KARYAWAN AKTIF + EDIT & HAPUS RESIGN -->
        <div class="col-7 card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:4px;">
            <h3 style="font-size:15px;font-weight:800;margin:0;">
              3. Daftar Karyawan Aktif (${managedUsers.length} Akun)
            </h3>
          </div>
          <p style="font-size:11.5px;color:var(--stone-500);margin-bottom:10px;">
            Klik <strong>🗑️ Hapus</strong> jika ada member/karyawan yang resign agar langsung dihapus permanen dan otomatis hilang dari sistem.
          </p>

          <!-- FILTER DIVISI KARYAWAN (MANAJER / BAR / KITCHEN) -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;">
            <button type="button" class="btn btn-xs ${(uiState?.cpDeptFilter || 'all') === 'all' ? 'btn-primary' : 'btn-outline'}" data-action="filter-cp-dept" data-dept="all" style="padding:3px 8px;font-size:11px;">
              Semua (${managedUsers.length})
            </button>
            <button type="button" class="btn btn-xs ${(uiState?.cpDeptFilter || 'all') === 'bar' ? 'btn-emerald' : 'btn-outline'}" data-action="filter-cp-dept" data-dept="bar" style="padding:3px 8px;font-size:11px;${(uiState?.cpDeptFilter || 'all') === 'bar' ? '' : 'color:#065f46;border-color:#a7f3d0;'}">
              🍹 Tim Bar (${managedUsers.filter((e) => (e.department || 'bar') === 'bar').length})
            </button>
            <button type="button" class="btn btn-xs ${(uiState?.cpDeptFilter || 'all') === 'kitchen' ? 'btn-amber' : 'btn-outline'}" data-action="filter-cp-dept" data-dept="kitchen" style="padding:3px 8px;font-size:11px;${(uiState?.cpDeptFilter || 'all') === 'kitchen' ? '' : 'color:#9a3412;border-color:#fed7aa;'}">
              🍳 Tim Kitchen (${managedUsers.filter((e) => e.department === 'kitchen').length})
            </button>
            <button type="button" class="btn btn-xs ${(uiState?.cpDeptFilter || 'all') === 'manager' ? 'btn-primary' : 'btn-outline'}" data-action="filter-cp-dept" data-dept="manager" style="padding:3px 8px;font-size:11px;${(uiState?.cpDeptFilter || 'all') === 'manager' ? '' : 'color:#92400e;border-color:#fde68a;'}">
              👔 Tim Manajer (${managedUsers.filter((e) => e.department === 'manager').length})
            </button>
          </div>

          <div style="display:flex;flex-direction:column;gap:10px;">
            ${managedUsers
              .filter((emp) => {
                const f = uiState?.cpDeptFilter || "all";
                if (f === "all") return true;
                return (emp.department || "bar") === f;
              })
              .map((emp) => {
                const out = s.outlets.find((o) => o.id === emp.outlet_id);
                const sh = s.shifts.find((x) => x.id === emp.shift_id);
                const canEditThis =
                  Core.isSuperAdmin() ||
                  emp.role === "member" ||
                  emp.id === s.currentUser.id;
                const canDeleteThis = Core.canDeleteEmployee(emp);
                return `
                  <div class="card-subtle" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      ${renderAvatarHtml(emp)}
                      <div>
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                          <strong style="font-size:13.5px;">${esc(emp.full_name)}</strong>
                          <span class="mono" style="font-size:11px;color:var(--coffee-700);">(${esc(emp.employee_code)})</span>
                          <span class="badge ${emp.role === "super_admin" ? "badge-super" : emp.role === "admin" ? "badge-admin" : "badge-member"}">${esc(emp.role.replace("_", " ").toUpperCase())}</span>
                          ${getDepartmentBadge(emp.department)}
                          <span class="badge ${emp.status === "active" ? "badge-success" : "badge-danger"}">${esc(emp.status.toUpperCase())}</span>
                          ${emp.face_id_enrolled ? `<span class="badge badge-success" title="Face ID terdaftar pada 1 akun Google ini" style="font-size:10px;">🔒 Face ID Aktif</span>` : `<span class="badge badge-warning" title="Belum mendaftarkan Face ID" style="font-size:10px;">⚠️ Belum Face ID</span>`}
                        </div>
                        <div style="font-size:11.5px;color:var(--stone-600);margin-top:2px;">${esc(emp.position_title)} • ${esc(emp.email)} ${emp.phone ? "• " + esc(emp.phone) : ""}</div>
                        <div style="font-size:11px;color:var(--coffee-800);margin-top:2px;">Divisi: <strong>${esc(getDepartmentLabel(emp.department))}</strong> • Outlet: <strong>${esc(out ? out.name : "-")}</strong> • Shift: <strong>${esc(sh ? sh.name : "-")}</strong></div>
                      </div>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      ${
                        canEditThis
                          ? `<button class="btn btn-primary btn-sm" data-action="open-edit-employee" data-userid="${esc(emp.id)}">
                              ✏️ Edit Data
                            </button>`
                          : ""
                      }
                      ${
                        emp.face_id_enrolled && (Core.isSuperAdmin() || Core.isAdmin())
                          ? `<button type="button" class="btn btn-outline btn-sm" data-action="reset-face-id" data-userid="${esc(emp.id)}" data-name="${esc(emp.full_name)}" style="color:var(--coffee-800);border-color:var(--coffee-400);" title="Reset Face ID jika karyawan mengganti wajah/perlu rekam ulang">
                              🔄 Reset Face ID
                            </button>`
                          : ""
                      }
                      ${
                        Core.isSuperAdmin() && emp.first_login_approved && emp.role !== "super_admin"
                          ? emp.role === "member"
                            ? `<button type="button" class="btn btn-amber btn-sm" data-action="quick-change-role" data-userid="${esc(emp.id)}" data-newrole="admin">⚡ Jadikan Admin</button>
                               <button type="button" class="btn btn-outline btn-sm" data-action="open-role-modal" data-userid="${esc(emp.id)}" data-newrole="admin" title="Promosi dengan catatan khusus">📝</button>`
                            : `<button type="button" class="btn btn-outline btn-sm" data-action="quick-change-role" data-userid="${esc(emp.id)}" data-newrole="member">⬇️ Jadikan Anggota</button>
                               <button type="button" class="btn btn-outline btn-sm" data-action="open-role-modal" data-userid="${esc(emp.id)}" data-newrole="member" title="Turunkan dengan catatan khusus">📝</button>`
                          : ""
                      }
                      ${
                        canDeleteThis
                          ? `<button type="button" class="btn btn-danger btn-sm" data-action="delete-employee" data-userid="${esc(emp.id)}">
                              🗑️ Hapus
                            </button>`
                          : ""
                      }
                    </div>
                  </div>`;
              })
              .join("")}
          </div>

          ${
            resignedUsers.length > 0
              ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border-soft);">
                  <div style="font-size:12.5px;font-weight:800;color:var(--stone-700);margin-bottom:8px;">
                    Arsip Akun Nonaktif / Ditolak / Resign (${resignedUsers.length})
                  </div>
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    ${resignedUsers
                      .map(
                        (emp) => `
                      <div class="card-subtle" style="padding:10px 12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;opacity:0.86;">
                        <div>
                          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                            <strong style="font-size:13px;">${esc(emp.full_name)}</strong>
                            <span class="mono" style="font-size:11px;color:var(--stone-500);">(${esc(emp.employee_code)})</span>
                            <span class="badge badge-danger">${emp.status === "inactive" ? "NONAKTIF / RESIGN" : "DITOLAK"}</span>
                          </div>
                          <div style="font-size:11px;color:var(--stone-500);">${esc(emp.email)} • ${esc(emp.position_title)}</div>
                        </div>
                        <div style="display:flex;gap:6px;">
                          <button type="button" class="btn btn-outline btn-sm" data-action="open-edit-employee" data-userid="${esc(emp.id)}">✏️ Pulihkan</button>
                          ${
                            Core.canDeleteEmployee(emp)
                              ? `<button type="button" class="btn btn-danger btn-sm" data-action="delete-employee" data-userid="${esc(emp.id)}">🗑️ Hapus</button>`
                              : ""
                          }
                        </div>
                      </div>`
                      )
                      .join("")}
                  </div>
                </div>`
              : ""
          }
        </div>
      </div>
    `;
  }

  // 7.2 Manajemen Role (Promosi/Demosi Admin Khusus Super Admin)
  function renderCpRoles() {
    const s = Core.state;
    const isSuper = Core.isSuperAdmin();
    const approvedUsers = s.profiles.filter((p) => p.first_login_approved && p.status === "active");

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;">Manajemen Role Pengguna (Super Admin, Admin, Anggota)</h3>
            <p style="font-size:12px;color:var(--stone-600);">
              Hanya <strong>Super Admin</strong> yang dapat menjadikan Anggota sebagai Admin atau menurunkannya. Klik <strong>⚡ Jadikan Admin</strong> untuk promosi instan 1-klik.
            </p>
          </div>
          <span class="badge badge-super">${isSuper ? "Mode Kendali Super Admin Aktif" : "Hanya Lihat (Khusus Super Admin)"}</span>
        </div>

        <div class="grid-3">
          ${approvedUsers
            .map(
              (u) => `
            <div class="card-subtle" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
              <div style="display:flex;align-items:center;gap:10px;">
                ${renderAvatarHtml(u)}
                <div>
                  <div style="font-weight:800;font-size:13.5px;">${esc(u.full_name)}</div>
                  <div style="font-size:11.5px;color:var(--stone-600);">${esc(u.email)}</div>
                  <span class="badge ${u.role === "super_admin" ? "badge-super" : u.role === "admin" ? "badge-admin" : "badge-member"}" style="margin-top:4px;">
                    ${esc(u.role.replace("_", " ").toUpperCase())}
                  </span>
                </div>
              </div>
              <div>
                ${
                  u.role === "super_admin"
                    ? `<div style="font-size:11px;font-weight:700;color:var(--purple-800);">🔒 Akun Super Admin Tunggal (Dilindungi Permanen)</div>`
                    : isSuper
                    ? u.role === "member"
                      ? `<div style="display:flex;gap:6px;">
                           <button type="button" class="btn btn-amber btn-sm" style="flex:1;" data-action="quick-change-role" data-userid="${esc(u.id)}" data-newrole="admin">⚡ Jadikan Admin (1-Klik)</button>
                           <button type="button" class="btn btn-outline btn-sm" data-action="open-role-modal" data-userid="${esc(u.id)}" data-newrole="admin" title="Promosi dengan alasan khusus">📝</button>
                           <button type="button" class="btn btn-danger btn-sm" data-action="delete-employee" data-userid="${esc(u.id)}" title="Hapus member permanen">🗑️</button>
                         </div>`
                      : `<div style="display:flex;gap:6px;">
                           <button type="button" class="btn btn-outline btn-sm" style="flex:1;" data-action="quick-change-role" data-userid="${esc(u.id)}" data-newrole="member">⬇️ Jadikan Anggota (1-Klik)</button>
                           <button type="button" class="btn btn-outline btn-sm" data-action="open-role-modal" data-userid="${esc(u.id)}" data-newrole="member" title="Turunkan dengan alasan khusus">📝</button>
                           <button type="button" class="btn btn-danger btn-sm" data-action="delete-employee" data-userid="${esc(u.id)}" title="Hapus akun permanen">🗑️</button>
                         </div>`
                    : `<div style="font-size:11px;color:var(--stone-500);">Perubahan role hanya oleh Super Admin</div>`
                }
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;
  }

  // 7.3 Pengaturan Jadwal Shift (Tambah + Edit Penuh Semua Shift Tanpa VS Code)
  function renderCpShifts(uiState) {
    const s = Core.state;
    const editing = uiState.editingShiftId
      ? s.shifts.find((x) => x.id === uiState.editingShiftId)
      : null;

    return `
      <div class="grid-12">
        <div class="col-5 card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">
            ${editing ? `✏️ Edit Shift: ${esc(editing.name)}` : "+ Buat Jadwal Shift Baru"}
          </h3>
          <form id="form-save-shift" novalidate>
            <input type="hidden" name="id" value="${esc(editing ? editing.id : "")}" />
            <div class="form-group">
              <label class="form-label">Nama Shift *</label>
              <input class="form-input" id="shift-name-input" name="name" value="${esc(editing ? editing.name : "")}" placeholder="Contoh: Shift Pagi (Opening)" required />
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Jam Mulai *</label>
                <input type="text" class="form-input mono" id="shift-start-time-input" name="start_time" value="${esc(editing ? String(editing.start_time).slice(0, 5) : "07:00")}" placeholder="Contoh: 07:00 atau 07.00" required />
                <span style="font-size:10px;color:var(--stone-500);margin-top:2px;display:block;">Format 24 jam (misal 14:30 atau 14.30)</span>
              </div>
              <div class="form-group">
                <label class="form-label">Jam Selesai *</label>
                <input type="text" class="form-input mono" id="shift-end-time-input" name="end_time" value="${esc(editing ? String(editing.end_time).slice(0, 5) : "15:00")}" placeholder="Contoh: 15:00 atau 15.00" required />
                <span style="font-size:10px;color:var(--stone-500);margin-top:2px;display:block;">Format 24 jam (misal 22:30 atau 22.30)</span>
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Toleransi Terlambat (Menit)</label>
                <input type="number" class="form-input" name="grace_period_minutes" min="0" max="180" value="${editing ? editing.grace_period_minutes : 15}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Ambang Pulang Cepat (Menit)</label>
                <input type="number" class="form-input" name="early_checkout_threshold_minutes" min="0" max="180" value="${editing ? editing.early_checkout_threshold_minutes : 15}" required />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Tanggal Efektif</label>
                <input type="date" class="form-input" name="effective_from" value="${esc(editing ? editing.effective_from : new Date().toISOString().slice(0, 10))}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Status Shift</label>
                <select class="form-select" name="status">
                  <option value="active" ${!editing || editing.status === "active" ? "selected" : ""}>Aktif</option>
                  <option value="archived" ${editing && editing.status === "archived" ? "selected" : ""}>Diarsipkan</option>
                </select>
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;margin-bottom:14px;">
              <input type="checkbox" name="crosses_midnight" ${editing && editing.crosses_midnight ? "checked" : ""} />
              Shift melewati tengah malam (Crosses Midnight)
            </label>
            <div class="shift-selector-grid" style="display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" id="btn-save-shift" class="btn btn-primary" style="flex:1;" data-action="submit-save-shift">
                ${editing ? "💾 Simpan Perubahan Shift" : "+ Tambah Jadwal Shift"}
              </button>
              ${
                editing
                  ? `<button type="button" class="btn btn-outline" data-action="cancel-edit-shift">Batal</button>
                     <button type="button" class="btn btn-danger btn-sm" data-action="delete-shift" data-id="${esc(editing.id)}" title="Hapus atau Arsipkan Shift">🗑️ Hapus Shift</button>`
                  : ""
              }
            </div>
          </form>
        </div>

        <div class="col-7 card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">Daftar Seluruh Jadwal Shift (${s.shifts.length})</h3>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${s.shifts
              .map(
                (sh) => `
              <div class="card-subtle" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                <div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <strong style="font-size:14px;">${esc(sh.name)}</strong>
                    <span class="badge ${sh.status === "active" ? "badge-success" : "badge-member"}">${sh.status === "active" ? "Aktif" : "Arsip"}</span>
                    ${sh.crosses_midnight ? `<span class="badge badge-warning">Lintas Malam</span>` : ""}
                  </div>
                  <div class="mono" style="font-size:12px;color:var(--coffee-800);margin-top:3px;">
                    Jam: ${String(sh.start_time).slice(0, 5)} – ${String(sh.end_time).slice(0, 5)} • Toleransi Terlambat: ${sh.grace_period_minutes} mnt • Pulang Cepat: ${sh.early_checkout_threshold_minutes} mnt
                  </div>
                </div>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-primary btn-sm" data-action="edit-shift" data-id="${esc(sh.id)}">
                    ✏️ Edit Shift
                  </button>
                  <button class="btn btn-outline btn-sm" data-action="delete-shift" data-id="${esc(sh.id)}" title="Hapus atau Arsipkan Shift">
                    🗑️ Hapus
                  </button>
                </div>
              </div>`
              )
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  // 7.4 Pengaturan Outlet & Geofence GPS (Tambah + Edit Penuh + Ambil GPS Saat Ini)
  function renderCpOutlets(uiState) {
    const s = Core.state;
    const editing =
      uiState.editingOutletId === "new"
        ? null
        : s.outlets.find((o) => o.id === uiState.editingOutletId) || s.outlets[0] || null;

    return `
      <div class="grid-12">
        <div class="col-5 card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
            <h3 style="font-size:15px;font-weight:800;">
              ${editing ? `✏️ Edit Outlet: ${esc(editing.name)}` : "+ Tambah Outlet Baru"}
            </h3>
            <button class="btn btn-outline btn-sm" data-action="new-outlet-form">+ Outlet Baru</button>
          </div>

          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
            ${s.outlets
              .map(
                (o) => `
              <button class="btn ${editing && editing.id === o.id ? "btn-primary" : "btn-outline"} btn-sm" data-action="select-outlet-edit" data-id="${esc(o.id)}">
                📍 ${esc(o.name)}
              </button>`
              )
              .join("")}
          </div>

          <form id="form-save-outlet" novalidate>
            <input type="hidden" name="id" value="${esc(editing ? editing.id : "")}" />
            <div class="form-group">
              <label class="form-label">Nama Outlet *</label>
              <input class="form-input" id="outlet-name-input" name="name" value="${esc(editing ? editing.name : "Suka Latte Café & Catering")}" placeholder="Contoh: Suka Latte Café & Catering" required />
            </div>
            <div class="form-group">
              <label class="form-label">Alamat Lengkap *</label>
              <input class="form-input" id="outlet-address-input" name="address" value="${esc(editing ? editing.address : "Jalan Pura Uma Jati Gang Gagak Jl. Teges Kanginan No.Br, Peliatan, Ubud, Gianyar, Bali 80571")}" placeholder="Jl. Pura Uma Jati Gang Gagak Jl. Teges Kanginan No.Br, Peliatan" required />
            </div>

            <!-- Bantuan Penentuan Titik GPS Akurat Suka Latte -->
            <div style="background:var(--coffee-50);border:1px solid var(--coffee-200);border-radius:8px;padding:10px 12px;margin-bottom:12px;">
              <div style="font-size:11.5px;font-weight:700;color:var(--coffee-900);margin-bottom:8px;display:flex;align-items:center;gap:6px;">
                <span>🎯 Alat Bantu Titik GPS Fisik Outlet</span>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
                <button type="button" class="btn btn-emerald btn-sm" style="flex:1;min-width:180px;" data-action="fill-outlet-current-gps" id="btn-fill-gps" title="Gunakan koordinat GPS perangkat fisik saat ini">
                  📍 Gunakan GPS Lokasi Saya Saat Ini
                </button>
                <button type="button" class="btn btn-outline btn-sm" style="flex:1;min-width:160px;" data-action="geocode-outlet-address" id="btn-geocode-addr" title="Cari koordinat otomatis berdasarkan nama alamat di atas">
                  🔍 Cari GPS dari Alamat
                </button>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button type="button" class="btn btn-secondary btn-sm" style="flex:1;font-size:11px;" data-action="set-preset-bali-gps" id="btn-preset-bali" title="Pasang koordinat presisi Suka Latte Banjar Teges Kanginan, Peliatan, Ubud, Bali">
                  ⭐ Pasang Koordinat Suka Latte Bali (Peliatan, Ubud)
                </button>
                <a id="btn-open-gmaps-link" href="https://maps.google.com/?q=${editing ? editing.latitude : -8.524600},${editing ? editing.longitude : 115.274100}" target="_blank" rel="noreferrer" class="btn btn-outline btn-sm" style="font-size:11px;display:inline-flex;align-items:center;gap:4px;" title="Buka Google Maps di tab baru">
                  🗺️ Buka di Google Maps ↗
                </a>
              </div>
              <div id="outlet-helper-toast" style="display:none;font-size:11.5px;margin-top:8px;padding:8px 10px;border-radius:6px;line-height:1.4;"></div>
            </div>

            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Latitude *</label>
                <input class="form-input mono" id="outlet-lat-input" name="latitude" value="${editing ? editing.latitude : -8.524600}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Longitude *</label>
                <input class="form-input mono" id="outlet-lng-input" name="longitude" value="${editing ? editing.longitude : 115.274100}" required />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Radius Geofence (Meter) *</label>
                <input type="number" class="form-input" id="outlet-radius-input" name="geofence_radius_meters" min="10" max="5000" value="${editing ? editing.geofence_radius_meters : 150}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Batas Akurasi GPS (Meter) *</label>
                <input type="number" class="form-input" id="outlet-accuracy-input" name="minimum_gps_accuracy_meters" min="5" max="1000" value="${editing ? editing.minimum_gps_accuracy_meters : 100}" required />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Zona Waktu Outlet</label>
                <select class="form-select" id="outlet-timezone-select" name="timezone">
                  <option value="Asia/Makassar" ${!editing || editing.timezone === "Asia/Makassar" ? "selected" : ""}>Asia/Makassar (WITA - Bali & Makassar)</option>
                  <option value="Asia/Jakarta" ${editing && editing.timezone === "Asia/Jakarta" ? "selected" : ""}>Asia/Jakarta (WIB)</option>
                  <option value="Asia/Jayapura" ${editing && editing.timezone === "Asia/Jayapura" ? "selected" : ""}>Asia/Jayapura (WIT)</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Status Outlet</label>
                <select class="form-select" name="status">
                  <option value="active" ${!editing || editing.status === "active" ? "selected" : ""}>Aktif</option>
                  <option value="archived" ${editing && editing.status === "archived" ? "selected" : ""}>Diarsipkan</option>
                </select>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">
              <button type="button" id="btn-save-outlet" class="btn btn-primary" style="flex:1;" data-action="submit-save-outlet">
                💾 ${editing ? "Simpan Perubahan Outlet & Radius GPS" : "Simpan Outlet Baru"}
              </button>
              ${
                editing && s.outlets.length > 1
                  ? `<button type="button" class="btn btn-danger btn-sm" data-action="delete-outlet" data-id="${esc(editing.id)}" title="Hapus atau Arsipkan Outlet">🗑️ Hapus Outlet</button>`
                  : ""
              }
            </div>
          </form>
        </div>

        <div class="col-7" id="radar-preview-wrapper">
          ${renderGeofenceMapCard(
            editing || {
              name: "Pratinjau Outlet Baru",
              address: "Jalan Pura Uma Jati Gang Gagak Jl. Teges Kanginan No.Br, Peliatan, Ubud, Gianyar, Bali 80571",
              latitude: -8.524600,
              longitude: 115.274100,
              geofence_radius_meters: 150,
              minimum_gps_accuracy_meters: 100,
            },
            null
          )}
        </div>
      </div>
    `;
  }

  // 7.5 Pengaturan Aturan Absensi & Zona Waktu (Full Edit)
  function renderCpRules() {
    const cfg = Core.state.settings;
    return `
      <div class="card">
        <h3 style="font-size:16px;font-weight:800;margin-bottom:14px;">Edit Aturan Transaksi Absensi &amp; Zona Waktu Operasional</h3>
        <form id="form-save-rules" novalidate>
          <div class="grid-2">
            <div class="card-subtle" style="display:flex;flex-direction:column;gap:12px;">
              <div style="font-weight:800;font-size:13.5px;">Validasi Kamera Selfie &amp; Lokasi Geofence</div>
              <label style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px;">
                <input type="checkbox" name="require_selfie_photo" ${cfg.require_selfie_photo ? "checked" : ""} style="margin-top:3px;" />
                <span><strong>Wajib Foto Selfie Baru Kamera Langsung</strong> pada setiap Check In &amp; Check Out</span>
              </label>
              <label style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px;">
                <input type="checkbox" name="require_gps_validation" ${cfg.require_gps_validation ? "checked" : ""} style="margin-top:3px;" />
                <span><strong>Wajib Koordinat GPS Perangkat</strong> saat melakukan Check In &amp; Check Out</span>
              </label>
              <label style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px;">
                <input type="checkbox" name="strict_geofence_enforcement" ${cfg.strict_geofence_enforcement ? "checked" : ""} style="margin-top:3px;" />
                <span><strong>Tolak Otomatis Jika Di Luar Radius Outlet</strong> (jika dimatikan, tetap dicatat dengan tanda anomali lokasi)</span>
              </label>
            </div>

            <div class="card-subtle" style="display:flex;flex-direction:column;gap:12px;">
              <div class="form-group" style="margin:0;">
                <label class="form-label">Zona Waktu Operasional Resmi</label>
                <select class="form-select" name="operational_timezone">
                  <option value="Asia/Makassar" ${cfg.operational_timezone === "Asia/Makassar" ? "selected" : ""}>Asia/Makassar — WITA (UTC+08:00)</option>
                  <option value="Asia/Jakarta" ${cfg.operational_timezone === "Asia/Jakarta" ? "selected" : ""}>Asia/Jakarta — WIB (UTC+07:00)</option>
                  <option value="Asia/Jayapura" ${cfg.operational_timezone === "Asia/Jayapura" ? "selected" : ""}>Asia/Jayapura — WIT (UTC+09:00)</option>
                </select>
              </div>
              <div class="form-group" style="margin:0;">
                <label class="form-label">Batas Peringatan Selisih Jam Perangkat vs Server (Detik)</label>
                <input type="number" class="form-input" name="clock_skew_warning_threshold_seconds" min="30" max="3600" value="${cfg.clock_skew_warning_threshold_seconds || 120}" />
              </div>
              <div class="card-subtle" style="font-size:12px;background:var(--coffee-50);border:1px solid var(--coffee-200);border-radius:10px;padding:10px 12px;margin-top:6px;">
                <div style="font-weight:800;color:var(--coffee-900);margin-bottom:3px;">
                  🔒 Hak Akses Edit Kehadiran
                </div>
                <div style="color:var(--stone-600);line-height:1.5;">
                  • <strong>Edit &amp; Hapus Absensi:</strong> Khusus <strong>Super Admin &amp; Admin</strong>.<br/>
                  • <strong>Anggota Biasa:</strong> Hanya dapat melakukan absensi dan mengajukan izin/sakit/cuti (tidak dapat mengedit catatan kehadiran pribadi).
                </div>
                <input type="hidden" name="allow_member_request_corrections" value="false" />
              </div>
              <label style="display:flex;gap:10px;align-items:center;font-size:12.5px;">
                <input type="checkbox" name="allow_member_request_leaves" ${cfg.allow_member_request_leaves ? "checked" : ""} />
                <span>Izinkan Anggota mengajukan izin / sakit / cuti dari aplikasi (bisa dari luar outlet)</span>
              </label>
            </div>
          </div>
          <div style="margin-top:16px;display:flex;justify-content:flex-end;">
            <button type="button" id="btn-save-rules" class="btn btn-primary" data-action="submit-save-rules">💾 Simpan Seluruh Aturan Absensi</button>
          </div>
        </form>
      </div>
    `;
  }

  // 7.6 Koreksi Kehadiran & Edit Kehadiran oleh Pengelola
  function renderCpCorrections() {
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;">Permintaan Koreksi &amp; Riwayat Edit Kehadiran (${s.corrections.length})</h3>
            <p style="font-size:12px;color:var(--stone-600);">
              Menyimpan nilai asli dan nilai koreksi berdampingan tanpa menghapus bukti foto selfie asli. Anda juga dapat mengedit jam kehadiran langsung melalui tombol <strong>✏️ Edit Kehadiran</strong> pada kartu/tabel absensi.
            </p>
          </div>
        </div>

        ${
          s.corrections.length === 0
            ? `<div class="card-subtle" style="text-align:center;color:var(--stone-500);font-size:12.5px;">Belum ada permintaan koreksi absensi.</div>`
            : `<div style="display:flex;flex-direction:column;gap:10px;">
                ${s.corrections
                  .map((c) => {
                    const emp = s.profiles.find((p) => p.id === c.employee_id);
                    return `
                      <div class="card-subtle" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                        <div>
                          <div style="font-weight:800;font-size:13.5px;">
                            ${esc(emp ? emp.full_name : "Karyawan")} • Tanggal Kerja: ${esc(c.work_date)}
                            <span class="badge ${c.status === "approved" ? "badge-success" : c.status === "rejected" ? "badge-danger" : "badge-warning"}" style="margin-left:6px;">
                              ${esc(c.status.toUpperCase())}
                            </span>
                          </div>
                          <div style="font-size:12px;margin:4px 0;"><strong>Alasan:</strong> ${esc(c.reason)}</div>
                          <div class="mono" style="font-size:11px;color:var(--coffee-800);">
                            Asli: In ${Core.formatOperationalDateTime(c.original_values?.check_in_at, tz, false)} / Out ${Core.formatOperationalDateTime(c.original_values?.check_out_at, tz, false)}
                            → Usulan: In ${Core.formatOperationalDateTime(c.proposed_values?.check_in_at, tz, false)} / Out ${Core.formatOperationalDateTime(c.proposed_values?.check_out_at, tz, false)} (${esc(c.proposed_values?.attendance_status)})
                          </div>
                        </div>
                        ${
                          c.status === "pending"
                            ? `<div style="display:flex;gap:8px;">
                                <button class="btn btn-emerald btn-sm" data-action="review-corr" data-id="${esc(c.id)}" data-decision="approved">✓ Setujui</button>
                                <button class="btn btn-danger btn-sm" data-action="review-corr" data-id="${esc(c.id)}" data-decision="rejected">✕ Tolak</button>
                              </div>`
                            : ""
                        }
                      </div>`;
                  })
                  .join("")}
              </div>`
        }
      </div>
    `;
  }

  // 7.7 Kalender Kerja, Hari Libur, Izin, Sakit, Cuti (Tambah + Edit + Hapus + Setujui)
  function renderCpCalendar(uiState) {
    const s = Core.state;
    const editing = uiState.editingCalendarId
      ? s.holidaysAndLeaves.find((h) => h.id === uiState.editingCalendarId)
      : null;

    return `
      <div class="grid-12">
        <div class="col-5 card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">
            ${editing ? `✏️ Edit Entri Kalender` : "+ Tambah Hari Libur / Izin / Sakit / Cuti"}
          </h3>
          <form id="form-save-calendar" novalidate>
            <input type="hidden" name="id" value="${esc(editing ? editing.id : "")}" />
            <div class="form-group">
              <label class="form-label">Jenis Keterangan</label>
              <select class="form-select" name="type">
                <option value="holiday" ${editing && editing.type === "holiday" ? "selected" : ""}>Hari Libur Outlet / Nasional</option>
                <option value="jadwal_khusus" ${editing && editing.type === "jadwal_khusus" ? "selected" : ""}>Jadwal Operasional Khusus</option>
                <option value="izin" ${editing && editing.type === "izin" ? "selected" : ""}>Izin Karyawan</option>
                <option value="sakit" ${editing && editing.type === "sakit" ? "selected" : ""}>Sakit</option>
                <option value="cuti" ${editing && editing.type === "cuti" ? "selected" : ""}>Cuti</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Karyawan (Kosongkan jika berlaku untuk Seluruh Outlet)</label>
              <select class="form-select" name="employee_id">
                <option value="">-- Berlaku untuk Seluruh Outlet --</option>
                ${s.profiles
                  .filter((p) => p.first_login_approved && p.status === "active")
                  .map(
                    (p) =>
                      `<option value="${esc(p.id)}" ${editing && editing.employee_id === p.id ? "selected" : ""}>${esc(p.full_name)} (${esc(p.employee_code)})</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Judul Keterangan *</label>
              <input class="form-input" id="calendar-title-input" name="title" value="${esc(editing ? editing.title : "")}" placeholder="Contoh: Libur Hari Raya / Izin Kesehatan" required />
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Mulai Tanggal *</label>
                <input type="date" class="form-input" name="date_start" value="${esc(editing ? editing.date_start : new Date().toISOString().slice(0, 10))}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Sampai Tanggal *</label>
                <input type="date" class="form-input" name="date_end" value="${esc(editing ? editing.date_end : new Date().toISOString().slice(0, 10))}" required />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Alasan / Catatan *</label>
              <textarea class="form-textarea" name="reason" rows="2" required>${esc(editing ? editing.reason : "")}</textarea>
            </div>
            <div style="display:flex;gap:8px;">
              <button type="button" id="btn-save-calendar" class="btn btn-primary" style="flex:1;" data-action="submit-save-calendar">
                💾 ${editing ? "Simpan Perubahan" : "Simpan ke Kalender"}
              </button>
              ${
                editing
                  ? `<button type="button" class="btn btn-outline" data-action="cancel-edit-calendar">Batal</button>`
                  : ""
              }
            </div>
          </form>
        </div>

        <div class="col-7 card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">Daftar Kalender Kerja &amp; Ketidakhadiran (${s.holidaysAndLeaves.length})</h3>
          ${
            s.holidaysAndLeaves.length === 0
              ? `<div class="card-subtle" style="text-align:center;color:var(--stone-500);font-size:12.5px;">Belum ada jadwal libur atau pengajuan izin/cuti.</div>`
              : `<div style="display:flex;flex-direction:column;gap:10px;">
                  ${s.holidaysAndLeaves
                    .map((h) => {
                      const emp = h.employee_id
                        ? s.profiles.find((p) => p.id === h.employee_id)
                        : null;
                      return `
                        <div class="card-subtle" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                          <div>
                            <div style="display:flex;align-items:center;gap:6px;">
                              <span class="badge badge-member">${esc(h.type.toUpperCase())}</span>
                              <strong style="font-size:13.5px;">${esc(h.title)}</strong>
                              <span class="badge ${h.status === "approved" ? "badge-success" : h.status === "rejected" ? "badge-danger" : "badge-warning"}">${esc(h.status.toUpperCase())}</span>
                            </div>
                            <div style="font-size:11.5px;color:var(--stone-600);margin-top:3px;">
                              ${esc(h.date_start)} s/d ${esc(h.date_end)} • ${esc(emp ? emp.full_name : "Seluruh Outlet")} • ${esc(h.reason)}
                            </div>
                          </div>
                          <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            ${
                              h.status === "pending"
                                ? `<button class="btn btn-emerald btn-sm" data-action="approve-leave" data-id="${esc(h.id)}" data-decision="approved">Setujui</button>
                                   <button class="btn btn-danger btn-sm" data-action="approve-leave" data-id="${esc(h.id)}" data-decision="rejected">Tolak</button>`
                                : ""
                            }
                            <button class="btn btn-outline btn-sm" data-action="edit-calendar" data-id="${esc(h.id)}">✏️ Edit</button>
                            <button class="btn btn-danger btn-sm" data-action="delete-calendar" data-id="${esc(h.id)}">Hapus</button>
                          </div>
                        </div>`;
                    })
                    .join("")}
                </div>`
          }
        </div>
      </div>
    `;
  }

  // 7.8 Branding & Tampilan (Full Edit Tanpa VS Code)
  function renderCpBranding() {
    const cfg = Core.state.settings;
    return `
      <div class="grid-12">
        <div class="col-6 card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">Edit Branding &amp; Tampilan Aplikasi</h3>
          <form id="form-save-branding" novalidate>
            <div class="form-group">
              <label class="form-label">Nama Tampilan Utama</label>
              <input class="form-input" id="branding-name-input" name="brand_display_name" value="${esc(cfg.brand_display_name)}" required />
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Subjudul Usaha</label>
                <input class="form-input" name="brand_subtitle" value="${esc(cfg.brand_subtitle)}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Tagline Resmi</label>
                <input class="form-input" name="brand_tagline" value="${esc(cfg.brand_tagline)}" required />
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Teks Sambutan Header</label>
              <textarea class="form-textarea" name="welcome_message" rows="2" required>${esc(cfg.welcome_message)}</textarea>
            </div>
            <div class="form-group">
              <label class="form-label">Pilihan Tema Warna Suka Latte</label>
              <select class="form-select" name="theme_preset">
                <option value="classic_latte" ${cfg.theme_preset === "classic_latte" ? "selected" : ""}>Classic Coffee Latte</option>
                <option value="espresso_dark" ${cfg.theme_preset === "espresso_dark" ? "selected" : ""}>Espresso Roast</option>
                <option value="warm_cream" ${cfg.theme_preset === "warm_cream" ? "selected" : ""}>Warm Home Cream</option>
              </select>
            </div>
            <button type="button" id="btn-save-branding" class="btn btn-primary" style="width:100%;" data-action="submit-save-branding">💾 Simpan Perubahan Branding</button>
          </form>
        </div>

        <div class="col-6 card" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;">
          <img src="assets/branding/suka-logo.png" alt="Logo Asli SUKA.pdf" style="width:170px;height:170px;object-fit:contain;border:1px solid var(--coffee-200);border-radius:20px;padding:10px;background:#fff;" />
          <div style="font-weight:800;font-size:14px;">Identitas Logo Asli Suka Latte (<code>SUKA.pdf</code>)</div>
          <a href="assets/branding/SUKA.pdf" target="_blank" rel="noreferrer" style="font-size:12px;font-weight:700;">Buka Dokumen Master SUKA.pdf Asli ↗</a>
        </div>
      </div>
    `;
  }

  // 7.9 Audit Log Append-Only
  function renderCpAudit() {
    const s = Core.state;
    const tz = s.settings.operational_timezone || "Asia/Makassar";
    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;">Rekam Jejak Audit Log Sistem (Append-Only)</h3>
            <p style="font-size:12px;color:var(--stone-600);">Catatan audit bersifat permanen di database dan dilindungi dari pengeditan maupun penghapusan.</p>
          </div>
          <span class="badge badge-success">${s.auditLogs.length} Aktivitas Tercatat</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Waktu Server (WITA)</th>
                <th>Pelaku</th>
                <th>Aksi</th>
                <th>Target</th>
                <th>Rincian Perubahan</th>
              </tr>
            </thead>
            <tbody>
              ${s.auditLogs
                .map(
                  (l) => `
                <tr>
                  <td class="mono">${Core.formatOperationalDateTime(l.created_at, tz)}</td>
                  <td><strong>${esc(l.actor_name)}</strong><br/><span style="font-size:10px;text-transform:uppercase;color:var(--stone-500);">${esc(l.actor_role)}</span></td>
                  <td class="mono" style="font-weight:800;color:var(--coffee-800);">${esc(l.action)}</td>
                  <td class="mono">${esc(l.target_type)} (${esc(String(l.target_id || "").slice(0, 12))})</td>
                  <td>${esc(l.detail)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 7.10 Keamanan, Retensi Arsip, & Export config.js Tanpa VS Code
  function renderCpSecurity() {
    const s = Core.state;
    const cfg = s.settings;
    const isSuper = Core.isSuperAdmin();

    return `
      <div class="grid-2">
        <div class="card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">Kebijakan Sesi &amp; Retensi Arsip Foto Bulanan</h3>
          <form id="form-save-security" novalidate>
            <div class="form-group">
              <label class="form-label">Kebijakan Retensi Penyimpanan Foto Absensi</label>
              <select class="form-select" name="photo_retention_policy_months" ${!isSuper ? "disabled" : ""}>
                <option value="0" ${Number(cfg.photo_retention_policy_months) === 0 ? "selected" : ""}>Tanpa Kedaluwarsa (Pergantian bulan tidak pernah menghapus arsip)</option>
                <option value="12" ${Number(cfg.photo_retention_policy_months) === 12 ? "selected" : ""}>12 Bulan (1 Tahun)</option>
                <option value="24" ${Number(cfg.photo_retention_policy_months) === 24 ? "selected" : ""}>24 Bulan (2 Tahun)</option>
                <option value="36" ${Number(cfg.photo_retention_policy_months) === 36 ? "selected" : ""}>36 Bulan (3 Tahun)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Batas Timeout Sesi (Menit)</label>
              <input type="number" class="form-input" name="session_timeout_minutes" min="15" max="1440" value="${cfg.session_timeout_minutes || 120}" ${!isSuper ? "disabled" : ""} />
            </div>
            <button type="button" id="btn-save-security" class="btn btn-primary" data-action="submit-save-security" ${!isSuper ? "disabled" : ""}>💾 Simpan Kebijakan Keamanan</button>
          </form>
        </div>

        <div class="card" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:15px;font-weight:800;margin-bottom:8px;">Konfigurasi Cloud &amp; Deployment Tanpa VS Code</h3>
            <p style="font-size:12px;color:var(--stone-600);line-height:1.6;">
              Terhubung ke server Supabase: <code style="font-weight:700;">${esc(s.supabaseUrl)}</code>.<br/>
              Jika Anda ingin meng-upload website ini ke Vercel/GitHub agar seluruh HP karyawan langsung terhubung otomatis tanpa perlu mengisi URL Supabase, unduh file <code>config.js</code> siap pakai di bawah ini lalu letakkan ke dalam folder <code>js/</code>.
            </p>
          </div>
          ${
            isSuper
              ? `<div style="display:flex;gap:10px;flex-wrap:wrap;">
                  <button class="btn btn-emerald" data-action="download-config-js">⬇️ Unduh File config.js Siap Upload Vercel</button>
                  <button class="btn btn-outline" data-action="reset-cloud-config">Ganti Koneksi Supabase</button>
                </div>`
              : `<div style="font-size:11.5px;color:var(--stone-500);">Pengaturan infrastruktur cloud dikhususkan bagi Super Admin.</div>`
          }
        </div>

        ${
          (isSuper || s.currentUser?.role === "admin")
            ? `
        <div class="card" style="border:1px solid #fca5a5;background:linear-gradient(180deg,#fff,#fff1f2);grid-column:1 / -1;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
            <div>
              <span class="badge badge-danger" style="margin-bottom:6px;">Uji Coba &amp; Pembersihan Data</span>
              <h3 style="font-size:15px;font-weight:800;color:var(--rose-900);margin:0 0 4px 0;">Reset / Bersihkan Seluruh Data Absensi Uji Coba</h3>
              <p style="font-size:12px;color:var(--rose-700);margin:0;max-width:700px;line-height:1.5;">
                Saat ini terdapat <strong>${s.attendance.length} catatan absensi</strong> di database. Jika Anda telah selesai melakukan uji coba dan ingin memulai operasional normal yang bersih, Anda dapat menghapus seluruh data absensi uji coba sekaligus beserta foto selfie-nya.
              </p>
            </div>
            <button type="button" class="btn btn-danger" data-action="clear-all-trial-attendance" ${s.attendance.length === 0 ? "disabled" : ""}>
              🗑️ Bersihkan Seluruh Absensi Uji Coba
            </button>
          </div>
        </div>`
            : ""
        }
      </div>
    `;
  }

  window.SukaViews = {
    getWeekCalendarRange,
    getMonthCalendarRange,
    getColleaguesForSchedule,
    getDepartmentBadge,
    getDepartmentLabel,
    formatIndoDate,
    renderAvatarHtml,
    renderCloudSetupScreen,
    renderGoogleLoginOrBootstrapScreen,
    renderPendingOrBlockedScreen,
    renderGeofenceMapCard,
    renderAttendanceRecordCard,
    renderMemberAttendanceHome,
    renderMemberScheduleView,
    renderMemberShiftSwapsView,
    renderMemberOwnHistoryView,
    renderManagerDashboardView,
    renderManagerScheduleView,
    renderCpSchedule,
    renderManagerArchiveView,
    renderManagerReportsView,
    renderControlPanelView,
  };
})();
