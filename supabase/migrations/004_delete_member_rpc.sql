-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM — MIGRASI 004
-- RPC Penghapusan Member / Karyawan Resign secara aman & menyeluruh
-- (Membersihkan data absensi, izin/cuti, pra-persetujuan, profil & auth.users)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.delete_member_by_manager(
    p_target_user_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
    v_photo_paths TEXT[];
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun pengelola tidak aktif.';
    END IF;
    IF v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya Super Admin atau Admin yang dapat menghapus member.';
    END IF;

    IF p_target_user_id IS NULL OR p_target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'AKSI_DITOLAK: Anda tidak dapat menghapus akun Anda sendiri.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Profil member/karyawan tidak ditemukan.';
    END IF;

    IF v_target.role = 'super_admin' OR EXISTS (
        SELECT 1 FROM public.system_bootstrap_lock WHERE super_admin_user_id = p_target_user_id
    ) THEN
        RAISE EXCEPTION 'AKSI_DITOLAK: Akun Super Admin utama tidak boleh dihapus.';
    END IF;

    IF v_actor.role = 'admin' AND v_target.role <> 'member' THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Admin hanya dapat menghapus Anggota (Member).';
    END IF;

    SELECT COALESCE(ARRAY_AGG(path) FILTER (WHERE path IS NOT NULL AND path <> ''), ARRAY[]::TEXT[])
    INTO v_photo_paths
    FROM (
        SELECT check_in_photo_path AS path FROM public.attendance WHERE employee_id = p_target_user_id
        UNION ALL
        SELECT check_out_photo_path AS path FROM public.attendance WHERE employee_id = p_target_user_id
    ) sub;

    DELETE FROM public.attendance_corrections
    WHERE employee_id = p_target_user_id OR requested_by = p_target_user_id;

    UPDATE public.attendance_corrections SET reviewed_by = NULL WHERE reviewed_by = p_target_user_id;
    UPDATE public.holidays_and_leaves SET approved_by = NULL WHERE approved_by = p_target_user_id;
    DELETE FROM public.holidays_and_leaves WHERE employee_id = p_target_user_id;

    DELETE FROM public.attendance WHERE employee_id = p_target_user_id;

    DELETE FROM public.preapproved_emails
    WHERE claimed_by = p_target_user_id OR LOWER(email) = LOWER(v_target.email);
    UPDATE public.preapproved_emails SET created_by = NULL WHERE created_by = p_target_user_id;

    UPDATE public.profiles SET approved_by = NULL WHERE approved_by = p_target_user_id;
    UPDATE public.system_settings SET updated_by = NULL WHERE updated_by = p_target_user_id;
    UPDATE public.audit_logs SET actor_user_id = NULL WHERE actor_user_id = p_target_user_id;

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
        v_actor.role,
        'EMPLOYEE_DELETED_RESIGNED',
        'profiles',
        p_target_user_id::TEXT,
        FORMAT(
            'Menghapus akun member resign %s (%s / %s, role %s). Alasan: %s',
            v_target.full_name,
            v_target.employee_code,
            v_target.email,
            v_target.role,
            COALESCE(NULLIF(TRIM(p_reason), ''), 'Karyawan resign / dihapus permanen oleh pengelola')
        )
    );

    DELETE FROM public.profiles WHERE id = p_target_user_id;
    DELETE FROM auth.users WHERE id = p_target_user_id;

    RETURN jsonb_build_object(
        'ok', true,
        'deleted_user_id', p_target_user_id,
        'deleted_name', v_target.full_name,
        'deleted_email', v_target.email,
        'photo_paths', to_jsonb(v_photo_paths)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_member_by_manager(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_member_by_manager(UUID, TEXT) TO authenticated;
