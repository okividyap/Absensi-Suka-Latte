-- =============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM (Versi 1.1 — FINAL PRODUCTION)
-- PostgreSQL Schema + Server-Side Validation RPCs + Strict RLS + Private Bucket
-- Autentikasi Wajib Google OAuth + Persetujuan Login Pertama oleh Admin/Super Admin
-- Zona Waktu Operasional Awal: Asia/Makassar (WITA)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'member');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('pending_approval', 'active', 'inactive', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE location_validation_status AS ENUM (
        'valid_in_radius',
        'outside_radius',
        'low_accuracy',
        'gps_unavailable',
        'bypassed_by_policy'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE attendance_record_status AS ENUM (
        'belum_check_in',
        'hadir',
        'terlambat',
        'sudah_check_in_belum_check_out',
        'selesai',
        'pulang_cepat',
        'tidak_hadir',
        'izin',
        'sakit',
        'cuti'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('pending', 'recommended_by_admin', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. TABEL: outlets (Dapat Diedit Penuh oleh Super Admin & Admin dari Aplikasi)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outlets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    geofence_radius_meters INTEGER NOT NULL DEFAULT 150 CHECK (geofence_radius_meters >= 10),
    minimum_gps_accuracy_meters INTEGER NOT NULL DEFAULT 100 CHECK (minimum_gps_accuracy_meters >= 5),
    timezone TEXT NOT NULL DEFAULT 'Asia/Makassar',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Outlet awal default (dapat diedit penuh melalui Control Panel tanpa VS Code)
INSERT INTO public.outlets (name, address, latitude, longitude, geofence_radius_meters, minimum_gps_accuracy_meters, timezone, status)
SELECT 'Suka Latte Café & Catering', 'Atur alamat & titik koordinat resmi melalui Control Panel -> Outlet & GPS', -5.147665, 119.432732, 150, 100, 'Asia/Makassar', 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.outlets);

-- -----------------------------------------------------------------------------
-- 3. TABEL: work_shifts (Dapat Diedit Penuh oleh Super Admin & Admin dari Aplikasi)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.work_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_period_minutes INTEGER NOT NULL DEFAULT 10 CHECK (grace_period_minutes >= 0),
    early_checkout_threshold_minutes INTEGER NOT NULL DEFAULT 15 CHECK (early_checkout_threshold_minutes >= 0),
    check_in_earliest_minutes INTEGER NOT NULL DEFAULT 90,
    check_out_latest_minutes INTEGER NOT NULL DEFAULT 180,
    crosses_midnight BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_until DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.work_shifts (name, start_time, end_time, grace_period_minutes, early_checkout_threshold_minutes, crosses_midnight, status)
SELECT 'Shift Pagi', '07:00', '15:00', 10, 15, FALSE, 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.work_shifts);

INSERT INTO public.work_shifts (name, start_time, end_time, grace_period_minutes, early_checkout_threshold_minutes, crosses_midnight, status)
SELECT 'Shift Siang', '15:00', '23:00', 10, 15, FALSE, 'active'
WHERE (SELECT COUNT(*) FROM public.work_shifts) < 2;

-- -----------------------------------------------------------------------------
-- 4. TABEL: profiles (Wajib Google OAuth + Persetujuan Login Pertama)
-- Constraint Unik: Hanya boleh ada SATU Super Admin di seluruh sistem!
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
    google_sub TEXT,
    employee_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    phone TEXT DEFAULT '',
    position_title TEXT NOT NULL DEFAULT 'Anggota / Crew',
    role user_role NOT NULL DEFAULT 'member',
    status user_status NOT NULL DEFAULT 'pending_approval',
    first_login_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL,
    shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
    last_google_login_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_single_super_admin
ON public.profiles ((role))
WHERE role = 'super_admin';

-- -----------------------------------------------------------------------------
-- 5. TABEL: preapproved_emails (Pra-Persetujuan Email Google Karyawan oleh Admin)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.preapproved_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    employee_code TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    position_title TEXT NOT NULL DEFAULT 'Anggota / Crew',
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL,
    shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    claimed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. TABEL: system_bootstrap (Singleton Pengunci Super Admin Pertama)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_bootstrap (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    bootstrap_completed BOOLEAN NOT NULL DEFAULT FALSE,
    super_admin_user_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    completed_at TIMESTAMPTZ
);

INSERT INTO public.system_bootstrap (id, bootstrap_completed)
VALUES (1, FALSE)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. TABEL: attendance (Bukti Selfie Baru Check In & Check Out + Arsip Bulanan)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT UNIQUE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    shift_id UUID NOT NULL REFERENCES public.work_shifts(id) ON DELETE RESTRICT,
    outlet_id UUID NOT NULL REFERENCES public.outlets(id) ON DELETE RESTRICT,
    work_date DATE NOT NULL,
    archive_year INTEGER NOT NULL,
    archive_month INTEGER NOT NULL CHECK (archive_month BETWEEN 1 AND 12),
    archive_period_key TEXT NOT NULL,
    archive_folder_label TEXT NOT NULL,

    -- Check In
    check_in_at TIMESTAMPTZ,
    check_in_device_at TIMESTAMPTZ,
    check_in_clock_skew_seconds INTEGER DEFAULT 0,
    check_in_latitude DOUBLE PRECISION,
    check_in_longitude DOUBLE PRECISION,
    check_in_accuracy DOUBLE PRECISION,
    check_in_distance_meters DOUBLE PRECISION,
    check_in_photo_path TEXT,
    check_in_location_status location_validation_status,

    -- Check Out
    check_out_at TIMESTAMPTZ,
    check_out_device_at TIMESTAMPTZ,
    check_out_clock_skew_seconds INTEGER DEFAULT 0,
    check_out_latitude DOUBLE PRECISION,
    check_out_longitude DOUBLE PRECISION,
    check_out_accuracy DOUBLE PRECISION,
    check_out_distance_meters DOUBLE PRECISION,
    check_out_photo_path TEXT,
    check_out_location_status location_validation_status,

    -- Durasi & Status
    late_minutes INTEGER NOT NULL DEFAULT 0,
    early_leave_minutes INTEGER NOT NULL DEFAULT 0,
    work_duration_minutes INTEGER NOT NULL DEFAULT 0,
    attendance_status attendance_record_status NOT NULL DEFAULT 'belum_check_in',
    anomaly_notes TEXT,
    correction_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_employee_workdate_shift UNIQUE (employee_id, work_date, shift_id),
    CONSTRAINT chk_checkout_after_checkin CHECK (check_out_at IS NULL OR (check_in_at IS NOT NULL AND check_out_at >= check_in_at))
);

CREATE INDEX IF NOT EXISTS idx_attendance_archive_period ON public.attendance(archive_year, archive_month);
CREATE INDEX IF NOT EXISTS idx_attendance_employee_date ON public.attendance(employee_id, work_date DESC);

-- -----------------------------------------------------------------------------
-- 8. TABEL: attendance_corrections, holidays_and_leaves, system_settings, audit_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_id UUID NOT NULL REFERENCES public.attendance(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    work_date DATE NOT NULL,
    reason TEXT NOT NULL,
    supporting_note TEXT DEFAULT '',
    original_values JSONB NOT NULL,
    proposed_values JSONB NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.holidays_and_leaves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    date_start DATE NOT NULL,
    date_end DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('holiday', 'izin', 'sakit', 'cuti', 'jadwal_khusus')),
    reason TEXT NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending',
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.system_settings (key, value)
VALUES (
    'operational_config',
    jsonb_build_object(
        'operational_timezone', 'Asia/Makassar',
        'require_selfie_photo', true,
        'require_gps_validation', true,
        'strict_geofence_enforcement', true,
        'clock_skew_warning_threshold_seconds', 120,
        'allow_member_request_corrections', true,
        'allow_member_request_leaves', true,
        'brand_display_name', 'SUKA LATTE ATTENDANCE SYSTEM',
        'brand_subtitle', 'Café & Catering',
        'brand_tagline', 'Your home cooking taste',
        'welcome_message', 'Selamat bertugas di Suka Latte. Pastikan foto selfie diambil langsung menggunakan kamera perangkat di area outlet.',
        'theme_preset', 'classic_latte',
        'photo_retention_policy_months', 0,
        'session_timeout_minutes', 120
    )
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs bersifat append-only dan tidak dapat diubah atau dihapus.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();

-- -----------------------------------------------------------------------------
-- 9. HELPER & SERVER-SIDE RPC FUNCTIONS
-- -----------------------------------------------------------------------------

-- Cek role pengguna yang sudah disetujui login pertamanya & aktif
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT role
    FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND first_login_approved = TRUE;
$$;

-- Menghitung jarak Haversine dalam meter di sisi server
CREATE OR REPLACE FUNCTION public.calculate_haversine_meters(
    lat1 DOUBLE PRECISION,
    lon1 DOUBLE PRECISION,
    lat2 DOUBLE PRECISION,
    lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    r CONSTANT DOUBLE PRECISION := 6371000;
    dlat DOUBLE PRECISION;
    dlon DOUBLE PRECISION;
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);
    a := sin(dlat / 2) ^ 2 + cos(radians(lat1)) * cos(radians(lat2)) * (sin(dlon / 2) ^ 2);
    c := 2 * atan2(sqrt(a), sqrt(1 - a));
    RETURN round((r * c)::numeric, 1)::DOUBLE PRECISION;
END;
$$;

-- A. Informasi Publik Sistem Sebelum Login (Tanpa membocorkan data pengguna)
CREATE OR REPLACE FUNCTION public.get_public_system_state()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bootstrap BOOLEAN;
    v_settings JSONB;
BEGIN
    SELECT bootstrap_completed INTO v_bootstrap FROM public.system_bootstrap WHERE id = 1;
    SELECT value INTO v_settings FROM public.system_settings WHERE key = 'operational_config';
    RETURN jsonb_build_object(
        'bootstrap_completed', COALESCE(v_bootstrap, FALSE),
        'settings', COALESCE(v_settings, '{}'::jsonb),
        'server_now_utc', NOW()
    );
END;
$$;

-- B. Inisialisasi Bootstrap Super Admin Pertama (Hanya 1x Seumur Hidup Sistem, Wajib Google Auth)
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin(
    p_employee_code TEXT DEFAULT 'SL-0001',
    p_phone TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_name TEXT;
    v_avatar TEXT;
    v_sub TEXT;
    v_provider TEXT;
    v_providers JSONB;
    v_already_done BOOLEAN;
    v_super_count INTEGER;
    v_outlet_id UUID;
    v_shift_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Silakan login menggunakan Akun Google terlebih dahulu.';
    END IF;

    SELECT
        email,
        COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
        COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture', ''),
        raw_user_meta_data->>'sub',
        raw_app_meta_data->>'provider',
        COALESCE(raw_app_meta_data->'providers', '[]'::jsonb)
    INTO v_email, v_name, v_avatar, v_sub, v_provider, v_providers
    FROM auth.users
    WHERE id = v_uid;

    IF v_provider IS NOT NULL AND v_provider <> '' AND v_provider <> 'google' AND NOT (v_providers ? 'google') THEN
        IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'google') THEN
            RAISE EXCEPTION 'GOOGLE_AUTH_REQUIRED: Login wajib menggunakan Akun Google resmi demi keamanan dan privasi.';
        END IF;
    END IF;

    SELECT bootstrap_completed INTO v_already_done
    FROM public.system_bootstrap
    WHERE id = 1
    FOR UPDATE;

    IF v_already_done THEN
        RAISE EXCEPTION 'BOOTSTRAP_LOCKED: Inisialisasi Super Admin sudah terkunci permanen. Tidak dapat membuat Super Admin kedua.';
    END IF;

    SELECT COUNT(*) INTO v_super_count FROM public.profiles WHERE role = 'super_admin';
    IF v_super_count > 0 THEN
        RAISE EXCEPTION 'SUPER_ADMIN_EXISTS: Akun Super Admin tunggal sudah terdaftar.';
    END IF;

    SELECT id INTO v_outlet_id FROM public.outlets ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_shift_id FROM public.work_shifts ORDER BY created_at ASC LIMIT 1;

    INSERT INTO public.profiles (
        id, google_sub, employee_code, full_name, email, avatar_url, phone,
        position_title, role, status, first_login_approved, approved_by, approved_at,
        outlet_id, shift_id, last_google_login_at
    ) VALUES (
        v_uid, v_sub, COALESCE(NULLIF(btrim(p_employee_code), ''), 'SL-0001'),
        v_name, lower(v_email), v_avatar, COALESCE(p_phone, ''),
        'Owner / Super Admin', 'super_admin', 'active', TRUE, NULL, NOW(),
        v_outlet_id, v_shift_id, NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        role = 'super_admin',
        status = 'active',
        first_login_approved = TRUE,
        approved_by = NULL,
        approved_at = NOW(),
        position_title = 'Owner / Super Admin',
        outlet_id = COALESCE(public.profiles.outlet_id, v_outlet_id),
        shift_id = COALESCE(public.profiles.shift_id, v_shift_id),
        updated_at = NOW();

    UPDATE public.system_bootstrap
    SET bootstrap_completed = TRUE,
        super_admin_user_id = v_uid,
        completed_at = NOW()
    WHERE id = 1;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (v_uid, v_name, 'super_admin', 'BOOTSTRAP_SUPER_ADMIN_LOCKED', 'system_bootstrap', '1',
            'Super Admin pertama (' || v_email || ') berhasil diinisialisasi via Google OAuth & bootstrap dikunci permanen.');

    RETURN jsonb_build_object('ok', true, 'role', 'super_admin');
END;
$$;

-- C. Sinkronisasi Sesi Login Google & Antrean Persetujuan Login Pertama
--    - Jika akun Google sudah pernah disetujui (first_login_approved = TRUE & status = 'active'): LANGSUNG MASUK!
--    - Jika akun Google baru pertama kali login: Masuk antrean 'pending_approval' (kecuali sudah di-whitelist Admin).
CREATE OR REPLACE FUNCTION public.sync_my_google_profile()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_name TEXT;
    v_avatar TEXT;
    v_sub TEXT;
    v_provider TEXT;
    v_providers JSONB;
    v_profile public.profiles%ROWTYPE;
    v_pre public.preapproved_emails%ROWTYPE;
    v_bootstrap_done BOOLEAN;
    v_default_outlet UUID;
    v_default_shift UUID;
    v_auto_code TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sesi Google tidak ditemukan.';
    END IF;

    SELECT
        lower(email),
        COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', split_part(email, '@', 1)),
        COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture', ''),
        raw_user_meta_data->>'sub',
        raw_app_meta_data->>'provider',
        COALESCE(raw_app_meta_data->'providers', '[]'::jsonb)
    INTO v_email, v_name, v_avatar, v_sub, v_provider, v_providers
    FROM auth.users
    WHERE id = v_uid;

    IF v_provider IS NOT NULL AND v_provider <> '' AND v_provider <> 'google' AND NOT (v_providers ? 'google') THEN
        IF NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'google') THEN
            RAISE EXCEPTION 'GOOGLE_AUTH_REQUIRED: Wajib menggunakan Akun Google untuk mengakses sistem ini.';
        END IF;
    END IF;

    SELECT bootstrap_completed INTO v_bootstrap_done FROM public.system_bootstrap WHERE id = 1;

    -- Cek apakah profil akun Google ini sudah terdaftar sebelumnya
    SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;

    IF FOUND THEN
        UPDATE public.profiles
        SET avatar_url = COALESCE(v_avatar, avatar_url),
            google_sub = COALESCE(v_sub, google_sub),
            last_google_login_at = NOW(),
            updated_at = NOW()
        WHERE id = v_uid
        RETURNING * INTO v_profile;

        RETURN jsonb_build_object(
            'bootstrap_completed', v_bootstrap_done,
            'profile', to_jsonb(v_profile)
        );
    END IF;

    -- Jika bootstrap belum selesai, belum boleh membuat profil anggota biasa sebelum Super Admin mengunci bootstrap
    IF NOT COALESCE(v_bootstrap_done, FALSE) THEN
        RETURN jsonb_build_object(
            'bootstrap_completed', FALSE,
            'profile', NULL,
            'google_identity', jsonb_build_object('email', v_email, 'full_name', v_name, 'avatar_url', v_avatar)
        );
    END IF;

    SELECT id INTO v_default_outlet FROM public.outlets WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_default_shift FROM public.work_shifts WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;

    -- Cek apakah email Google ini sudah dipra-setujui (whitelist) oleh Admin / Super Admin
    SELECT * INTO v_pre FROM public.preapproved_emails WHERE lower(email) = v_email AND claimed_by IS NULL;

    IF FOUND THEN
        INSERT INTO public.profiles (
            id, google_sub, employee_code, full_name, email, avatar_url, phone,
            position_title, role, status, first_login_approved, approved_by, approved_at,
            outlet_id, shift_id, last_google_login_at
        ) VALUES (
            v_uid, v_sub, v_pre.employee_code, COALESCE(NULLIF(v_pre.full_name, ''), v_name),
            v_email, v_avatar, v_pre.phone, v_pre.position_title,
            'member', 'active', TRUE, v_pre.created_by, NOW(),
            COALESCE(v_pre.outlet_id, v_default_outlet),
            COALESCE(v_pre.shift_id, v_default_shift),
            NOW()
        )
        RETURNING * INTO v_profile;

        UPDATE public.preapproved_emails
        SET claimed_by = v_uid, claimed_at = NOW()
        WHERE id = v_pre.id;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (v_uid, v_profile.full_name, 'member', 'GOOGLE_PREAPPROVED_FIRST_LOGIN', 'profiles', v_uid::TEXT,
                'Login pertama akun Google (' || v_email || ') langsung aktif sesuai daftar pra-persetujuan Admin.');
    ELSE
        -- Buat kode sementara unik dan masukkan ke antrean persetujuan Admin/Super Admin
        v_auto_code := 'PENDING-' || upper(substr(replace(v_uid::TEXT, '-', ''), 1, 6));

        INSERT INTO public.profiles (
            id, google_sub, employee_code, full_name, email, avatar_url, phone,
            position_title, role, status, first_login_approved,
            outlet_id, shift_id, last_google_login_at
        ) VALUES (
            v_uid, v_sub, v_auto_code, v_name, v_email, v_avatar, '',
            'Menunggu Penetapan', 'member', 'pending_approval', FALSE,
            v_default_outlet, v_default_shift, NOW()
        )
        RETURNING * INTO v_profile;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (v_uid, v_name, 'member', 'GOOGLE_FIRST_LOGIN_WAITING_APPROVAL', 'profiles', v_uid::TEXT,
                'Akun Google baru (' || v_email || ') meminta persetujuan login pertama kepada Admin/Super Admin.');
    END IF;

    RETURN jsonb_build_object(
        'bootstrap_completed', TRUE,
        'profile', to_jsonb(v_profile)
    );
END;
$$;

-- D. Persetujuan / Penolakan Login Pertama oleh Super Admin atau Admin
CREATE OR REPLACE FUNCTION public.review_google_first_login(
    p_target_user_id UUID,
    p_decision TEXT, -- 'approve' | 'reject'
    p_employee_code TEXT DEFAULT NULL,
    p_position_title TEXT DEFAULT 'Barista / Crew',
    p_outlet_id UUID DEFAULT NULL,
    p_shift_id UUID DEFAULT NULL,
    p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
    v_final_code TEXT;
BEGIN
    SELECT * INTO v_actor FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND OR v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Super Admin dan Admin yang berwenang menyetujui atau menolak login pertama.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Profil pengguna tidak ditemukan.';
    END IF;

    IF v_target.role = 'super_admin' THEN
        RAISE EXCEPTION 'PROTECTED: Akun Super Admin tidak dapat diubah melalui fungsi ini.';
    END IF;

    IF p_decision = 'approve' THEN
        v_final_code := COALESCE(NULLIF(upper(btrim(p_employee_code)), ''), v_target.employee_code);
        IF v_final_code LIKE 'PENDING-%' THEN
            v_final_code := 'SL-' || upper(substr(replace(p_target_user_id::TEXT, '-', ''), 1, 4));
        END IF;

        UPDATE public.profiles
        SET status = 'active',
            first_login_approved = TRUE,
            employee_code = v_final_code,
            position_title = COALESCE(NULLIF(btrim(p_position_title), ''), 'Barista / Crew'),
            outlet_id = COALESCE(p_outlet_id, outlet_id),
            shift_id = COALESCE(p_shift_id, shift_id),
            approved_by = v_actor.id,
            approved_at = NOW(),
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = p_target_user_id;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (v_actor.id, v_actor.full_name, v_actor.role::TEXT, 'GOOGLE_FIRST_LOGIN_APPROVED', 'profiles', p_target_user_id::TEXT,
                'Login pertama ' || v_target.full_name || ' (' || v_target.email || ') disetujui dengan ID ' || v_final_code || '. Login berikutnya otomatis masuk.');
    ELSE
        UPDATE public.profiles
        SET status = 'rejected',
            first_login_approved = FALSE,
            rejection_reason = COALESCE(NULLIF(btrim(p_note), ''), 'Permintaan akses ditolak oleh Admin.'),
            updated_at = NOW()
        WHERE id = p_target_user_id;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (v_actor.id, v_actor.full_name, v_actor.role::TEXT, 'GOOGLE_FIRST_LOGIN_REJECTED', 'profiles', p_target_user_id::TEXT,
                'Login pertama ' || v_target.full_name || ' (' || v_target.email || ') ditolak. Catatan: ' || COALESCE(p_note, '-'));
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- E. Edit Data Karyawan oleh Super Admin atau Admin (Tanpa Mengubah Role!)
CREATE OR REPLACE FUNCTION public.update_employee_by_manager(
    p_target_user_id UUID,
    p_employee_code TEXT,
    p_full_name TEXT,
    p_phone TEXT,
    p_position_title TEXT,
    p_outlet_id UUID,
    p_shift_id UUID,
    p_status user_status
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND OR v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Super Admin dan Admin yang dapat mengedit data karyawan.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Karyawan tidak ditemukan.';
    END IF;

    -- Admin biasa tidak boleh menonaktifkan atau mengedit Super Admin / sesama Admin lain
    IF v_actor.role = 'admin' AND v_target.role IN ('super_admin', 'admin') AND v_target.id <> v_actor.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Admin hanya dapat mengedit profil Anggota atau profil dirinya sendiri.';
    END IF;

    -- Akun Super Admin tunggal tidak boleh pernah dinonaktifkan
    IF v_target.role = 'super_admin' AND p_status <> 'active' THEN
        RAISE EXCEPTION 'PROTECTED_SUPER_ADMIN: Status akun Super Admin tunggal wajib tetap Aktif.';
    END IF;

    UPDATE public.profiles
    SET employee_code = COALESCE(NULLIF(upper(btrim(p_employee_code)), ''), employee_code),
        full_name = COALESCE(NULLIF(btrim(p_full_name), ''), full_name),
        phone = COALESCE(btrim(p_phone), ''),
        position_title = COALESCE(NULLIF(btrim(p_position_title), ''), position_title),
        outlet_id = COALESCE(p_outlet_id, outlet_id),
        shift_id = COALESCE(p_shift_id, shift_id),
        status = p_status,
        first_login_approved = CASE WHEN p_status = 'active' THEN TRUE ELSE first_login_approved END,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (v_actor.id, v_actor.full_name, v_actor.role::TEXT, 'EMPLOYEE_PROFILE_EDITED', 'profiles', p_target_user_id::TEXT,
            'Profil ' || p_full_name || ' (' || p_employee_code || ') diperbarui menjadi status ' || p_status::TEXT || '.');

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- F. Promosi / Demosi Role (KHUSUS SUPER ADMIN TUNGGAL — PRD Bab 4.1 & 11.2)
CREATE OR REPLACE FUNCTION public.change_employee_role_by_super_admin(
    p_target_user_id UUID,
    p_new_role user_role,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
BEGIN
    SELECT * INTO v_actor FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND OR v_actor.role <> 'super_admin' THEN
        RAISE EXCEPTION 'UNAUTHORIZED_ROLE_CHANGE: Hanya Super Admin yang berwenang mempromosikan Anggota menjadi Admin atau menurunkan Admin.';
    END IF;

    IF p_new_role = 'super_admin' THEN
        RAISE EXCEPTION 'FORBIDDEN_SECOND_SUPER_ADMIN: Hanya boleh ada satu Super Admin di seluruh sistem.';
    END IF;

    SELECT * INTO v_target FROM public.profiles WHERE id = p_target_user_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Pengguna tidak ditemukan.';
    END IF;

    IF v_target.role = 'super_admin' THEN
        RAISE EXCEPTION 'PROTECTED_SUPER_ADMIN: Akun Super Admin tidak dapat diturunkan jabatannya.';
    END IF;

    IF btrim(COALESCE(p_reason, '')) = '' THEN
        RAISE EXCEPTION 'REASON_REQUIRED: Alasan perubahan jabatan wajib diisi untuk Audit Log.';
    END IF;

    UPDATE public.profiles
    SET role = p_new_role,
        status = 'active',
        first_login_approved = TRUE,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (
        v_actor.id, v_actor.full_name, 'super_admin',
        CASE WHEN p_new_role = 'admin' THEN 'PROMOTE_MEMBER_TO_ADMIN' ELSE 'DEMOTE_ADMIN_TO_MEMBER' END,
        'profiles', p_target_user_id::TEXT,
        'Perubahan jabatan ' || v_target.full_name || ' dari ' || v_target.role::TEXT || ' ke ' || p_new_role::TEXT || '. Alasan: ' || p_reason
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- G. Transaksi Check In Server-Side (Wajib Selfie Baru + Validasi Geofence + Waktu Server Resmi)
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
    v_loc_status location_validation_status := 'valid_in_radius';
    v_require_photo BOOLEAN;
    v_require_gps BOOLEAN;
    v_strict_geo BOOLEAN;
    v_skew_limit INTEGER;
    v_skew_sec INTEGER := 0;
    v_curr_mins INTEGER;
    v_start_mins INTEGER;
    v_end_mins INTEGER;
    v_diff_mins INTEGER;
    v_late_mins INTEGER := 0;
    v_att_status attendance_record_status := 'sudah_check_in_belum_check_out';
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

    SELECT * INTO v_outlet FROM public.outlets WHERE id = v_user.outlet_id;
    IF NOT FOUND THEN
        SELECT * INTO v_outlet FROM public.outlets WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
    END IF;

    SELECT * INTO v_shift FROM public.work_shifts WHERE id = v_user.shift_id;
    IF NOT FOUND THEN
        SELECT * INTO v_shift FROM public.work_shifts WHERE status = 'active' ORDER BY created_at ASC LIMIT 1;
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
        RAISE EXCEPTION 'ALREADY_CHECKED_IN: Anda sudah melakukan Check In untuk shift ini pada tanggal kerja %.', v_work_date;
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

    -- Keterlambatan
    IF v_diff_mins > v_shift.grace_period_minutes THEN
        v_late_mins := v_diff_mins;
        v_att_status := 'terlambat';
        v_anomalies := array_append(v_anomalies, 'Terlambat ' || v_late_mins || ' menit');
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
    VALUES (v_user.id, v_user.full_name, v_user.role::TEXT, 'ATTENDANCE_CHECK_IN', 'attendance', v_new_id::TEXT,
            'Check In berhasil (' || COALESCE(v_dist::TEXT, '0') || 'm dari ' || v_outlet.name || ') masuk ke arsip ' || v_folder_label);

    RETURN jsonb_build_object(
        'ok', true,
        'attendance_id', v_new_id,
        'server_time', v_now,
        'archive_folder', v_folder_label,
        'late_minutes', v_late_mins
    );
END;
$$;

-- H. Transaksi Check Out Server-Side (Wajib Selfie Baru Terpisah + Hitung Durasi Server)
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
    v_loc_status location_validation_status := 'valid_in_radius';
    v_require_photo BOOLEAN;
    v_require_gps BOOLEAN;
    v_strict_geo BOOLEAN;
    v_skew_sec INTEGER := 0;
    v_dur_mins INTEGER := 0;
    v_early_mins INTEGER := 0;
    v_start_mins INTEGER;
    v_end_mins INTEGER;
    v_out_mins INTEGER;
    v_final_status attendance_record_status := 'selesai';
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
    VALUES (v_user.id, v_user.full_name, v_user.role::TEXT, 'ATTENDANCE_CHECK_OUT', 'attendance', v_att.id::TEXT,
            'Check Out berhasil. Durasi kerja: ' || v_dur_mins || ' menit.');

    RETURN jsonb_build_object(
        'ok', true,
        'attendance_id', v_att.id,
        'duration_minutes', v_dur_mins,
        'status', v_final_status
    );
END;
$$;

-- I. Peninjauan / Pengeditan Koreksi Kehadiran oleh Super Admin & Admin (Tanpa Menghapus Bukti Foto Asli!)
CREATE OR REPLACE FUNCTION public.process_attendance_correction(
    p_correction_id UUID,
    p_decision approval_status, -- 'approved' | 'rejected'
    p_review_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_corr public.attendance_corrections%ROWTYPE;
    v_new_in TIMESTAMPTZ;
    v_new_out TIMESTAMPTZ;
    v_new_status attendance_record_status;
    v_dur INTEGER;
BEGIN
    SELECT * INTO v_actor FROM public.profiles
    WHERE id = auth.uid() AND status = 'active' AND first_login_approved = TRUE;

    IF NOT FOUND OR v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'FORBIDDEN: Hanya Super Admin dan Admin yang dapat memproses koreksi absensi.';
    END IF;

    SELECT * INTO v_corr FROM public.attendance_corrections WHERE id = p_correction_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Permintaan koreksi tidak ditemukan.';
    END IF;

    UPDATE public.attendance_corrections
    SET status = p_decision,
        reviewed_by = v_actor.id,
        reviewed_at = NOW(),
        review_note = p_review_note
    WHERE id = p_correction_id;

    IF p_decision = 'approved' THEN
        v_new_in := NULLIF(v_corr.proposed_values->>'check_in_at', '')::TIMESTAMPTZ;
        v_new_out := NULLIF(v_corr.proposed_values->>'check_out_at', '')::TIMESTAMPTZ;
        v_new_status := COALESCE((v_corr.proposed_values->>'attendance_status')::attendance_record_status, 'selesai');

        UPDATE public.attendance
        SET check_in_at = COALESCE(v_new_in, check_in_at),
            check_out_at = COALESCE(v_new_out, check_out_at),
            work_duration_minutes = CASE
                WHEN COALESCE(v_new_in, check_in_at) IS NOT NULL AND COALESCE(v_new_out, check_out_at) IS NOT NULL
                THEN GREATEST(0, round(EXTRACT(EPOCH FROM (COALESCE(v_new_out, check_out_at) - COALESCE(v_new_in, check_in_at))) / 60.0)::INTEGER)
                ELSE work_duration_minutes
            END,
            attendance_status = v_new_status,
            correction_note = 'Dikoreksi oleh ' || v_actor.full_name || ': ' || COALESCE(NULLIF(p_review_note, ''), v_corr.reason) || ' (Foto asli tetap utuh)',
            updated_at = NOW()
        WHERE id = v_corr.attendance_id;
    END IF;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (v_actor.id, v_actor.full_name, v_actor.role::TEXT, 'CORRECTION_' || upper(p_decision::TEXT), 'attendance_corrections', p_correction_id::TEXT,
            'Koreksi absensi ' || p_decision::TEXT || '. Catatan: ' || COALESCE(p_review_note, '-'));

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- J. Edit Langsung Kehadiran oleh Super Admin / Admin (Dengan Jejak Audit & Mempertahankan Foto Asli)
CREATE OR REPLACE FUNCTION public.admin_direct_edit_attendance(
    p_attendance_id UUID,
    p_check_in_at TIMESTAMPTZ,
    p_check_out_at TIMESTAMPTZ,
    p_status attendance_record_status,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_att public.attendance%ROWTYPE;
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

    -- Catat juga di tabel attendance_corrections sebagai riwayat nilai asli
    INSERT INTO public.attendance_corrections (
        attendance_id, requested_by, employee_id, work_date, reason, supporting_note,
        original_values, proposed_values, status, reviewed_by, reviewed_at, review_note
    ) VALUES (
        v_att.id, v_actor.id, v_att.employee_id, v_att.work_date, p_reason, 'Edit Administratif oleh ' || v_actor.role::TEXT,
        jsonb_build_object('check_in_at', v_att.check_in_at, 'check_out_at', v_att.check_out_at, 'attendance_status', v_att.attendance_status),
        jsonb_build_object('check_in_at', p_check_in_at, 'check_out_at', p_check_out_at, 'attendance_status', p_status),
        'approved', v_actor.id, NOW(), p_reason
    );

    UPDATE public.attendance
    SET check_in_at = COALESCE(p_check_in_at, check_in_at),
        check_out_at = p_check_out_at,
        work_duration_minutes = CASE
            WHEN COALESCE(p_check_in_at, check_in_at) IS NOT NULL AND p_check_out_at IS NOT NULL
            THEN GREATEST(0, round(EXTRACT(EPOCH FROM (p_check_out_at - COALESCE(p_check_in_at, check_in_at))) / 60.0)::INTEGER)
            ELSE 0
        END,
        attendance_status = p_status,
        correction_note = 'Diedit oleh ' || v_actor.full_name || ' (' || v_actor.role::TEXT || '): ' || p_reason || ' [Bukti Foto Asli Tetap Utuh]',
        updated_at = NOW()
    WHERE id = p_attendance_id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (v_actor.id, v_actor.full_name, v_actor.role::TEXT, 'ADMIN_EDITED_ATTENDANCE', 'attendance', p_attendance_id::TEXT,
            'Edit administratif absensi tanggal ' || v_att.work_date || '. Alasan: ' || p_reason);

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) KETAT — ISOLASI PENUH UNTUK ANGGOTA
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preapproved_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_bootstrap ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays_and_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Hapus policy lama jika dijalankan ulang
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "preapproved_admin_all" ON public.preapproved_emails;
DROP POLICY IF EXISTS "outlets_read_approved" ON public.outlets;
DROP POLICY IF EXISTS "outlets_write_managers" ON public.outlets;
DROP POLICY IF EXISTS "shifts_read_approved" ON public.work_shifts;
DROP POLICY IF EXISTS "shifts_write_managers" ON public.work_shifts;
DROP POLICY IF EXISTS "attendance_select_strict" ON public.attendance;
DROP POLICY IF EXISTS "corrections_select_strict" ON public.attendance_corrections;
DROP POLICY IF EXISTS "corrections_insert_own" ON public.attendance_corrections;
DROP POLICY IF EXISTS "leaves_select_strict" ON public.holidays_and_leaves;
DROP POLICY IF EXISTS "leaves_insert_own_or_manager" ON public.holidays_and_leaves;
DROP POLICY IF EXISTS "leaves_manage_managers" ON public.holidays_and_leaves;
DROP POLICY IF EXISTS "settings_read_authenticated" ON public.system_settings;
DROP POLICY IF EXISTS "settings_write_managers" ON public.system_settings;
DROP POLICY IF EXISTS "audit_logs_select_managers" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_auth" ON public.audit_logs;

-- 1. Profiles: Anggota HANYA bisa melihat baris dirinya sendiri; Super Admin & Admin melihat semua
CREATE POLICY "profiles_select_policy" ON public.profiles
FOR SELECT USING (
    auth.uid() = id OR public.get_current_user_role() IN ('super_admin', 'admin')
);

-- 2. Preapproved Emails: HANYA Super Admin & Admin
CREATE POLICY "preapproved_admin_all" ON public.preapproved_emails
FOR ALL USING (public.get_current_user_role() IN ('super_admin', 'admin'))
WITH CHECK (public.get_current_user_role() IN ('super_admin', 'admin'));

-- 3. Outlets & Shifts: Anggota yang disetujui hanya bisa SELECT (Read-Only); Edit penuh hanya oleh Super Admin & Admin
CREATE POLICY "outlets_read_approved" ON public.outlets
FOR SELECT USING (
    public.get_current_user_role() IN ('super_admin', 'admin', 'member')
);

CREATE POLICY "outlets_write_managers" ON public.outlets
FOR ALL USING (public.get_current_user_role() IN ('super_admin', 'admin'))
WITH CHECK (public.get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "shifts_read_approved" ON public.work_shifts
FOR SELECT USING (
    public.get_current_user_role() IN ('super_admin', 'admin', 'member')
);

CREATE POLICY "shifts_write_managers" ON public.work_shifts
FOR ALL USING (public.get_current_user_role() IN ('super_admin', 'admin'))
WITH CHECK (public.get_current_user_role() IN ('super_admin', 'admin'));

-- 4. Attendance: Anggota HANYA bisa membaca riwayat absensinya sendiri; Insert/Update wajib lewat RPC server
CREATE POLICY "attendance_select_strict" ON public.attendance
FOR SELECT USING (
    (employee_id = auth.uid() AND public.get_current_user_role() = 'member')
    OR public.get_current_user_role() IN ('super_admin', 'admin')
);

-- 5. Attendance Corrections: Anggota hanya lihat & ajukan miliknya sendiri; Super Admin & Admin kelola semua
CREATE POLICY "corrections_select_strict" ON public.attendance_corrections
FOR SELECT USING (
    (employee_id = auth.uid() AND public.get_current_user_role() = 'member')
    OR public.get_current_user_role() IN ('super_admin', 'admin')
);

CREATE POLICY "corrections_insert_own" ON public.attendance_corrections
FOR INSERT WITH CHECK (
    (requested_by = auth.uid() AND employee_id = auth.uid() AND public.get_current_user_role() = 'member')
    OR public.get_current_user_role() IN ('super_admin', 'admin')
);

-- 6. Holidays & Leaves: Anggota hanya lihat hari libur umum atau pengajuan dirinya sendiri
CREATE POLICY "leaves_select_strict" ON public.holidays_and_leaves
FOR SELECT USING (
    ( (employee_id IS NULL OR employee_id = auth.uid()) AND public.get_current_user_role() = 'member' )
    OR public.get_current_user_role() IN ('super_admin', 'admin')
);

CREATE POLICY "leaves_insert_own_or_manager" ON public.holidays_and_leaves
FOR INSERT WITH CHECK (
    (employee_id = auth.uid() AND type IN ('izin', 'sakit', 'cuti') AND public.get_current_user_role() = 'member')
    OR public.get_current_user_role() IN ('super_admin', 'admin')
);

CREATE POLICY "leaves_manage_managers" ON public.holidays_and_leaves
FOR ALL USING (public.get_current_user_role() IN ('super_admin', 'admin'))
WITH CHECK (public.get_current_user_role() IN ('super_admin', 'admin'));

-- 7. System Settings: Read untuk user aktif, Write HANYA Super Admin & Admin
CREATE POLICY "settings_read_authenticated" ON public.system_settings
FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "settings_write_managers" ON public.system_settings
FOR ALL USING (public.get_current_user_role() IN ('super_admin', 'admin'))
WITH CHECK (public.get_current_user_role() IN ('super_admin', 'admin'));

-- 8. Audit Logs: Anggota DILARANG KERAS mengakses Audit Log; HANYA Super Admin & Admin
CREATE POLICY "audit_logs_select_managers" ON public.audit_logs
FOR SELECT USING (public.get_current_user_role() IN ('super_admin', 'admin'));

CREATE POLICY "audit_logs_insert_auth" ON public.audit_logs
FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 11. SUPABASE PRIVATE STORAGE BUCKET & STORAGE RLS POLICIES
-- Path struktur: SUKA-LATTE-ATTENDANCE/attendance-photos/<YYYY>/<MM-Month>/<user_uid>/<filename>.jpg
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'attendance-photos-private',
    'attendance-photos-private',
    FALSE,
    5242880,
    ARRAY['image/jpeg', 'image/webp', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS "private_photos_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "private_photos_read_own_or_manager" ON storage.objects;

-- Karyawan aktif hanya dapat mengunggah bukti selfie ke dalam folder UID miliknya sendiri
CREATE POLICY "private_photos_upload_own" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'attendance-photos-private'
    AND public.get_current_user_role() IN ('super_admin', 'admin', 'member')
    AND (storage.foldername(name))[5] = auth.uid()::TEXT
);

-- Anggota hanya dapat membuka Signed URL foto miliknya sendiri; Super Admin & Admin dapat memeriksa seluruh bukti
CREATE POLICY "private_photos_read_own_or_manager" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'attendance-photos-private'
    AND (
        ((storage.foldername(name))[5] = auth.uid()::TEXT AND public.get_current_user_role() = 'member')
        OR public.get_current_user_role() IN ('super_admin', 'admin')
    )
);
