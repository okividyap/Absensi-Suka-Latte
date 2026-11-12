-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM — Migration 002
-- Shift Self-Selection, Terlambat > 15 Menit Output, Bali Outlet Coordinates,
-- Strict Member Attendance-Only Policy, & Function Search-Path Hardening
-- ============================================================================

-- 1. Kebijakan pengaman untuk tabel internal suka_latte_state jika ada
DO $$
BEGIN
    IF to_regclass('public.suka_latte_state') IS NOT NULL THEN
        EXECUTE 'CREATE POLICY "suka_latte_state_managers_only" ON public.suka_latte_state FOR ALL USING (public.get_current_user_role() IN (''super_admin'', ''admin'')) WITH CHECK (public.get_current_user_role() IN (''super_admin'', ''admin''))';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- 2. RPC Baru: Izinkan karyawan aktif memilih Shift Kerja aktifnya sendiri (Pagi/Siang)
CREATE OR REPLACE FUNCTION public.set_my_active_shift(p_shift_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user public.profiles%ROWTYPE;
    v_shift public.work_shifts%ROWTYPE;
BEGIN
    SELECT * INTO v_user FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Akun Anda belum disetujui atau sedang tidak aktif.';
    END IF;

    SELECT * INTO v_shift FROM public.work_shifts
    WHERE id = p_shift_id AND status = 'active';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_SHIFT: Jadwal shift yang dipilih tidak ditemukan atau tidak aktif.';
    END IF;

    IF v_user.shift_id IS DISTINCT FROM v_shift.id THEN
        UPDATE public.profiles
        SET shift_id = v_shift.id,
            updated_at = NOW()
        WHERE id = v_user.id;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (
            v_user.id,
            v_user.full_name,
            v_user.role::TEXT,
            'SHIFT_SELF_SELECTED',
            'profiles',
            v_user.id::TEXT,
            'Memilih shift kerja aktif: ' || v_shift.name || ' (' || to_char(v_shift.start_time, 'HH24:MI') || '-' || to_char(v_shift.end_time, 'HH24:MI') || ').'
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'shift_id', v_shift.id,
        'shift_name', v_shift.name,
        'start_time', v_shift.start_time,
        'end_time', v_shift.end_time,
        'grace_period_minutes', v_shift.grace_period_minutes
    );
END;
$$;

-- 3. Perbarui submit_server_check_in (pertahankan signature 6-arg + tambah output shift & keterlambatan)
CREATE OR REPLACE FUNCTION public.submit_server_check_in(
    p_idempotency_key TEXT,
    p_photo_path TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION,
    p_device_timestamp TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user public.profiles%ROWTYPE;
    v_outlet public.outlets%ROWTYPE;
    v_shift public.work_shifts%ROWTYPE;
    v_cfg JSONB;
    v_tz TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_local_ts TIMESTAMP;
    v_work_date DATE;
    v_year INTEGER;
    v_month INTEGER;
    v_period_key TEXT;
    v_folder_label TEXT;
    v_dist DOUBLE PRECISION := NULL;
    v_loc_status public.location_validation_status := 'valid_in_radius';
    v_require_photo BOOLEAN;
    v_require_gps BOOLEAN;
    v_strict_geo BOOLEAN;
    v_skew_limit INTEGER;
    v_skew_sec INTEGER := 0;
    v_curr_mins INTEGER;
    v_start_mins INTEGER;
    v_end_mins INTEGER;
    v_diff_mins INTEGER;
    v_grace_mins INTEGER := 15;
    v_late_mins INTEGER := 0;
    v_att_status public.attendance_record_status := 'sudah_check_in_belum_check_out';
    v_anomalies TEXT[] := ARRAY[]::TEXT[];
    v_new_id UUID;
    v_month_names CONSTANT TEXT[] := ARRAY[
        'January','February','March','April','May','June',
        'July','August','September','October','November','December'
    ];
BEGIN
    SELECT * INTO v_user FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Akun Anda belum disetujui atau sedang tidak aktif.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.attendance WHERE idempotency_key = p_idempotency_key) THEN
        RAISE EXCEPTION 'DUPLICATE_REQUEST: Permintaan Check In ini sudah diproses sebelumnya.';
    END IF;

    SELECT value INTO v_cfg FROM public.system_settings WHERE key = 'operational_config';
    v_require_photo := COALESCE((v_cfg->>'require_selfie_photo')::BOOLEAN, TRUE);
    v_require_gps := COALESCE((v_cfg->>'require_gps_validation')::BOOLEAN, TRUE);
    v_strict_geo := COALESCE((v_cfg->>'strict_geofence_enforcement')::BOOLEAN, TRUE);
    v_skew_limit := COALESCE((v_cfg->>'clock_skew_warning_threshold_seconds')::INTEGER, 120);

    IF v_require_photo AND btrim(COALESCE(p_photo_path, '')) = '' THEN
        RAISE EXCEPTION 'PHOTO_REQUIRED: Foto selfie baru dari kamera wajib disertakan untuk Check In.';
    END IF;

    SELECT * INTO v_outlet FROM public.outlets WHERE id = v_user.outlet_id AND status = 'active';
    IF NOT FOUND THEN
        SELECT * INTO v_outlet FROM public.outlets WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
    END IF;

    SELECT * INTO v_shift FROM public.work_shifts WHERE id = v_user.shift_id AND status = 'active';
    IF NOT FOUND THEN
        SELECT * INTO v_shift FROM public.work_shifts WHERE status = 'active' ORDER BY start_time ASC, created_at ASC LIMIT 1;
    END IF;

    IF v_outlet.id IS NULL OR v_shift.id IS NULL THEN
        RAISE EXCEPTION 'CONFIG_MISSING: Outlet atau Jadwal Shift belum ditetapkan. Hubungi Admin.';
    END IF;

    v_tz := COALESCE(NULLIF(v_outlet.timezone, ''), v_cfg->>'operational_timezone', 'Asia/Makassar');
    v_local_ts := v_now AT TIME ZONE v_tz;
    v_work_date := v_local_ts::DATE;

    -- Evaluasi jam shift & lintas tengah malam
    v_curr_mins := EXTRACT(HOUR FROM v_local_ts)::INTEGER * 60 + EXTRACT(MINUTE FROM v_local_ts)::INTEGER;
    v_start_mins := EXTRACT(HOUR FROM v_shift.start_time)::INTEGER * 60 + EXTRACT(MINUTE FROM v_shift.start_time)::INTEGER;
    v_end_mins := EXTRACT(HOUR FROM v_shift.end_time)::INTEGER * 60 + EXTRACT(MINUTE FROM v_shift.end_time)::INTEGER;
    v_diff_mins := v_curr_mins - v_start_mins;

    IF v_shift.crosses_midnight AND v_curr_mins < v_end_mins THEN
        v_work_date := (v_local_ts - INTERVAL '1 day')::DATE;
        v_diff_mins := v_curr_mins + 1440 - v_start_mins;
    END IF;

    -- Cek duplikasi Check In pada tanggal kerja & shift yang sama
    IF EXISTS (
        SELECT 1 FROM public.attendance
        WHERE employee_id = v_user.id AND work_date = v_work_date AND shift_id = v_shift.id
    ) THEN
        RAISE EXCEPTION 'ALREADY_CHECKED_IN: Anda sudah melakukan Check In untuk % pada tanggal kerja %.', v_shift.name, v_work_date;
    END IF;

    -- Validasi Lokasi GPS terhadap titik Outlet
    IF p_latitude IS NULL OR p_longitude IS NULL OR p_accuracy IS NULL THEN
        IF v_require_gps THEN
            RAISE EXCEPTION 'GPS_REQUIRED: Koordinat GPS wajib diaktifkan pada perangkat Anda saat melakukan absensi.';
        ELSE
            v_loc_status := 'bypassed_by_policy';
        END IF;
    ELSE
        v_dist := public.calculate_haversine_meters(p_latitude, p_longitude, v_outlet.latitude, v_outlet.longitude);
        IF p_accuracy > v_outlet.minimum_gps_accuracy_meters THEN
            v_loc_status := 'low_accuracy';
            IF v_strict_geo THEN
                RAISE EXCEPTION 'LOW_GPS_ACCURACY: Akurasi GPS perangkat (±%m) melebihi batas akurasi outlet (±%m). Pastikan sinyal GPS stabil.', round(p_accuracy), v_outlet.minimum_gps_accuracy_meters;
            END IF;
            v_anomalies := array_append(v_anomalies, 'Akurasi GPS rendah (±' || round(p_accuracy) || 'm)');
        ELSIF v_dist > v_outlet.geofence_radius_meters THEN
            v_loc_status := 'outside_radius';
            IF v_strict_geo THEN
                RAISE EXCEPTION 'OUTSIDE_GEOFENCE: Lokasi Anda berjarak %m dari % (Maksimal radius %m).', v_dist, v_outlet.name, v_outlet.geofence_radius_meters;
            END IF;
            v_anomalies := array_append(v_anomalies, 'Di luar radius outlet (' || v_dist || 'm)');
        ELSE
            v_loc_status := 'valid_in_radius';
        END IF;
    END IF;

    -- Evaluasi keterlambatan (> 15 menit sesuai toleransi shift)
    v_grace_mins := COALESCE(v_shift.grace_period_minutes, 15);
    IF v_diff_mins > v_grace_mins THEN
        v_late_mins := v_diff_mins;
        v_att_status := 'terlambat';
        v_anomalies := array_append(v_anomalies, 'Terlambat ' || v_late_mins || ' menit (' || v_shift.name || ')');
    END IF;

    -- Selisih Jam Perangkat
    IF p_device_timestamp IS NOT NULL THEN
        v_skew_sec := abs(EXTRACT(EPOCH FROM (v_now - p_device_timestamp)))::INTEGER;
        IF v_skew_sec > v_skew_limit THEN
            v_anomalies := array_append(v_anomalies, 'Selisih jam perangkat ' || v_skew_sec || ' detik dari waktu server');
        END IF;
    END IF;

    -- Penentuan Periode Arsip Foto Bulanan Otomatis berdasarkan Waktu Server
    v_year := EXTRACT(YEAR FROM v_local_ts)::INTEGER;
    v_month := EXTRACT(MONTH FROM v_local_ts)::INTEGER;
    v_period_key := v_year::TEXT || '-' || lpad(v_month::TEXT, 2, '0');
    v_folder_label := v_year::TEXT || '/' || lpad(v_month::TEXT, 2, '0') || '-' || v_month_names[v_month];

    INSERT INTO public.attendance (
        idempotency_key, employee_id, shift_id, outlet_id, work_date,
        archive_year, archive_month, archive_period_key, archive_folder_label,
        check_in_at, check_in_device_at, check_in_clock_skew_seconds,
        check_in_latitude, check_in_longitude, check_in_accuracy, check_in_distance_meters,
        check_in_photo_path, check_in_location_status,
        late_minutes, attendance_status, anomaly_notes
    ) VALUES (
        p_idempotency_key, v_user.id, v_shift.id, v_outlet.id, v_work_date,
        v_year, v_month, v_period_key, v_folder_label,
        v_now, p_device_timestamp, v_skew_sec,
        p_latitude, p_longitude, p_accuracy, v_dist,
        p_photo_path, v_loc_status,
        v_late_mins, v_att_status,
        CASE WHEN array_length(v_anomalies, 1) > 0 THEN array_to_string(v_anomalies, ' • ') ELSE NULL END
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (
        v_user.id,
        v_user.full_name,
        v_user.role::TEXT,
        'ATTENDANCE_CHECK_IN',
        'attendance',
        v_new_id::TEXT,
        'Check In ' || v_shift.name || ' (' ||
        CASE WHEN v_late_mins > 0 THEN 'Terlambat ' || v_late_mins || ' menit' ELSE 'Hadir Tepat Waktu' END ||
        ', ' || COALESCE(v_dist::TEXT, '0') || 'm dari ' || v_outlet.name || ') ke arsip ' || v_folder_label
    );

    RETURN jsonb_build_object(
        'ok', true,
        'attendance_id', v_new_id,
        'server_time', v_now,
        'archive_folder', v_folder_label,
        'shift_id', v_shift.id,
        'shift_name', v_shift.name,
        'attendance_status', v_att_status,
        'late_minutes', v_late_mins,
        'is_late', (v_late_mins > 0),
        'status_label', CASE WHEN v_late_mins > 0 THEN 'Terlambat ' || v_late_mins || ' menit' ELSE 'Hadir Tepat Waktu' END
    );
END;
$$;

-- 3b. Wrapper Check In atomik dengan pemilihan Shift Kerja secara langsung
CREATE OR REPLACE FUNCTION public.submit_server_check_in_with_shift(
    p_idempotency_key TEXT,
    p_photo_path TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION,
    p_device_timestamp TIMESTAMPTZ,
    p_shift_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_shift_id IS NOT NULL THEN
        PERFORM public.set_my_active_shift(p_shift_id);
    END IF;
    RETURN public.submit_server_check_in(
        p_idempotency_key,
        p_photo_path,
        p_latitude,
        p_longitude,
        p_accuracy,
        p_device_timestamp
    );
END;
$$;

-- 4. Perbarui submit_server_check_out agar mengembalikan metadata shift + status & search_path aman
CREATE OR REPLACE FUNCTION public.submit_server_check_out(
    p_photo_path TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION,
    p_device_timestamp TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user public.profiles%ROWTYPE;
    v_att public.attendance%ROWTYPE;
    v_outlet public.outlets%ROWTYPE;
    v_shift public.work_shifts%ROWTYPE;
    v_cfg JSONB;
    v_tz TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_local_ts TIMESTAMP;
    v_dist DOUBLE PRECISION := NULL;
    v_loc_status public.location_validation_status := 'valid_in_radius';
    v_require_photo BOOLEAN;
    v_require_gps BOOLEAN;
    v_strict_geo BOOLEAN;
    v_skew_sec INTEGER := 0;
    v_dur_mins INTEGER := 0;
    v_early_mins INTEGER := 0;
    v_start_mins INTEGER;
    v_end_mins INTEGER;
    v_out_mins INTEGER;
    v_final_status public.attendance_record_status := 'selesai';
BEGIN
    SELECT * INTO v_user FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Akun Anda belum disetujui atau tidak aktif.';
    END IF;

    SELECT * INTO v_att FROM public.attendance
    WHERE employee_id = v_user.id AND check_in_at IS NOT NULL AND check_out_at IS NULL
    ORDER BY check_in_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_CHECK_IN: Tidak ada Check In aktif yang belum di-Check Out. Silakan lakukan Check In terlebih dahulu.';
    END IF;

    SELECT value INTO v_cfg FROM public.system_settings WHERE key = 'operational_config';
    v_require_photo := COALESCE((v_cfg->>'require_selfie_photo')::BOOLEAN, TRUE);
    v_require_gps := COALESCE((v_cfg->>'require_gps_validation')::BOOLEAN, TRUE);
    v_strict_geo := COALESCE((v_cfg->>'strict_geofence_enforcement')::BOOLEAN, TRUE);

    IF v_require_photo AND (btrim(COALESCE(p_photo_path, '')) = '' OR p_photo_path = v_att.check_in_photo_path) THEN
        RAISE EXCEPTION 'PHOTO_REQUIRED: Foto selfie baru wajib diambil untuk Check Out (tidak boleh memakai ulang foto Check In).';
    END IF;

    SELECT * INTO v_outlet FROM public.outlets WHERE id = v_att.outlet_id;
    SELECT * INTO v_shift FROM public.work_shifts WHERE id = v_att.shift_id;

    IF p_latitude IS NULL OR p_longitude IS NULL OR p_accuracy IS NULL THEN
        IF v_require_gps THEN
            RAISE EXCEPTION 'GPS_REQUIRED: Koordinat GPS wajib tersedia saat Check Out.';
        ELSE
            v_loc_status := 'bypassed_by_policy';
        END IF;
    ELSE
        v_dist := public.calculate_haversine_meters(p_latitude, p_longitude, v_outlet.latitude, v_outlet.longitude);
        IF p_accuracy > v_outlet.minimum_gps_accuracy_meters THEN
            v_loc_status := 'low_accuracy';
            IF v_strict_geo THEN
                RAISE EXCEPTION 'LOW_GPS_ACCURACY: Akurasi GPS perangkat (±%m) tidak memenuhi batas outlet (±%m).', round(p_accuracy), v_outlet.minimum_gps_accuracy_meters;
            END IF;
        ELSIF v_dist > v_outlet.geofence_radius_meters THEN
            v_loc_status := 'outside_radius';
            IF v_strict_geo THEN
                RAISE EXCEPTION 'OUTSIDE_GEOFENCE: Lokasi Check Out berjarak %m dari % (Maksimal %m).', v_dist, v_outlet.name, v_outlet.geofence_radius_meters;
            END IF;
        ELSE
            v_loc_status := 'valid_in_radius';
        END IF;
    END IF;

    v_dur_mins := GREATEST(0, round(EXTRACT(EPOCH FROM (v_now - v_att.check_in_at)) / 60.0)::INTEGER);

    v_tz := COALESCE(NULLIF(v_outlet.timezone, ''), v_cfg->>'operational_timezone', 'Asia/Makassar');
    v_local_ts := v_now AT TIME ZONE v_tz;

    v_start_mins := EXTRACT(HOUR FROM v_shift.start_time)::INTEGER * 60 + EXTRACT(MINUTE FROM v_shift.start_time)::INTEGER;
    v_end_mins := EXTRACT(HOUR FROM v_shift.end_time)::INTEGER * 60 + EXTRACT(MINUTE FROM v_shift.end_time)::INTEGER;
    IF v_shift.crosses_midnight OR v_end_mins <= v_start_mins THEN
        v_end_mins := v_end_mins + 1440;
    END IF;

    v_out_mins := EXTRACT(HOUR FROM v_local_ts)::INTEGER * 60 + EXTRACT(MINUTE FROM v_local_ts)::INTEGER;
    IF v_shift.crosses_midnight AND v_out_mins < v_start_mins THEN
        v_out_mins := v_out_mins + 1440;
    END IF;

    IF (v_end_mins - v_out_mins) > v_shift.early_checkout_threshold_minutes THEN
        v_early_mins := v_end_mins - v_out_mins;
        v_final_status := 'pulang_cepat';
    ELSIF v_att.late_minutes > 0 THEN
        v_final_status := 'terlambat';
    ELSE
        v_final_status := 'selesai';
    END IF;

    IF p_device_timestamp IS NOT NULL THEN
        v_skew_sec := abs(EXTRACT(EPOCH FROM (v_now - p_device_timestamp)))::INTEGER;
    END IF;

    UPDATE public.attendance
    SET check_out_at = v_now,
        check_out_device_at = p_device_timestamp,
        check_out_clock_skew_seconds = v_skew_sec,
        check_out_latitude = p_latitude,
        check_out_longitude = p_longitude,
        check_out_accuracy = p_accuracy,
        check_out_distance_meters = v_dist,
        check_out_photo_path = p_photo_path,
        check_out_location_status = v_loc_status,
        work_duration_minutes = v_dur_mins,
        early_leave_minutes = v_early_mins,
        attendance_status = v_final_status,
        updated_at = NOW()
    WHERE id = v_att.id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (
        v_user.id,
        v_user.full_name,
        v_user.role::TEXT,
        'ATTENDANCE_CHECK_OUT',
        'attendance',
        v_att.id::TEXT,
        'Check Out ' || COALESCE(v_shift.name, 'Shift') || ' berhasil. Durasi kerja: ' || v_dur_mins || ' menit.'
    );

    RETURN jsonb_build_object(
        'ok', true,
        'attendance_id', v_att.id,
        'server_time', v_now,
        'shift_id', v_shift.id,
        'shift_name', v_shift.name,
        'duration_minutes', v_dur_mins,
        'late_minutes', v_att.late_minutes,
        'early_leave_minutes', v_early_mins,
        'status', v_final_status,
        'status_label', CASE
            WHEN v_final_status = 'pulang_cepat' THEN 'Pulang Cepat ' || v_early_mins || ' menit'
            WHEN v_att.late_minutes > 0 THEN 'Terlambat ' || v_att.late_minutes || ' menit'
            ELSE 'Selesai (Lengkap)'
        END
    );
END;
$$;

-- 5. RPC admin_direct_edit_attendance_v2 mendukung edit shift + recompute late_minutes
CREATE OR REPLACE FUNCTION public.admin_direct_edit_attendance_v2(
    p_attendance_id UUID,
    p_check_in_at TIMESTAMPTZ,
    p_check_out_at TIMESTAMPTZ,
    p_status public.attendance_record_status,
    p_reason TEXT,
    p_shift_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_att public.attendance%ROWTYPE;
    v_shift public.work_shifts%ROWTYPE;
    v_outlet public.outlets%ROWTYPE;
    v_cfg JSONB;
    v_tz TEXT;
    v_target_shift_id UUID;
    v_eff_in TIMESTAMPTZ;
    v_local_in TIMESTAMP;
    v_curr_mins INTEGER;
    v_start_mins INTEGER;
    v_end_mins INTEGER;
    v_diff_mins INTEGER;
    v_late_mins INTEGER := 0;
BEGIN
    SELECT * INTO v_actor FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND OR v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Super Admin dan Admin yang dapat mengedit catatan kehadiran.';
    END IF;

    IF btrim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'REASON_REQUIRED: Alasan pengeditan absensi wajib diisi untuk Audit Log.';
    END IF;

    SELECT * INTO v_att FROM public.attendance WHERE id = p_attendance_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Catatan absensi tidak ditemukan.';
    END IF;

    v_target_shift_id := COALESCE(p_shift_id, v_att.shift_id);
    SELECT * INTO v_shift FROM public.work_shifts WHERE id = v_target_shift_id;
    IF p_shift_id IS NOT NULL AND NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_SHIFT: Jadwal shift tujuan tidak ditemukan.';
    END IF;

    SELECT * INTO v_outlet FROM public.outlets WHERE id = v_att.outlet_id;
    SELECT value INTO v_cfg FROM public.system_settings WHERE key = 'operational_config';
    v_tz := COALESCE(NULLIF(v_outlet.timezone, ''), v_cfg->>'operational_timezone', 'Asia/Makassar');
    v_eff_in := COALESCE(p_check_in_at, v_att.check_in_at);

    IF p_status IN ('selesai', 'hadir', 'belum_check_in', 'tidak_hadir', 'izin', 'sakit', 'cuti') THEN
        v_late_mins := 0;
    ELSIF v_eff_in IS NOT NULL AND v_shift.id IS NOT NULL THEN
        v_local_in := v_eff_in AT TIME ZONE v_tz;
        v_curr_mins := EXTRACT(HOUR FROM v_local_in)::INTEGER * 60 + EXTRACT(MINUTE FROM v_local_in)::INTEGER;
        v_start_mins := EXTRACT(HOUR FROM v_shift.start_time)::INTEGER * 60 + EXTRACT(MINUTE FROM v_shift.start_time)::INTEGER;
        v_end_mins := EXTRACT(HOUR FROM v_shift.end_time)::INTEGER * 60 + EXTRACT(MINUTE FROM v_shift.end_time)::INTEGER;
        v_diff_mins := v_curr_mins - v_start_mins;
        IF v_shift.crosses_midnight AND v_curr_mins < v_end_mins THEN
            v_diff_mins := v_curr_mins + 1440 - v_start_mins;
        END IF;
        IF v_diff_mins > COALESCE(v_shift.grace_period_minutes, 15) THEN
            v_late_mins := v_diff_mins;
        ELSIF p_status = 'terlambat' THEN
            v_late_mins := GREATEST(COALESCE(v_att.late_minutes, 0), 16);
        END IF;
    ELSE
        v_late_mins := COALESCE(v_att.late_minutes, 0);
    END IF;

    INSERT INTO public.attendance_corrections (
        attendance_id, requested_by, employee_id, work_date, reason, supporting_note,
        original_values, proposed_values, status, reviewed_by, reviewed_at, review_note
    ) VALUES (
        v_att.id, v_actor.id, v_att.employee_id, v_att.work_date, p_reason, 'Edit Administratif oleh ' || v_actor.role::TEXT,
        jsonb_build_object('shift_id', v_att.shift_id, 'check_in_at', v_att.check_in_at, 'check_out_at', v_att.check_out_at, 'attendance_status', v_att.attendance_status),
        jsonb_build_object('shift_id', v_target_shift_id, 'check_in_at', p_check_in_at, 'check_out_at', p_check_out_at, 'attendance_status', p_status),
        'approved', v_actor.id, NOW(), p_reason
    );

    UPDATE public.attendance
    SET shift_id = v_target_shift_id,
        check_in_at = v_eff_in,
        check_out_at = p_check_out_at,
        work_duration_minutes = CASE
            WHEN v_eff_in IS NOT NULL AND p_check_out_at IS NOT NULL
            THEN GREATEST(0, round(EXTRACT(EPOCH FROM (p_check_out_at - v_eff_in)) / 60.0)::INTEGER)
            ELSE 0
        END,
        late_minutes = v_late_mins,
        attendance_status = p_status,
        correction_note = 'Diedit oleh ' || v_actor.full_name || ' (' || v_actor.role::TEXT || '): ' || p_reason || ' [Bukti Foto Asli Tetap Utuh]',
        updated_at = NOW()
    WHERE id = p_attendance_id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (
        v_actor.id,
        v_actor.full_name,
        v_actor.role::TEXT,
        'ADMIN_EDITED_ATTENDANCE',
        'attendance',
        p_attendance_id::TEXT,
        'Edit administratif absensi tanggal ' || v_att.work_date || '. Alasan: ' || p_reason
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. Kebijakan RLS Restrictive untuk mengunci pengajuan koreksi/izin oleh member biasa
CREATE POLICY "corrections_restrict_member_by_setting" ON public.attendance_corrections
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
    public.get_current_user_role() IN ('super_admin', 'admin')
    OR COALESCE(
        (SELECT (value->>'allow_member_request_corrections')::BOOLEAN
         FROM public.system_settings WHERE key = 'operational_config'),
        FALSE
    ) = TRUE
);

CREATE POLICY "leaves_restrict_member_by_setting" ON public.holidays_and_leaves
AS RESTRICTIVE
FOR INSERT
WITH CHECK (
    public.get_current_user_role() IN ('super_admin', 'admin')
    OR COALESCE(
        (SELECT (value->>'allow_member_request_leaves')::BOOLEAN
         FROM public.system_settings WHERE key = 'operational_config'),
        FALSE
    ) = TRUE
);

-- 7. Kunci search_path = public pada seluruh fungsi eksisting
ALTER FUNCTION public.prevent_audit_log_modification() SET search_path = public;
ALTER FUNCTION public.get_current_user_role() SET search_path = public;
ALTER FUNCTION public.calculate_haversine_meters(double precision, double precision, double precision, double precision) SET search_path = public;
ALTER FUNCTION public.bootstrap_first_super_admin(text, text) SET search_path = public;
ALTER FUNCTION public.get_public_system_state() SET search_path = public;
ALTER FUNCTION public.sync_my_google_profile() SET search_path = public;
ALTER FUNCTION public.review_google_first_login(uuid, text, text, text, uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.update_employee_by_manager(uuid, text, text, text, text, uuid, uuid, public.user_status) SET search_path = public;
ALTER FUNCTION public.change_employee_role_by_super_admin(uuid, public.user_role, text) SET search_path = public;
ALTER FUNCTION public.process_attendance_correction(uuid, public.approval_status, text) SET search_path = public;
ALTER FUNCTION public.admin_direct_edit_attendance(uuid, timestamptz, timestamptz, public.attendance_record_status, text) SET search_path = public;

-- Cabut eksekusi anon dari RPC mutasi terautentikasi
REVOKE ALL ON FUNCTION public.set_my_active_shift(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_active_shift(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_server_check_in(text, text, double precision, double precision, double precision, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_server_check_in(text, text, double precision, double precision, double precision, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_server_check_in_with_shift(text, text, double precision, double precision, double precision, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_server_check_in_with_shift(text, text, double precision, double precision, double precision, timestamptz, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_server_check_out(text, double precision, double precision, double precision, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_server_check_out(text, double precision, double precision, double precision, timestamptz) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_direct_edit_attendance(uuid, timestamptz, timestamptz, public.attendance_record_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_direct_edit_attendance(uuid, timestamptz, timestamptz, public.attendance_record_status, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_direct_edit_attendance_v2(uuid, timestamptz, timestamptz, public.attendance_record_status, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_direct_edit_attendance_v2(uuid, timestamptz, timestamptz, public.attendance_record_status, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.bootstrap_first_super_admin(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_super_admin(text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.change_employee_role_by_super_admin(uuid, public.user_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_employee_role_by_super_admin(uuid, public.user_role, text) TO authenticated;

REVOKE ALL ON FUNCTION public.process_attendance_correction(uuid, public.approval_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_attendance_correction(uuid, public.approval_status, text) TO authenticated;

REVOKE ALL ON FUNCTION public.review_google_first_login(uuid, text, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_google_first_login(uuid, text, text, text, uuid, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_my_google_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_my_google_profile() TO authenticated;

REVOKE ALL ON FUNCTION public.update_employee_by_manager(uuid, text, text, text, text, uuid, uuid, public.user_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_employee_by_manager(uuid, text, text, text, text, uuid, uuid, public.user_status) TO authenticated;

-- 8. Sinkronisasi koordinat outlet Bali, toleransi 15 menit, & kunci fitur member (diterapkan di runtime DB)
UPDATE public.outlets
SET address = 'Jalan Pura Uma Jati Gang Gagak Jl. Teges Kanginan No.Br, Peliatan, Ubud, Gianyar, Bali 80571',
    latitude = -8.524600,
    longitude = 115.274100,
    geofence_radius_meters = GREATEST(geofence_radius_meters, 250),
    minimum_gps_accuracy_meters = GREATEST(minimum_gps_accuracy_meters, 250),
    timezone = 'Asia/Makassar',
    updated_at = NOW()
WHERE address = 'Atur alamat & titik koordinat resmi melalui Control Panel -> Outlet & GPS'
   OR (latitude = -5.147665 AND longitude = 119.432732);

UPDATE public.work_shifts
SET grace_period_minutes = 15,
    updated_at = NOW()
WHERE name IN ('Shift Pagi', 'Shift Siang')
  AND grace_period_minutes IS DISTINCT FROM 15;

UPDATE public.system_settings
SET value = jsonb_set(
        jsonb_set(value, '{allow_member_request_corrections}', 'false'::jsonb, true),
        '{allow_member_request_leaves}', 'false'::jsonb, true
    ),
    updated_at = NOW()
WHERE key = 'operational_config';

