#!/bin/zsh
# ============================================================================
# SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — Produksi Final)
# Peluncur Server Lokal macOS (1-Klik Tanpa VS Code)
# ============================================================================

cd "$(dirname "$0")" || exit 1

PORT=8080

echo "============================================================"
echo "  SUKA LATTE ATTENDANCE SYSTEM — SERVER LOKAL AKTIF"
echo "  Alamat Akses: http://localhost:${PORT}"
echo "  (Jangan tutup jendela ini selama menggunakan aplikasi)"
echo "============================================================"

# Buka browser otomatis setelah 1 detik
(sleep 1 && open "http://localhost:${PORT}") &

python3 -m http.server "${PORT}"
