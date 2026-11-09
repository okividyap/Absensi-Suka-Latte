#!/bin/zsh
# ============================================================================
# SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — Produksi Final)
# Peluncur Server Lokal macOS (1-Klik Tanpa VS Code)
# ============================================================================

cd "$(dirname "$0")" || exit 1

PORT=8080
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "127.0.0.1")

echo "============================================================"
echo "  ☕ SUKA LATTE ATTENDANCE SYSTEM — SERVER LOKAL AKTIF"
echo "============================================================"
echo "  💻 Akses di Laptop ini : http://localhost:${PORT}"
echo "  📱 Akses dari HP (Wi-Fi): http://${LOCAL_IP}:${PORT}"
echo "------------------------------------------------------------"
echo "  Catatan:"
echo "  - Jangan ketik 'localhost' di HP (ketik alamat IP di atas)."
echo "  - HP & Laptop harus terhubung ke Wi-Fi yang sama."
echo "  - Untuk dipakai absensi nyata semua karyawan di outlet,"
echo "    deploy gratis ke Vercel agar dapat link HTTPS resmi."
echo "============================================================"

# Buka browser otomatis di laptop setelah 1 detik
(sleep 1 && open "http://localhost:${PORT}") &

python3 -m http.server "${PORT}"
