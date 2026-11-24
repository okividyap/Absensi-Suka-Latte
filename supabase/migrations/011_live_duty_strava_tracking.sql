-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM - MIGRATION 011
-- LIVE DUTY STRAVA-LIKE LOCATION TRACKING & REAL-TIME GEOFENCE MONITORING
-- ============================================================================

ALTER TABLE public.attendance
ADD COLUMN IF NOT EXISTS live_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS live_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS live_accuracy DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS live_distance_meters DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS live_status TEXT DEFAULT 'inside',
ADD COLUMN IF NOT EXISTS live_last_ping TIMESTAMPTZ;

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
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Sesi tidak valid.';
    END IF;

    -- Ambil transaksi absensi aktif hari ini milik pengguna yang belum check out
    SELECT id INTO v_att_id
    FROM public.attendance
    WHERE employee_id = v_user_id AND check_in_at IS NOT NULL AND check_out_at IS NULL
    ORDER BY check_in_at DESC
    LIMIT 1;

    IF v_att_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Tidak ada shift tugas aktif.');
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
