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
      <div style="min-height:100vh;background:linear-gradient(135deg,var(--coffee-950),var(--coffee-900));display:flex;align-items:center;justify-content:center;padding:20px;">
        <div class="modal-window" style="max-width:860px;">
          <div class="grid-12" style="gap:0;">
            <!-- KIRI: BRANDING ASLI SUKA LATTE -->
            <div class="col-5" style="background:var(--coffee-900);color:var(--cream);padding:28px;display:flex;flex-direction:column;justify-content:space-between;">
              <div>
                <div class="brand-box" style="margin-bottom:20px;">
                  <div class="brand-logo-wrap lg">
                    <img src="assets/branding/suka-logo.png" alt="Logo Asli Suka Latte" />
                  </div>
                  <div>
                    <div class="brand-title" style="font-size:15px;">${esc(s.settings.brand_display_name)}</div>
                    <div class="brand-sub">SUKA LATTE • ${esc(s.settings.brand_subtitle)}</div>
                    <div class="brand-tagline">"${esc(s.settings.brand_tagline)}"</div>
                  </div>
                </div>
                <div style="background:rgba(24,14,7,0.55);border:1px solid var(--coffee-700);border-radius:14px;padding:14px;font-size:11.5px;line-height:1.65;color:var(--coffee-200);">
                  <strong style="color:var(--white);display:block;margin-bottom:6px;">Privasi &amp; Keamanan Akun:</strong>
                  • Login wajib menggunakan <strong>Akun Google</strong> pribadi masing-masing karyawan.<br/>
                  • Login pertama memerlukan <strong>persetujuan Admin / Super Admin</strong>.<br/>
                  • Setelah disetujui sekali, login berikutnya pada akun Google yang sama akan <strong>langsung masuk otomatis</strong>.<br/>
                  • Bukti foto selfie &amp; lokasi GPS hanya diambil saat transaksi absensi.
                </div>
              </div>
              <div style="font-size:11px;color:var(--coffee-300);margin-top:20px;">
                Zona Waktu Operasional: <strong>${esc(s.settings.operational_timezone)}</strong>
              </div>
            </div>

            <!-- KANAN: LOGIN GOOGLE / KONFIRMASI SUPER ADMIN PERTAMA -->
            <div class="col-7" style="padding:32px;display:flex;flex-direction:column;justify-content:center;">
              ${
                uiState.banner
                  ? `<div style="margin-bottom:16px;padding:12px;border-radius:12px;background:${uiState.banner.ok ? "var(--emerald-50)" : "var(--rose-50)"};color:${uiState.banner.ok ? "var(--emerald-900)" : "var(--rose-800)"};font-size:12px;font-weight:700;">
                      ${esc(uiState.banner.message)}
                    </div>`
                  : ""
              }

              ${
                s.initError
                  ? `<div style="margin-bottom:16px;padding:12px;border-radius:12px;background:var(--rose-50);color:var(--rose-800);font-size:12px;">
                      <strong>Info Sistem:</strong> ${esc(s.initError)}
                    </div>`
                  : ""
              }

              ${
                isFileProto
                  ? `<div style="margin-bottom:16px;padding:12px;border-radius:12px;background:var(--amber-50);border:1px solid #fde68a;color:var(--amber-800);font-size:11.5px;">
                      Gunakan <code>http://localhost:8080</code> (klik 2x <code>Jalankan-Server-Lokal.command</code>) atau domain HTTPS Vercel agar Google OAuth berfungsi.
                    </div>`
                  : ""
              }

              ${
                !isBootstrapDone
                  ? hasGoogleSession
                    ? `<!-- TAHAP 2 BOOTSTRAP: AKUN GOOGLE SUDAH TERVERIFIKASI, KUNCI SEBAGAI SUPER ADMIN PERTAMA -->
                       <span class="badge badge-super" style="align-self:flex-start;margin-bottom:10px;">Inisialisasi Pertama • Satu Super Admin Tunggal</span>
                       <h2 style="font-size:20px;font-weight:800;margin-bottom:6px;">Konfirmasi Akun Super Admin Pertama</h2>
                       <p style="font-size:12.5px;color:var(--stone-600);margin-bottom:16px;">
                         Akun Google Anda telah terverifikasi. Setelah dikunci, akun ini menjadi <strong>satu-satunya Super Admin</strong> di Suka Latte dan proses inisialisasi akan ditutup permanen.
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
                         <button type="submit" id="btn-submit-bootstrap" class="btn btn-primary" style="width:100%;padding:12px;margin-bottom:8px;" data-action="submit-bootstrap">
                           🔒 Tetapkan Sebagai Super Admin &amp; Kunci Sistem
                         </button>
                         <button type="button" class="btn btn-outline" style="width:100%;" data-action="logout">
                           Ganti Akun Google Lain
                         </button>
                       </form>`
                    : `<!-- TAHAP 1 BOOTSTRAP: BELUM ADA SUPER ADMIN -->
                       <span class="badge badge-warning" style="align-self:flex-start;margin-bottom:10px;">Instalasi Baru • Menunggu Super Admin Pertama</span>
                       <h2 style="font-size:21px;font-weight:800;margin-bottom:8px;">Inisialisasi Super Admin Suka Latte</h2>
                       <p style="font-size:12.5px;color:var(--stone-600);margin-bottom:20px;line-height:1.6;">
                         Sistem baru terpasang dan belum memiliki pengelola. Silakan masuk menggunakan <strong>Akun Google Pemilik (Owner)</strong> untuk membentuk akun Super Admin tunggal dan mengunci sistem.
                       </p>
                       <button class="btn-google" data-action="google-login">
                         ${GOOGLE_G_ICON_SVG}
                         <span>Lanjutkan dengan Akun Google (Super Admin Pertama)</span>
                       </button>`
                  : `<!-- LOGIN HARIAN NORMAL: WAJIB AKUN GOOGLE -->
                     <span class="badge badge-success" style="align-self:flex-start;margin-bottom:10px;">Autentikasi Resmi Karyawan</span>
                     <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;">Masuk ke Suka Latte Attendance</h2>
                     <p style="font-size:12.5px;color:var(--stone-600);margin-bottom:22px;line-height:1.6;">
                       Gunakan <strong>Akun Google</strong> Anda untuk masuk. Karyawan yang baru pertama kali login akan menunggu persetujuan Admin satu kali; karyawan yang sudah disetujui akan langsung masuk otomatis.
                     </p>
                     <button class="btn-google" data-action="google-login">
                       ${GOOGLE_G_ICON_SVG}
                       <span>Masuk dengan Akun Google</span>
                     </button>`
              }

              ${
                !isBootstrapDone
                  ? `<div style="margin-top:20px;padding-top:14px;border-top:1px solid var(--coffee-200);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--stone-500);">
                       <span>Server Supabase Terhubung</span>
                       <button style="text-decoration:underline;color:var(--coffee-700);font-weight:700;" data-action="reset-cloud-config">Ubah Koneksi Server</button>
                     </div>`
                  : ""
              }
            </div>
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
            <span class="mono">Titik Outlet: ${Number(outlet.latitude).toFixed(6)}, ${Number(outlet.longitude).toFixed(6)}</span>
            <a href="https://www.openstreetmap.org/?mlat=${outlet.latitude}&mlon=${outlet.longitude}#map=18/${outlet.latitude}/${outlet.longitude}" target="_blank" rel="noreferrer" style="color:var(--coffee-200);">Buka Peta Eksternal ↗</a>
          </div>
        </div>
      </div>
    `;
  }

  function renderAttendanceRecordCard(rec, tz, allowManagerEdit) {
    const s = Core.state;
    const emp =
      s.profiles.find((p) => p.id === rec.employee_id) ||
      (s.currentUser?.id === rec.employee_id ? s.currentUser : null);
    const out = s.outlets.find((o) => o.id === rec.outlet_id);
    const sh = s.shifts.find((x) => x.id === rec.shift_id);

    const inUrl = Core.getSignedPhotoUrl(rec.check_in_photo_path);
    const outUrl = Core.getSignedPhotoUrl(rec.check_out_photo_path);

    return `
      <div class="card-subtle" style="display:flex;flex-direction:column;justify-content:space-between;gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;">
          <div>
            <div style="font-size:13.5px;font-weight:800;">
              ${esc(emp ? emp.full_name : "Karyawan")}
              <span class="mono" style="font-size:11px;color:var(--coffee-700);">(${esc(emp ? emp.employee_code : "-")})</span>
            </div>
            <div style="font-size:11px;color:var(--stone-600);">
              Tanggal Kerja: <strong>${esc(rec.work_date)}</strong> • ${esc(out ? out.name : "-")} • ${esc(sh ? sh.name : "-")}
            </div>
          </div>
          <div style="text-align:right;">
            ${Core.getStatusBadgeHtml(rec.attendance_status)}
            <div class="mono" style="font-size:10px;font-weight:700;color:var(--coffee-700);margin-top:3px;">
              📁 ${esc(rec.archive_folder_label)}
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
                ${
                  inUrl
                    ? `<img src="${esc(inUrl)}" alt="Foto Check In" />`
                    : rec.check_in_photo_path
                    ? `<span style="font-size:11px;color:var(--stone-500);">Memuat Signed URL...</span>`
                    : `<span style="font-size:11px;color:var(--stone-400);">Tidak Ada Foto</span>`
                }
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
                ${
                  outUrl
                    ? `<img src="${esc(outUrl)}" alt="Foto Check Out" />`
                    : rec.check_out_photo_path
                    ? `<span style="font-size:11px;color:var(--stone-500);">Memuat Signed URL...</span>`
                    : `<span style="font-size:11px;color:var(--stone-400);padding:8px;text-align:center;">Menunggu Check Out</span>`
                }
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
          <div style="display:flex;gap:6px;">
            ${
              !allowManagerEdit && Core.state.settings.allow_member_request_corrections
                ? `<button class="btn btn-outline btn-sm" data-action="open-member-corr" data-id="${esc(rec.id)}">Ajukan Koreksi</button>`
                : ""
            }
            ${
              allowManagerEdit
                ? `<button class="btn btn-primary btn-sm" data-action="open-admin-edit-att" data-id="${esc(rec.id)}">✏️ Edit Kehadiran</button>`
                : ""
            }
          </div>
        </div>
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
    const myShift = s.shifts.find((sh) => sh.id === u.shift_id) || s.shifts[0];

    return `
      <div class="hero-banner">
        <div class="grid-12" style="align-items:center;">
          <div class="col-7">
            <span class="badge" style="background:rgba(255,255,255,0.14);color:var(--coffee-200);margin-bottom:8px;">
              ⏱ Jadwal Shift Anda Hari Ini (${esc(parts.dateString)})
            </span>
            <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Selamat Bertugas, ${esc(u.full_name)}</h1>
            <p style="font-size:13px;color:var(--coffee-200);margin-bottom:18px;">
              ID: <strong class="mono">${esc(u.employee_code)}</strong> •
              Outlet: <strong>${esc(myOutlet ? myOutlet.name : "-")}</strong> •
              Shift: <strong>${esc(myShift ? `${myShift.name} (${String(myShift.start_time).slice(0, 5)}–${String(myShift.end_time).slice(0, 5)} WITA)` : "-")}</strong>
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${
                canCheckIn
                  ? `<button class="btn btn-emerald" style="padding:13px 22px;font-size:14px;" data-action="open-camera" data-mode="check_in">
                      📷 Ambil Selfie Baru &amp; Check In Sekarang
                    </button>`
                  : ""
              }
              ${
                canCheckOut
                  ? `<button class="btn btn-amber" style="padding:13px 22px;font-size:14px;" data-action="open-camera" data-mode="check_out">
                      📷 Ambil Selfie Baru &amp; Check Out Sekarang
                    </button>`
                  : ""
              }
              <button class="btn btn-outline" style="background:rgba(255,255,255,0.1);color:var(--cream);border-color:var(--coffee-600);" data-action="nav" data-target="riwayat_saya">
                📋 Cek Riwayat Absensi Saya
              </button>
            </div>
          </div>

          <div class="col-5">
            <div style="background:rgba(20,17,15,0.78);border:1px solid var(--coffee-700);border-radius:16px;padding:16px;font-size:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                <span style="color:var(--coffee-300);font-weight:700;text-transform:uppercase;">Status Hari Ini</span>
                ${myToday ? Core.getStatusBadgeHtml(myToday.attendance_status) : Core.getStatusBadgeHtml("belum_check_in")}
              </div>
              <div class="grid-2" style="gap:10px;margin-bottom:10px;">
                <div style="background:var(--coffee-950);padding:10px;border-radius:10px;border:1px solid var(--coffee-800);">
                  <div style="font-size:10.5px;color:var(--coffee-400);">Check In (Server)</div>
                  <div class="mono" style="font-size:14px;font-weight:800;color:var(--white);">
                    ${myToday?.check_in_at ? Core.formatOperationalDateTime(myToday.check_in_at, tz, false) : "--:--:--"}
                  </div>
                </div>
                <div style="background:var(--coffee-950);padding:10px;border-radius:10px;border:1px solid var(--coffee-800);">
                  <div style="font-size:10.5px;color:var(--coffee-400);">Check Out (Server)</div>
                  <div class="mono" style="font-size:14px;font-weight:800;color:var(--white);">
                    ${myToday?.check_out_at ? Core.formatOperationalDateTime(myToday.check_out_at, tz, false) : "--:--:--"}
                  </div>
                </div>
              </div>
              <div style="font-size:11.5px;color:var(--coffee-300);">
                Durasi Kerja Hari Ini: <strong style="color:var(--white);">${Core.formatDurationMinutes(myToday?.work_duration_minutes)}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-12">
        <div class="col-7">
          ${renderGeofenceMapCard(myOutlet, null)}
        </div>
        <div class="col-5 card" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
          <div>
            <h3 style="font-size:15px;font-weight:800;margin-bottom:6px;">Panduan Absensi Anggota Suka Latte</h3>
            <ul style="font-size:12px;color:var(--stone-600);line-height:1.7;padding-left:18px;">
              <li>Pastikan Anda berada di dalam area radius outlet <strong>${esc(myOutlet ? myOutlet.name : "Suka Latte")}</strong>.</li>
              <li>Izinkan akses <strong>Kamera</strong> dan <strong>Lokasi GPS</strong> pada browser HP Anda.</li>
              <li>Setiap Check In dan Check Out wajib mengambil <strong>foto selfie baru</strong> secara langsung.</li>
              <li>Waktu kehadiran dan durasi kerja dihitung otomatis menggunakan waktu resmi server WITA.</li>
            </ul>
          </div>
          ${
            s.settings.allow_member_request_leaves
              ? `<button class="btn btn-outline" style="width:100%;" data-action="open-member-leave">
                  📅 Ajukan Izin / Sakit / Cuti Pribadi
                </button>`
              : ""
          }
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
        <div style="display:flex;gap:8px;align-items:center;">
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
          ? `<div class="card" style="text-align:center;padding:42px;">
              <div style="font-size:15px;font-weight:800;">Belum Ada Catatan Absensi Pribadi</div>
              <p style="font-size:12px;color:var(--stone-500);margin-top:4px;">Catatan Check In dan Check Out Anda akan otomatis muncul di sini.</p>
            </div>`
          : `<div class="grid-2">
              ${filtered.map((rec) => renderAttendanceRecordCard(rec, tz, false)).join("")}
            </div>`
      }
    `;
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

    return `
      ${
        pendingUsers.length > 0
          ? `<div class="card" style="border:2px solid var(--amber-600);background:var(--amber-50);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
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

      <div class="hero-banner">
        <div class="grid-12" style="align-items:center;">
          <div class="col-7">
            <span class="badge" style="background:rgba(255,255,255,0.14);color:var(--coffee-200);margin-bottom:8px;">
              Dashboard Operasional Pengelola • ${esc(parts.dateString)} (${esc(tz)})
            </span>
            <h1 style="font-size:24px;font-weight:800;margin-bottom:6px;">Halo, ${esc(u.full_name)}</h1>
            <p style="font-size:12.5px;color:var(--coffee-200);margin-bottom:16px;">
              Outlet Aktif: <strong>${esc(myOutlet ? myOutlet.name : "-")}</strong> •
              Shift: <strong>${esc(myShift ? `${myShift.name} (${String(myShift.start_time).slice(0, 5)}–${String(myShift.end_time).slice(0, 5)})` : "-")}</strong>
            </p>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
              ${
                canCheckIn
                  ? `<button class="btn btn-emerald" data-action="open-camera" data-mode="check_in">📷 Check In Pribadi</button>`
                  : canCheckOut
                  ? `<button class="btn btn-amber" data-action="open-camera" data-mode="check_out">📷 Check Out Pribadi</button>`
                  : ""
              }
              <button class="btn btn-outline" style="background:rgba(255,255,255,0.12);color:var(--cream);border-color:var(--coffee-600);" data-action="nav" data-target="control_panel">
                ⚙️ Buka Control Panel &amp; Edit Pengaturan
              </button>
              <button class="btn btn-outline" style="background:rgba(255,255,255,0.08);color:var(--cream);border-color:var(--coffee-700);" data-action="nav" data-target="archive">
                🗂️ Arsip Foto Bulanan (${esc(parts.archiveFolderLabel)})
              </button>
            </div>
          </div>

          <div class="col-5">
            <div style="background:rgba(20,17,15,0.78);border:1px solid var(--coffee-700);border-radius:16px;padding:16px;font-size:12px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <span style="color:var(--coffee-300);font-weight:700;">ABSENSI PRIBADI ANDA HARI INI</span>
                ${myToday ? Core.getStatusBadgeHtml(myToday.attendance_status) : Core.getStatusBadgeHtml("belum_check_in")}
              </div>
              <div class="mono" style="font-size:12.5px;color:var(--white);">
                In: ${myToday?.check_in_at ? Core.formatOperationalDateTime(myToday.check_in_at, tz, false) : "--:--"} •
                Out: ${myToday?.check_out_at ? Core.formatOperationalDateTime(myToday.check_out_at, tz, false) : "--:--"} •
                Durasi: ${Core.formatDurationMinutes(myToday?.work_duration_minutes)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-4">
        <div class="card">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--stone-500);">Karyawan Aktif Disetujui</div>
          <div style="font-size:28px;font-weight:800;margin:4px 0;">${activeEmployees.length}</div>
          <div style="font-size:11px;color:var(--stone-600);">${pendingUsers.length} menunggu persetujuan login pertama</div>
        </div>
        <div class="card" style="border-color:#a7f3d0;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--emerald-800);">Hadir Hari Ini</div>
          <div style="font-size:28px;font-weight:800;color:var(--emerald-900);margin:4px 0;">${presentToday}</div>
          <div style="font-size:11px;color:var(--emerald-700);">Terverifikasi Selfie &amp; GPS</div>
        </div>
        <div class="card" style="border-color:#fde68a;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--amber-800);">Sedang Bertugas (Belum Out)</div>
          <div style="font-size:28px;font-weight:800;color:var(--amber-800);margin:4px 0;">${workingNow}</div>
          <div style="font-size:11px;color:var(--amber-700);">Shift berjalan hari ini</div>
        </div>
        <div class="card" style="border-color:#fed7aa;">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:var(--orange-800);">Terlambat Hari Ini</div>
          <div style="font-size:28px;font-weight:800;color:var(--orange-800);margin:4px 0;">${lateToday}</div>
          <div style="font-size:11px;color:var(--orange-700);">Mengacu waktu server WITA</div>
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
        <div style="display:flex;gap:10px;" class="no-print">
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
                .filter((p) => p.first_login_approved)
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
                          <td>${Core.getStatusBadgeHtml(r.attendance_status)}</td>
                          <td class="no-print">
                            <button class="btn btn-outline btn-sm" data-action="open-admin-edit-att" data-id="${esc(r.id)}">✏️ Edit</button>
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
        <span class="badge" style="background:rgba(255,255,255,0.14);color:var(--coffee-200);margin-bottom:6px;">
          Control Panel Pengelola (${isSuper ? "Super Admin — Akses Penuh" : "Admin Operasional"})
        </span>
        <h2 style="font-size:21px;font-weight:800;">Pusat Kendali &amp; Edit Sistem Langsung (Tanpa VS Code)</h2>
        <p style="font-size:12.5px;color:var(--coffee-200);margin-bottom:16px;">
          Seluruh persetujuan login pertama akun Google, pengeditan profil karyawan, jadwal shift, koordinat GPS outlet, aturan absensi, koreksi kehadiran, hingga branding dapat diedit langsung di sini.
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
    const managedUsers = s.profiles.filter((p) => p.first_login_approved || p.status === "rejected");

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
                  <form class="card-subtle form-approve-first-login" data-userid="${esc(p.id)}">
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
                    <div class="grid-4" style="gap:10px;">
                      <div class="form-group" style="margin:0;">
                        <label class="form-label">ID Karyawan *</label>
                        <input class="form-input mono" name="employee_code" value="SL-0${101 + managedUsers.length + idx}" required />
                      </div>
                      <div class="form-group" style="margin:0;">
                        <label class="form-label">Jabatan / Posisi *</label>
                        <input class="form-input" name="position_title" value="Barista / Crew" required />
                      </div>
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
                    <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
                      <button type="button" class="btn btn-danger btn-sm" data-action="reject-first-login" data-userid="${esc(p.id)}">✕ Tolak Akses</button>
                      <button type="submit" class="btn btn-emerald btn-sm">✓ Setujui Login Pertama &amp; Aktifkan</button>
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
          <form id="form-preapprove-email">
            <div class="form-group">
              <label class="form-label">Alamat Email Google (Gmail) *</label>
              <input type="email" class="form-input" name="email" placeholder="nama.karyawan@gmail.com" required />
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">ID Karyawan *</label>
                <input class="form-input mono" name="employee_code" placeholder="SL-0105" required />
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
            <button type="submit" class="btn btn-primary" style="width:100%;">+ Simpan ke Daftar Pra-Persetujuan</button>
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

        <!-- BAGIAN C: DAFTAR SELURUH KARYAWAN + TOMBOL EDIT PENUH -->
        <div class="col-7 card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px;">
            3. Daftar Karyawan Terdaftar &amp; Edit Penuh (${managedUsers.length} Akun)
          </h3>
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${managedUsers
              .map((emp) => {
                const out = s.outlets.find((o) => o.id === emp.outlet_id);
                const sh = s.shifts.find((x) => x.id === emp.shift_id);
                const canEditThis =
                  Core.isSuperAdmin() ||
                  emp.role === "member" ||
                  emp.id === s.currentUser.id;
                return `
                  <div class="card-subtle" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                      ${renderAvatarHtml(emp)}
                      <div>
                        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                          <strong style="font-size:13.5px;">${esc(emp.full_name)}</strong>
                          <span class="mono" style="font-size:11px;color:var(--coffee-700);">(${esc(emp.employee_code)})</span>
                          <span class="badge ${emp.role === "super_admin" ? "badge-super" : emp.role === "admin" ? "badge-admin" : "badge-member"}">${esc(emp.role.replace("_", " ").toUpperCase())}</span>
                          <span class="badge ${emp.status === "active" ? "badge-success" : "badge-danger"}">${esc(emp.status.toUpperCase())}</span>
                        </div>
                        <div style="font-size:11.5px;color:var(--stone-600);">${esc(emp.position_title)} • ${esc(emp.email)} ${emp.phone ? "• " + esc(emp.phone) : ""}</div>
                        <div style="font-size:11px;color:var(--coffee-800);">Outlet: <strong>${esc(out ? out.name : "-")}</strong> • Shift: <strong>${esc(sh ? sh.name : "-")}</strong></div>
                      </div>
                    </div>
                    ${
                      canEditThis
                        ? `<button class="btn btn-primary btn-sm" data-action="open-edit-employee" data-userid="${esc(emp.id)}">
                            ✏️ Edit Data
                          </button>`
                        : ""
                    }
                  </div>`;
              })
              .join("")}
          </div>
        </div>
      </div>
    `;
  }

  // 7.2 Manajemen Role (Promosi/Demosi Admin Khusus Super Admin)
  function renderCpRoles() {
    const s = Core.state;
    const isSuper = Core.isSuperAdmin();
    const approvedUsers = s.profiles.filter((p) => p.first_login_approved);

    return `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:16px;">
          <div>
            <h3 style="font-size:16px;font-weight:800;">Manajemen Role Pengguna (Super Admin, Admin, Anggota)</h3>
            <p style="font-size:12px;color:var(--stone-600);">
              Sesuai ketentuan PRD: Hanya terdapat <strong>satu Super Admin</strong>, dan hanya Super Admin yang berwenang mempromosikan Anggota menjadi Admin atau menurunkan Admin menjadi Anggota.
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
                      ? `<button class="btn btn-amber btn-sm" style="width:100%;" data-action="open-role-modal" data-userid="${esc(u.id)}" data-newrole="admin">⬆️ Promosikan Menjadi Admin</button>`
                      : `<button class="btn btn-outline btn-sm" style="width:100%;" data-action="open-role-modal" data-userid="${esc(u.id)}" data-newrole="member">⬇️ Turunkan Menjadi Anggota</button>`
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
          <form id="form-save-shift">
            <input type="hidden" name="id" value="${esc(editing ? editing.id : "")}" />
            <div class="form-group">
              <label class="form-label">Nama Shift *</label>
              <input class="form-input" name="name" value="${esc(editing ? editing.name : "")}" placeholder="Contoh: Shift Pagi (Opening)" required />
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Jam Mulai *</label>
                <input type="time" class="form-input mono" name="start_time" value="${esc(editing ? String(editing.start_time).slice(0, 5) : "07:00")}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Jam Selesai *</label>
                <input type="time" class="form-input mono" name="end_time" value="${esc(editing ? String(editing.end_time).slice(0, 5) : "15:00")}" required />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Toleransi Terlambat (Menit)</label>
                <input type="number" class="form-input" name="grace_period_minutes" min="0" max="180" value="${editing ? editing.grace_period_minutes : 10}" required />
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
            <div style="display:flex;gap:8px;">
              <button type="submit" class="btn btn-primary" style="flex:1;">
                ${editing ? "💾 Simpan Perubahan Shift" : "+ Tambah Jadwal Shift"}
              </button>
              ${
                editing
                  ? `<button type="button" class="btn btn-outline" data-action="cancel-edit-shift">Batal</button>`
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
                <button class="btn btn-primary btn-sm" data-action="edit-shift" data-id="${esc(sh.id)}">
                  ✏️ Edit Shift
                </button>
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

          <form id="form-save-outlet">
            <input type="hidden" name="id" value="${esc(editing ? editing.id : "")}" />
            <div class="form-group">
              <label class="form-label">Nama Outlet *</label>
              <input class="form-input" name="name" value="${esc(editing ? editing.name : "")}" placeholder="Contoh: Suka Latte Cabang Utama" required />
            </div>
            <div class="form-group">
              <label class="form-label">Alamat Lengkap *</label>
              <input class="form-input" name="address" value="${esc(editing ? editing.address : "")}" placeholder="Jl. ..." required />
            </div>
            <div style="margin-bottom:10px;">
              <button type="button" class="btn btn-emerald btn-sm" style="width:100%;" data-action="fill-outlet-current-gps">
                📍 Gunakan Koordinat GPS Lokasi Saya Saat Ini
              </button>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Latitude *</label>
                <input class="form-input mono" id="outlet-lat-input" name="latitude" value="${editing ? editing.latitude : -5.147665}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Longitude *</label>
                <input class="form-input mono" id="outlet-lng-input" name="longitude" value="${editing ? editing.longitude : 119.432732}" required />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Radius Geofence (Meter) *</label>
                <input type="number" class="form-input" name="geofence_radius_meters" min="10" max="5000" value="${editing ? editing.geofence_radius_meters : 150}" required />
              </div>
              <div class="form-group">
                <label class="form-label">Batas Akurasi GPS (Meter) *</label>
                <input type="number" class="form-input" name="minimum_gps_accuracy_meters" min="5" max="1000" value="${editing ? editing.minimum_gps_accuracy_meters : 100}" required />
              </div>
            </div>
            <div class="grid-2" style="gap:10px;">
              <div class="form-group">
                <label class="form-label">Zona Waktu Outlet</label>
                <select class="form-select" name="timezone">
                  <option value="Asia/Makassar" ${!editing || editing.timezone === "Asia/Makassar" ? "selected" : ""}>Asia/Makassar (WITA)</option>
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
            <button type="submit" class="btn btn-primary" style="width:100%;">
              💾 ${editing ? "Simpan Perubahan Outlet & Radius GPS" : "Simpan Outlet Baru"}
            </button>
          </form>
        </div>

        <div class="col-7">
          ${renderGeofenceMapCard(
            editing || {
              name: "Pratinjau Outlet Baru",
              address: "Isi alamat dan koordinat di sebelah kiri",
              latitude: -5.147665,
              longitude: 119.432732,
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
        <form id="form-save-rules">
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
              <label style="display:flex;gap:10px;align-items:center;font-size:12.5px;">
                <input type="checkbox" name="allow_member_request_corrections" ${cfg.allow_member_request_corrections ? "checked" : ""} />
                <span>Izinkan Anggota mengajukan koreksi absensi pribadi</span>
              </label>
              <label style="display:flex;gap:10px;align-items:center;font-size:12.5px;">
                <input type="checkbox" name="allow_member_request_leaves" ${cfg.allow_member_request_leaves ? "checked" : ""} />
                <span>Izinkan Anggota mengajukan izin / sakit / cuti dari aplikasi</span>
              </label>
            </div>
          </div>
          <div style="margin-top:16px;display:flex;justify-content:flex-end;">
            <button type="submit" class="btn btn-primary">💾 Simpan Seluruh Aturan Absensi</button>
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
          <form id="form-save-calendar">
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
                  .filter((p) => p.first_login_approved)
                  .map(
                    (p) =>
                      `<option value="${esc(p.id)}" ${editing && editing.employee_id === p.id ? "selected" : ""}>${esc(p.full_name)} (${esc(p.employee_code)})</option>`
                  )
                  .join("")}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Judul Keterangan *</label>
              <input class="form-input" name="title" value="${esc(editing ? editing.title : "")}" placeholder="Contoh: Libur Hari Raya / Izin Kesehatan" required />
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
              <button type="submit" class="btn btn-primary" style="flex:1;">
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
          <form id="form-save-branding">
            <div class="form-group">
              <label class="form-label">Nama Tampilan Utama</label>
              <input class="form-input" name="brand_display_name" value="${esc(cfg.brand_display_name)}" required />
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
            <button type="submit" class="btn btn-primary" style="width:100%;">💾 Simpan Perubahan Branding</button>
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
          <form id="form-save-security">
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
            <button type="submit" class="btn btn-primary" ${!isSuper ? "disabled" : ""}>💾 Simpan Kebijakan Keamanan</button>
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
      </div>
    `;
  }

  window.SukaViews = {
    renderAvatarHtml,
    renderCloudSetupScreen,
    renderGoogleLoginOrBootstrapScreen,
    renderPendingOrBlockedScreen,
    renderGeofenceMapCard,
    renderAttendanceRecordCard,
    renderMemberAttendanceHome,
    renderMemberOwnHistoryView,
    renderManagerDashboardView,
    renderManagerArchiveView,
    renderManagerReportsView,
    renderControlPanelView,
  };
})();
