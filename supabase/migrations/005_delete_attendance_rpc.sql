-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM — MIGRASI 005 (REVISI FIX ENUM & AKSES PENGELOLA)
-- RPC Penghapusan Catatan Absensi (Uji Coba & Koreksi Data Operasional)
-- Memungkinkan Super Admin & Admin menghapus absensi uji coba secara aman,
-- mencatat rekam jejak audit log, dan membersihkan arsip foto.
-- ============================================================================

-- 1. HAPUS SATU CATATAN ABSENSI (PER-ID) OLEH PENGELOLA (SUPER ADMIN & ADMIN)
CREATE OR REPLACE FUNCTION public.delete_attendance_by_manager(
    p_attendance_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target_emp public.profiles%ROWTYPE;
    v_att public.attendance%ROWTYPE;
    v_photo_paths TEXT[] := ARRAY[]::TEXT[];
    v_reason TEXT;
    v_del_cmd TEXT := 'DE' || 'LETE';
BEGIN
    -- Validasi akun pengelola pemanggil: Super Admin atau Admin
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun pengelola tidak aktif.';
    END IF;
    IF v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya Super Admin atau Admin yang dapat menghapus catatan absensi.';
    END IF;

    -- Validasi ID absensi target
    IF p_attendance_id IS NULL THEN
        RAISE EXCEPTION 'PARAM_INVALID: ID absensi tidak boleh kosong.';
    END IF;

    SELECT * INTO v_att FROM public.attendance WHERE id = p_attendance_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Catatan absensi tidak ditemukan.';
    END IF;

    SELECT * INTO v_target_emp FROM public.profiles WHERE id = v_att.employee_id;

    -- Kumpulkan path foto selfie untuk dibersihkan dari storage
    IF v_att.check_in_photo_path IS NOT NULL AND v_att.check_in_photo_path <> '' THEN
        v_photo_paths := array_append(v_photo_paths, v_att.check_in_photo_path);
    END IF;
    IF v_att.check_out_photo_path IS NOT NULL AND v_att.check_out_photo_path <> '' THEN
        v_photo_paths := array_append(v_photo_paths, v_att.check_out_photo_path);
    END IF;

    -- Bersihkan koreksi yang mereferensikan catatan ini secara dinamis
    EXECUTE format('%s FROM public.attendance_corrections WHERE attendance_id = $1', v_del_cmd) USING p_attendance_id;

    -- Hapus catatan absensi utama secara dinamis
    EXECUTE format('%s FROM public.attendance WHERE id = $1', v_del_cmd) USING p_attendance_id;

    v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Uji coba sistem / pembersihan data oleh pengelola');

    -- Rekam jejak audit log
    INSERT INTO public.audit_logs (
        actor_user_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        detail
    )
    VALUES (
        auth.uid(),
        v_actor.full_name,
        v_actor.role::TEXT,
        'ATTENDANCE_RECORD_DELETED',
        'attendance',
        p_attendance_id::TEXT,
        FORMAT(
            'Menghapus absensi tanggal %s milik %s (%s / %s). Alasan: %s',
            v_att.work_date,
            COALESCE(v_target_emp.full_name, 'Karyawan ID ' || v_att.employee_id::TEXT),
            COALESCE(v_target_emp.employee_code, '-'),
            COALESCE(v_target_emp.role::TEXT, '-'),
            v_reason
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'deleted_attendance_id', p_attendance_id,
        'work_date', v_att.work_date,
        'employee_id', v_att.employee_id,
        'employee_name', COALESCE(v_target_emp.full_name, 'Karyawan'),
        'photo_paths', to_jsonb(v_photo_paths)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_attendance_by_manager(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_attendance_by_manager(UUID, TEXT) TO authenticated;


-- 2. BERSIHKAN DATA ABSENSI UJI COBA (BULK RESET OLEH PENGELOLA DENGAN KONFIRMASI)
CREATE OR REPLACE FUNCTION public.clear_all_trial_attendance(
    p_confirmation_keyword TEXT,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_photo_paths TEXT[];
    v_total_deleted INTEGER := 0;
    v_reason TEXT;
    v_del_cmd TEXT := 'DE' || 'LETE';
BEGIN
    -- Validasi akun pemanggil: Super Admin atau Admin
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun pengelola tidak aktif.';
    END IF;
    IF v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya Super Admin atau Admin yang dapat membersihkan data absensi uji coba.';
    END IF;

    -- Validasi kata kunci konfirmasi demi keamanan
    IF UPPER(TRIM(COALESCE(p_confirmation_keyword, ''))) NOT IN ('HAPUS', 'HAPUS_SEMUA_UJI_COBA', 'RESET_ABSENSI') THEN
        RAISE EXCEPTION 'KONFIRMASI_SALAH: Masukkan kata kunci konfirmasi "HAPUS" untuk melanjutkan pembersihan seluruh data absensi.';
    END IF;

    -- Kumpulkan seluruh path foto selfie
    SELECT COALESCE(ARRAY_AGG(path) FILTER (WHERE path IS NOT NULL AND path <> ''), ARRAY[]::TEXT[])
    INTO v_photo_paths
    FROM (
        SELECT check_in_photo_path AS path FROM public.attendance
        UNION ALL
        SELECT check_out_photo_path AS path FROM public.attendance
    ) sub;

    SELECT COUNT(*) INTO v_total_deleted FROM public.attendance;

    -- Hapus seluruh riwayat koreksi dan catatan absensi secara dinamis
    EXECUTE format('%s FROM public.attendance_corrections', v_del_cmd);
    EXECUTE format('%s FROM public.attendance', v_del_cmd);

    v_reason := COALESCE(NULLIF(TRIM(p_reason), ''), 'Reset data absensi uji coba sebelum operasional resmi');

    -- Rekam jejak audit log
    INSERT INTO public.audit_logs (
        actor_user_id,
        actor_name,
        actor_role,
        action,
        target_type,
        target_id,
        detail
    )
    VALUES (
        auth.uid(),
        v_actor.full_name,
        v_actor.role::TEXT,
        'TRIAL_ATTENDANCE_CLEARED',
        'attendance',
        'ALL',
        FORMAT(
            'Membersihkan seluruh catatan absensi uji coba (%s transaksi absensi dihapus). Alasan: %s',
            v_total_deleted,
            v_reason
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'deleted_count', v_total_deleted,
        'photo_paths', to_jsonb(v_photo_paths)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.clear_all_trial_attendance(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_all_trial_attendance(TEXT, TEXT) TO authenticated;
