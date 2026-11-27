-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM - MIGRATION 012
-- PENEGAKAN CEK IN & CEK OUT WAJIB DI HARI KERJA YANG SAMA
-- PENUTUPAN OTOMATIS SESI KADALUWARSA & NOTIFIKASI AKURAT AKHIR SHIFT
-- ============================================================================

-- 1. Fungsi Penutupan Otomatis Sesi Absensi Kadaluwarsa dari Hari Sebelumnya
CREATE OR REPLACE FUNCTION public.auto_close_expired_attendances()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_closed_count INTEGER := 0;
    v_rec RECORD;
    v_tz TEXT;
    v_now TIMESTAMPTZ := NOW();
    v_today DATE;
    v_shift_end_time TIME;
    v_auto_out TIMESTAMPTZ;
    v_dur INTEGER;
BEGIN
    -- Ambil timezone operasional kafe
    SELECT COALESCE(value->>'operational_timezone', 'Asia/Makassar')
    INTO v_tz
    FROM public.system_settings
    WHERE key = 'operational_config';
    IF v_tz IS NULL THEN v_tz := 'Asia/Makassar'; END IF;

    v_today := (v_now AT TIME ZONE v_tz)::DATE;

    -- Cari semua absensi yang belum check out dari hari-hari sebelum hari ini (work_date < v_today)
    FOR v_rec IN
        SELECT a.id, a.employee_id, a.work_date, a.check_in_at, a.shift_id, a.attendance_status, a.anomaly_notes,
               ws.name AS shift_name, ws.start_time, ws.end_time, ws.crosses_midnight,
               o.timezone AS outlet_tz
        FROM public.attendance a
        LEFT JOIN public.work_shifts ws ON ws.id = a.shift_id
        LEFT JOIN public.outlets o ON o.id = a.outlet_id
        WHERE a.check_in_at IS NOT NULL
          AND a.check_out_at IS NULL
          AND a.work_date < v_today
        FOR UPDATE OF a
    LOOP
        -- Abaikan jika shift lintas tengah malam yang masih berlangsung pada dini hari ini
        IF v_rec.crosses_midnight AND v_rec.work_date = (v_today - INTERVAL '1 day')::DATE THEN
            -- Lewati jika saat ini masih sebelum jam selesai shift + toleransi 2 jam
            IF (EXTRACT(HOUR FROM (v_now AT TIME ZONE v_tz))::INTEGER * 60 + EXTRACT(MINUTE FROM (v_now AT TIME ZONE v_tz))::INTEGER) <
               (EXTRACT(HOUR FROM v_rec.end_time)::INTEGER * 60 + EXTRACT(MINUTE FROM v_rec.end_time)::INTEGER + 120) THEN
                CONTINUE;
            END IF;
        END IF;

        -- Tentukan waktu check out otomatis (akhir jam shift di hari kerja tersebut, atau check_in + 8 jam)
        v_shift_end_time := COALESCE(v_rec.end_time, '15:00:00'::TIME);
        
        -- Waktu keluar otomatis disetel pada jam akhir shift hari tersebut
        v_auto_out := ((v_rec.work_date::TEXT || ' ' || v_shift_end_time::TEXT)::TIMESTAMP) AT TIME ZONE COALESCE(v_rec.outlet_tz, v_tz);
        
        IF v_rec.crosses_midnight THEN
            v_auto_out := v_auto_out + INTERVAL '1 day';
        END IF;

        IF v_auto_out <= v_rec.check_in_at THEN
            v_auto_out := v_rec.check_in_at + INTERVAL '8 hours';
        END IF;

        IF v_auto_out > v_now THEN
            v_auto_out := v_now;
        END IF;

        v_dur := GREATEST(0, round(EXTRACT(EPOCH FROM (v_auto_out - v_rec.check_in_at)) / 60.0)::INTEGER);
        -- Batasi durasi kerja maksimal 480 menit (8 jam) agar data jam kerja tidak membengkak ke 24 jam
        IF v_dur > 480 THEN
            v_dur := 480;
        END IF;

        UPDATE public.attendance
        SET check_out_at = v_auto_out,
            work_duration_minutes = v_dur,
            attendance_status = CASE 
                WHEN v_rec.attendance_status = 'terlambat'::public.attendance_record_status THEN 'terlambat'::public.attendance_record_status
                ELSE 'selesai'::public.attendance_record_status
            END,
            anomaly_notes = CASE 
                WHEN v_rec.anomaly_notes IS NOT NULL AND v_rec.anomaly_notes <> '' 
                THEN v_rec.anomaly_notes || ' • Lupa Check Out (Ditutup otomatis oleh sistem saat pergantian hari kerja)'
                ELSE 'Lupa Check Out (Ditutup otomatis oleh sistem saat pergantian hari kerja)'
            END,
            live_status = 'checked_out',
            updated_at = v_now
        WHERE id = v_rec.id;

        v_closed_count := v_closed_count + 1;
    END LOOP;

    RETURN v_closed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.auto_close_expired_attendances() TO authenticated, anon;

-- 2. Perbarui submit_server_check_in agar membersihkan sesi kadaluwarsa & menjamin isolasi tanggal
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
    -- 1. Tutup otomatis sesi absensi kemarin yang lupa di-check out agar tidak memblokir hari baru
    PERFORM public.auto_close_expired_attendances();

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

    -- Cegah duplikasi Check In pada tanggal kerja & shift yang sama
    IF EXISTS (
        SELECT 1 FROM public.attendance
        WHERE employee_id = v_user.id AND work_date = v_work_date AND shift_id = v_shift.id
    ) THEN
        RAISE EXCEPTION 'ALREADY_CHECKED_IN: Anda sudah melakukan Check In untuk % pada tanggal kerja %.', v_shift.name, v_work_date;
    END IF;

    -- Cegah double check in jika masih ada yang aktif hari ini
    IF EXISTS (
        SELECT 1 FROM public.attendance
        WHERE employee_id = v_user.id AND work_date = v_work_date AND check_in_at IS NOT NULL AND check_out_at IS NULL
    ) THEN
        RAISE EXCEPTION 'ALREADY_ACTIVE: Anda masih memiliki sesi tugas aktif hari ini yang belum di-Check Out.';
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
        late_minutes, attendance_status, anomaly_notes,
        live_latitude, live_longitude, live_accuracy, live_distance_meters,
        live_status, live_last_ping
    ) VALUES (
        p_idempotency_key, v_user.id, v_shift.id, v_outlet.id, v_work_date,
        v_year, v_month, v_period_key, v_folder_label,
        v_now, p_device_timestamp, v_skew_sec,
        p_latitude, p_longitude, p_accuracy, v_dist,
        p_photo_path, v_loc_status,
        v_late_mins, v_att_status,
        CASE WHEN array_length(v_anomalies, 1) > 0 THEN array_to_string(v_anomalies, ' • ') ELSE NULL END,
        p_latitude, p_longitude, p_accuracy, v_dist,
        CASE WHEN v_loc_status = 'outside_radius' THEN 'outside' ELSE 'inside' END,
        v_now
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
        jsonb_build_object(
            'shift_name', v_shift.name,
            'work_date', v_work_date,
            'status', v_att_status,
            'late_minutes', v_late_mins,
            'distance_meters', v_dist
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'attendance_id', v_new_id,
        'work_date', v_work_date,
        'shift_id', v_shift.id,
        'shift_name', v_shift.name,
        'attendance_status', v_att_status,
        'late_minutes', v_late_mins,
        'distance_meters', v_dist,
        'check_in_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_server_check_in(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ) TO authenticated;

-- 3. Perbarui submit_server_check_out agar Menegakkan Check Out pada Hari Kerja yang Sama
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
    v_work_date DATE;
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
    -- 1. Bersihkan terlebih dahulu absensi lampau yang terlantar
    PERFORM public.auto_close_expired_attendances();

    SELECT * INTO v_user FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Akun Anda belum disetujui atau tidak aktif.';
    END IF;

    SELECT value INTO v_cfg FROM public.system_settings WHERE key = 'operational_config';
    v_tz := COALESCE(v_cfg->>'operational_timezone', 'Asia/Makassar');
    v_local_ts := v_now AT TIME ZONE v_tz;
    v_work_date := v_local_ts::DATE;

    -- 2. Cari transaksi Check In aktif HANYA UNTUK HARI KERJA HARI INI
    SELECT * INTO v_att FROM public.attendance
    WHERE employee_id = v_user.id 
      AND work_date = v_work_date 
      AND check_in_at IS NOT NULL 
      AND check_out_at IS NULL
    ORDER BY check_in_at DESC
    LIMIT 1
    FOR UPDATE;

    -- Jika tidak ditemukan pada tanggal ini, periksa apakah ada shift lintas tengah malam kemarin yang valid
    IF NOT FOUND THEN
        SELECT a.* INTO v_att FROM public.attendance a
        JOIN public.work_shifts ws ON ws.id = a.shift_id
        WHERE a.employee_id = v_user.id
          AND a.work_date = (v_work_date - INTERVAL '1 day')::DATE
          AND ws.crosses_midnight = TRUE
          AND a.check_in_at IS NOT NULL
          AND a.check_out_at IS NULL
        ORDER BY a.check_in_at DESC
        LIMIT 1
        FOR UPDATE;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NO_ACTIVE_CHECK_IN: Tidak ada Check In aktif untuk hari kerja hari ini (%). Check In hari ini wajib di-Check Out pada hari yang sama.', v_work_date;
    END IF;

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

    -- Hitung durasi kerja dalam menit (dibatasi maksimal 720 menit / 12 jam jika lembur berlebih)
    v_dur_mins := GREATEST(0, round(EXTRACT(EPOCH FROM (v_now - v_att.check_in_at)) / 60.0)::INTEGER);
    IF v_dur_mins > 720 THEN
        v_dur_mins := 720;
    END IF;

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
        live_status = 'checked_out',
        updated_at = v_now
    WHERE id = v_att.id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (
        v_user.id,
        v_user.full_name,
        v_user.role::TEXT,
        'ATTENDANCE_CHECK_OUT',
        'attendance',
        v_att.id::TEXT,
        jsonb_build_object(
            'shift_name', v_shift.name,
            'work_date', v_att.work_date,
            'duration_minutes', v_dur_mins,
            'early_leave_minutes', v_early_mins,
            'status', v_final_status,
            'distance_meters', v_dist
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'attendance_id', v_att.id,
        'work_date', v_att.work_date,
        'shift_name', v_shift.name,
        'duration_minutes', v_dur_mins,
        'early_leave_minutes', v_early_mins,
        'attendance_status', v_final_status,
        'status_label', CASE
            WHEN v_final_status = 'pulang_cepat' THEN 'Pulang Cepat'
            WHEN v_final_status = 'terlambat' THEN 'Selesai (Terlambat Masuk)'
            ELSE 'Selesai (Lengkap)'
        END,
        'check_out_at', v_now
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_server_check_out(TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ) TO authenticated;

-- 4. Perbarui sync_duty_live_location agar hanya melacak absensi hari ini
CREATE OR REPLACE FUNCTION public.sync_duty_live_location(
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_accuracy DOUBLE PRECISION,
    p_distance_meters DOUBLE PRECISION,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_att_id UUID;
    v_today DATE;
    v_tz TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi tidak valid.';
    END IF;

    SELECT COALESCE(value->>'operational_timezone', 'Asia/Makassar')
    INTO v_tz FROM public.system_settings WHERE key = 'operational_config';
    v_today := (NOW() AT TIME ZONE COALESCE(v_tz, 'Asia/Makassar'))::DATE;

    -- Ambil transaksi absensi aktif HANYA UNTUK HARI INI yang belum check out
    SELECT id INTO v_att_id
    FROM public.attendance
    WHERE employee_id = v_user_id 
      AND work_date = v_today
      AND check_in_at IS NOT NULL 
      AND check_out_at IS NULL
    ORDER BY check_in_at DESC
    LIMIT 1;

    IF v_att_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tidak ada shift tugas aktif hari ini.');
    END IF;

    UPDATE public.attendance
    SET
        live_latitude = p_latitude,
        live_longitude = p_longitude,
        live_accuracy = p_accuracy,
        live_distance_meters = p_distance_meters,
        live_status = p_status,
        live_last_ping = NOW()
    WHERE id = v_att_id;

    RETURN jsonb_build_object(
        'success', true,
        'attendance_id', v_att_id,
        'live_status', p_status,
        'live_distance_meters', p_distance_meters,
        'pinged_at', NOW()
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_duty_live_location TO authenticated;
