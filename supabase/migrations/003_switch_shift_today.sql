-- Migration 003: switch_my_today_attendance_shift
-- Mengizinkan karyawan dan pengelola untuk mengalihkan shift kerja hari ini
-- secara aman, otomatis menghitung ulang keterlambatan sesuai jam masuk aktual di WITA.

CREATE OR REPLACE FUNCTION public.switch_my_today_attendance_shift(
    p_new_shift_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user public.profiles%ROWTYPE;
    v_new_shift public.work_shifts%ROWTYPE;
    v_outlet public.outlets%ROWTYPE;
    v_cfg JSONB;
    v_tz TEXT;
    v_today_str DATE;
    v_att public.attendance%ROWTYPE;
    v_checkin_local TIMESTAMP;
    v_shift_start_local TIMESTAMP;
    v_grace_local TIMESTAMP;
    v_diff_seconds DOUBLE PRECISION;
    v_new_late_minutes INTEGER := 0;
    v_new_status public.attendance_record_status;
BEGIN
    SELECT * INTO v_user FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Akun Anda tidak aktif atau belum disetujui.';
    END IF;

    SELECT * INTO v_new_shift FROM public.work_shifts
    WHERE id = p_new_shift_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_SHIFT: Shift yang dipilih tidak ditemukan atau sedang tidak aktif.';
    END IF;

    SELECT * INTO v_outlet FROM public.outlets WHERE id = COALESCE(v_user.outlet_id, (SELECT id FROM public.outlets LIMIT 1));
    SELECT value INTO v_cfg FROM public.system_settings WHERE key = 'operational_config';
    v_tz := COALESCE(NULLIF(v_outlet.timezone, ''), v_cfg->>'operational_timezone', 'Asia/Makassar');

    -- Tanggal operasional server hari ini di WITA
    v_today_str := (CURRENT_TIMESTAMP AT TIME ZONE v_tz)::DATE;

    -- 1. Update profil karyawan ke shift baru
    UPDATE public.profiles
    SET shift_id = v_new_shift.id,
        updated_at = NOW()
    WHERE id = v_user.id;

    -- 2. Update jadwal kerja hari ini jika ada
    UPDATE public.work_schedules
    SET shift_id = v_new_shift.id,
        updated_at = NOW()
    WHERE employee_id = v_user.id AND schedule_date = v_today_str;

    -- 3. Periksa apakah sudah ada transaksi absensi hari ini
    SELECT * INTO v_att FROM public.attendance
    WHERE employee_id = v_user.id AND work_date = v_today_str
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND AND v_att.check_in_at IS NOT NULL THEN
        -- Hitung ulang keterlambatan berdasarkan jam check_in_at asli di WITA vs jam mulai shift baru
        v_checkin_local := (v_att.check_in_at AT TIME ZONE v_tz);
        v_shift_start_local := (v_today_str::TEXT || ' ' || v_new_shift.start_time::TEXT)::TIMESTAMP;
        v_grace_local := v_shift_start_local + (COALESCE(v_new_shift.grace_period_minutes, 15) || ' minutes')::INTERVAL;

        IF v_checkin_local <= v_grace_local THEN
            v_new_late_minutes := 0;
            IF v_att.check_out_at IS NOT NULL THEN
                v_new_status := 'selesai';
            ELSE
                v_new_status := 'hadir';
            END IF;
        ELSE
            v_diff_seconds := EXTRACT(EPOCH FROM (v_checkin_local - v_shift_start_local));
            v_new_late_minutes := GREATEST(0, ROUND(v_diff_seconds / 60.0)::INTEGER);
            v_new_status := 'terlambat';
        END IF;

        UPDATE public.attendance
        SET shift_id = v_new_shift.id,
            late_minutes = v_new_late_minutes,
            attendance_status = v_new_status,
            updated_at = NOW()
        WHERE id = v_att.id;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (
            v_user.id,
            v_user.full_name,
            v_user.role::TEXT,
            'SHIFT_SWITCHED_TODAY',
            'attendance',
            v_att.id::TEXT,
            'Mengalihkan shift absensi hari ini ke ' || v_new_shift.name || ' (' || to_char(v_new_shift.start_time, 'HH24:MI') || '-' || to_char(v_new_shift.end_time, 'HH24:MI') || '). Keterlambatan disesuaikan menjadi ' || v_new_late_minutes || ' menit (Status: ' || v_new_status::TEXT || ').'
        );

        RETURN jsonb_build_object(
            'ok', true,
            'attendance_id', v_att.id,
            'shift_id', v_new_shift.id,
            'shift_name', v_new_shift.name,
            'late_minutes', v_new_late_minutes,
            'status', v_new_status::TEXT,
            'has_attendance', true
        );
    ELSE
        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (
            v_user.id,
            v_user.full_name,
            v_user.role::TEXT,
            'SHIFT_SELF_SELECTED',
            'profiles',
            v_user.id::TEXT,
            'Memilih shift aktif hari ini: ' || v_new_shift.name || ' (' || to_char(v_new_shift.start_time, 'HH24:MI') || '-' || to_char(v_new_shift.end_time, 'HH24:MI') || ').'
        );

        RETURN jsonb_build_object(
            'ok', true,
            'shift_id', v_new_shift.id,
            'shift_name', v_new_shift.name,
            'late_minutes', 0,
            'has_attendance', false
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.switch_my_today_attendance_shift(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_my_today_attendance_shift(UUID) TO authenticated;
