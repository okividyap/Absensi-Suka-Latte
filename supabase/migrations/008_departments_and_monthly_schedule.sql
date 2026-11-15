-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM — MIGRASI 008
-- 1. Penambahan Divisi / Stasiun Kerja Karyawan: Manajer, Bar, Kitchen
-- 2. Pemisahan Jadwal Roster Tim Bar dan Tim Kitchen
-- 3. RPC Bulk Upsert Roster Bulanan Penuh (1 Bulan Sekaligus)
-- ============================================================================

-- A. TAMBAH KOLOM DEPARTMENT PADA PROFILES
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'bar'
CHECK (department IN ('manager', 'bar', 'kitchen'));

-- Update default department berdasarkan role dan jabatan yang sudah ada
UPDATE public.profiles
SET department = CASE
    WHEN role IN ('super_admin', 'admin') THEN 'manager'
    WHEN position_title ILIKE '%kitchen%' OR position_title ILIKE '%cook%' OR position_title ILIKE '%dapur%' OR position_title ILIKE '%chef%' THEN 'kitchen'
    ELSE 'bar'
END
WHERE department IS NULL OR department = 'bar';

-- B. TAMBAH KOLOM DEPARTMENT PADA PREAPPROVED_EMAILS
ALTER TABLE public.preapproved_emails
ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'bar'
CHECK (department IN ('manager', 'bar', 'kitchen'));

-- C. TAMBAH KOLOM DEPARTMENT PADA WORK_SCHEDULES (OPSIONAL KHUSUS OVERRIDE)
ALTER TABLE public.work_schedules
ADD COLUMN IF NOT EXISTS department TEXT
CHECK (department IS NULL OR department IN ('manager', 'bar', 'kitchen'));

-- D. PERBARUI get_active_coworkers AGAR MENYERTAKAN DEPARTMENT DAN POSITION_TITLE
DROP FUNCTION IF EXISTS public.get_active_coworkers();
CREATE OR REPLACE FUNCTION public.get_active_coworkers()
RETURNS TABLE (
    id UUID,
    full_name TEXT,
    employee_code TEXT,
    role public.user_role,
    position_title TEXT,
    department TEXT,
    avatar_url TEXT,
    outlet_id UUID,
    shift_id UUID,
    status public.user_status,
    first_login_approved BOOLEAN,
    face_id_enrolled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() AND status = 'active' AND first_login_approved = true
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT 
        p.id,
        p.full_name,
        p.employee_code,
        p.role,
        p.position_title,
        p.department,
        p.avatar_url,
        p.outlet_id,
        p.shift_id,
        p.status,
        p.first_login_approved,
        p.face_id_enrolled
    FROM public.profiles p
    WHERE p.status = 'active' AND p.first_login_approved = true
    ORDER BY 
        CASE WHEN p.department = 'manager' THEN 1 WHEN p.department = 'bar' THEN 2 ELSE 3 END,
        p.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_active_coworkers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_coworkers() TO authenticated;

-- E. PERBARUI update_employee_by_manager MENYERTAKAN DEPARTMENT
CREATE OR REPLACE FUNCTION public.update_employee_by_manager(
    p_target_user_id UUID,
    p_employee_code TEXT,
    p_full_name TEXT,
    p_phone TEXT,
    p_position_title TEXT,
    p_outlet_id UUID,
    p_shift_id UUID,
    p_status user_status,
    p_department TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
    v_dept TEXT;
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

    IF v_actor.role = 'admin' AND v_target.role IN ('super_admin', 'admin') AND v_target.id <> v_actor.id THEN
        RAISE EXCEPTION 'FORBIDDEN: Admin hanya dapat mengedit profil Anggota atau profil dirinya sendiri.';
    END IF;

    IF v_target.role = 'super_admin' AND p_status <> 'active' THEN
        RAISE EXCEPTION 'PROTECTED_SUPER_ADMIN: Status akun Super Admin tunggal wajib tetap Aktif.';
    END IF;

    v_dept := COALESCE(NULLIF(btrim(p_department), ''), v_target.department, 'bar');
    IF v_dept NOT IN ('manager', 'bar', 'kitchen') THEN
        v_dept := 'bar';
    END IF;

    UPDATE public.profiles
    SET employee_code = COALESCE(NULLIF(upper(btrim(p_employee_code)), ''), employee_code),
        full_name = COALESCE(NULLIF(btrim(p_full_name), ''), full_name),
        phone = COALESCE(btrim(p_phone), ''),
        position_title = COALESCE(NULLIF(btrim(p_position_title), ''), position_title),
        department = v_dept,
        outlet_id = COALESCE(p_outlet_id, outlet_id),
        shift_id = COALESCE(p_shift_id, shift_id),
        status = p_status,
        first_login_approved = CASE WHEN p_status = 'active' THEN TRUE ELSE first_login_approved END,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
    VALUES (
        v_actor.id,
        v_actor.full_name,
        v_actor.role::TEXT,
        'EMPLOYEE_PROFILE_EDITED',
        'profiles',
        p_target_user_id::TEXT,
        FORMAT('Profil %s (%s) diperbarui: divisi %s, status %s.', p_full_name, p_employee_code, v_dept, p_status::TEXT)
    );

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- F. PERBARUI review_google_first_login MENYERTAKAN DEPARTMENT
CREATE OR REPLACE FUNCTION public.review_google_first_login(
    p_target_user_id UUID,
    p_decision TEXT,
    p_employee_code TEXT DEFAULT NULL,
    p_position_title TEXT DEFAULT 'Barista / Crew',
    p_outlet_id UUID DEFAULT NULL,
    p_shift_id UUID DEFAULT NULL,
    p_note TEXT DEFAULT '',
    p_department TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target public.profiles%ROWTYPE;
    v_final_code TEXT;
    v_dept TEXT;
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

        v_dept := COALESCE(NULLIF(btrim(p_department), ''), 'bar');
        IF v_dept NOT IN ('manager', 'bar', 'kitchen') THEN
            v_dept := 'bar';
        END IF;

        UPDATE public.profiles
        SET status = 'active',
            first_login_approved = TRUE,
            employee_code = v_final_code,
            position_title = COALESCE(NULLIF(btrim(p_position_title), ''), 'Barista / Crew'),
            department = v_dept,
            outlet_id = COALESCE(p_outlet_id, outlet_id),
            shift_id = COALESCE(p_shift_id, shift_id),
            approved_by = v_actor.id,
            approved_at = NOW(),
            rejection_reason = NULL,
            updated_at = NOW()
        WHERE id = p_target_user_id;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (
            v_actor.id,
            v_actor.full_name,
            v_actor.role::TEXT,
            'GOOGLE_FIRST_LOGIN_APPROVED',
            'profiles',
            p_target_user_id::TEXT,
            FORMAT('Login pertama %s (%s) disetujui: ID %s, divisi %s.', v_target.full_name, v_target.email, v_final_code, v_dept)
        );
    ELSE
        UPDATE public.profiles
        SET status = 'rejected',
            first_login_approved = FALSE,
            rejection_reason = COALESCE(NULLIF(btrim(p_note), ''), 'Permintaan akses ditolak oleh Admin.'),
            updated_at = NOW()
        WHERE id = p_target_user_id;

        INSERT INTO public.audit_logs (actor_user_id, actor_name, actor_role, action, target_type, target_id, detail)
        VALUES (
            v_actor.id,
            v_actor.full_name,
            v_actor.role::TEXT,
            'GOOGLE_FIRST_LOGIN_REJECTED',
            'profiles',
            p_target_user_id::TEXT,
            FORMAT('Login pertama %s (%s) ditolak. Catatan: %s', v_target.full_name, v_target.email, COALESCE(p_note, '-'))
        );
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- G. RPC BULK UPSERT ROSTER JADWAL KERJA 1 BULAN SEKALIGUS
CREATE OR REPLACE FUNCTION public.bulk_upsert_work_schedules(
    p_employee_id UUID,
    p_schedules JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target_emp public.profiles%ROWTYPE;
    v_elem JSONB;
    v_date DATE;
    v_shift_id UUID;
    v_outlet_id UUID;
    v_type TEXT;
    v_notes TEXT;
    v_count INT := 0;
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun pengelola tidak aktif.';
    END IF;
    IF v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya Super Admin atau Admin yang dapat mengatur schedule kerja.';
    END IF;

    SELECT * INTO v_target_emp FROM public.profiles WHERE id = p_employee_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Karyawan tidak ditemukan.';
    END IF;

    IF jsonb_typeof(p_schedules) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_DATA: Data schedule wajib berformat array JSON.';
    END IF;

    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_schedules)
    LOOP
        v_date := (v_elem->>'date')::DATE;
        IF v_date IS NULL THEN
            CONTINUE;
        END IF;

        v_type := COALESCE(v_elem->>'schedule_type', 'work');
        IF v_elem->>'shift_id' IS NOT NULL AND v_elem->>'shift_id' <> '' AND v_elem->>'shift_id' <> 'off' THEN
            v_shift_id := (v_elem->>'shift_id')::UUID;
        ELSE
            v_shift_id := NULL;
        END IF;

        IF v_elem->>'outlet_id' IS NOT NULL AND v_elem->>'outlet_id' <> '' THEN
            v_outlet_id := (v_elem->>'outlet_id')::UUID;
        ELSE
            v_outlet_id := v_target_emp.outlet_id;
        END IF;

        v_notes := NULLIF(TRIM(v_elem->>'notes'), '');

        IF v_type = 'off' THEN
            v_shift_id := NULL;
        END IF;

        INSERT INTO public.work_schedules (
            employee_id,
            schedule_date,
            shift_id,
            outlet_id,
            schedule_type,
            notes,
            created_by,
            updated_at
        )
        VALUES (
            p_employee_id,
            v_date,
            v_shift_id,
            v_outlet_id,
            v_type,
            v_notes,
            auth.uid(),
            NOW()
        )
        ON CONFLICT (employee_id, schedule_date)
        DO UPDATE SET
            shift_id = EXCLUDED.shift_id,
            outlet_id = EXCLUDED.outlet_id,
            schedule_type = EXCLUDED.schedule_type,
            notes = EXCLUDED.notes,
            created_by = auth.uid(),
            updated_at = NOW();

        v_count := v_count + 1;
    END LOOP;

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
        'MONTHLY_SCHEDULE_BULK_UPSERT',
        'work_schedules',
        p_employee_id::TEXT,
        FORMAT('Menetapkan jadwal bulanan (%s hari) untuk %s (%s)', v_count, v_target_emp.full_name, v_target_emp.employee_code)
    );

    RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_upsert_work_schedules(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_upsert_work_schedules(UUID, JSONB) TO authenticated;
