-- ============================================================================
-- 009: ALIH SHIFT OTOMATIS SEBELUM 30 MENIT HANYA UNTUK CHECK IN
-- Kafe & Catering Suka Latte
--
-- Aturan:
-- 1. Shift Pagi (07:00 - 15:00)   -> Jendela Check In Buka: 06:30 WITA
-- 2. Shift Middle (12:00 - 20:00) -> Jendela Check In Buka: 11:30 WITA
-- 3. Shift Siang (14:30 - 22:30)  -> Jendela Check In Buka: 14:00 WITA
--
-- Hanya berlaku untuk transaksi CHECK IN. Check out tetap menggunakan shift yang dicatat saat check in.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_auto_recommended_shift_id(p_tz TEXT DEFAULT 'Asia/Makassar')
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_tz TEXT := COALESCE(NULLIF(p_tz, ''), 'Asia/Makassar');
    v_local_ts TIMESTAMP := NOW() AT TIME ZONE v_tz;
    v_curr_mins INTEGER := EXTRACT(HOUR FROM v_local_ts)::INTEGER * 60 + EXTRACT(MINUTE FROM v_local_ts)::INTEGER;
    v_shift_id UUID := NULL;
BEGIN
    -- 1. Cari shift reguler aktif yang jendela absensinya (start_time - 30m) sudah terbuka pada jam ini
    SELECT id INTO v_shift_id
    FROM public.work_shifts
    WHERE status = 'active'
      AND LOWER(name) NOT LIKE '%full%'
      AND ((EXTRACT(HOUR FROM start_time)::INTEGER * 60 + EXTRACT(MINUTE FROM start_time)::INTEGER - 30) <= v_curr_mins)
    ORDER BY start_time DESC
    LIMIT 1;

    -- 2. Jika waktu masih sebelum jendela shift pertama (misal subuh 05:00 sebelum 06:30), ambil shift pertama (Pagi)
    IF v_shift_id IS NULL THEN
        SELECT id INTO v_shift_id
        FROM public.work_shifts
        WHERE status = 'active'
          AND LOWER(name) NOT LIKE '%full%'
        ORDER BY start_time ASC
        LIMIT 1;
    END IF;

    -- 3. Fallback mutlak jika hanya ada shift full day atau lainnya
    IF v_shift_id IS NULL THEN
        SELECT id INTO v_shift_id
        FROM public.work_shifts
        WHERE status = 'active'
        ORDER BY start_time ASC
        LIMIT 1;
    END IF;

    RETURN v_shift_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_auto_recommended_shift_id(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auto_recommended_shift_id(TEXT) TO authenticated;

-- Perbarui submit_server_check_in_with_shift agar jika p_shift_id NULL, otomatis gunakan get_auto_recommended_shift_id
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
SET search_path = public, auth
AS $$
DECLARE
    v_auto_shift_id UUID := p_shift_id;
    v_outlet public.outlets%ROWTYPE;
    v_cfg JSONB;
    v_tz TEXT;
BEGIN
    -- Resolusi otomatis jika shift tidak dikirim eksplisit
    IF v_auto_shift_id IS NULL THEN
        SELECT value INTO v_cfg FROM public.system_settings WHERE key = 'operational_config';
        SELECT * INTO v_outlet FROM public.outlets WHERE id = (SELECT outlet_id FROM public.profiles WHERE id = auth.uid()) AND status = 'active';
        IF NOT FOUND THEN
            SELECT * INTO v_outlet FROM public.outlets WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
        END IF;
        v_tz := COALESCE(NULLIF(v_outlet.timezone, ''), v_cfg->>'operational_timezone', 'Asia/Makassar');
        v_auto_shift_id := public.get_auto_recommended_shift_id(v_tz);
    END IF;

    IF v_auto_shift_id IS NOT NULL THEN
        PERFORM public.set_my_active_shift(v_auto_shift_id);
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

REVOKE ALL ON FUNCTION public.submit_server_check_in_with_shift(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_server_check_in_with_shift(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ, UUID) TO authenticated;
