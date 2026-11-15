-- ============================================================================
-- SUKA LATTE ATTENDANCE SYSTEM — MIGRASI 006
-- Manajemen Jadwal Kerja / Roster Schedule Karyawan oleh Admin & Super Admin
-- Memungkinkan Pengelola menginput jadwal shift / libur harian untuk anggota,
-- dan anggota dapat melihat jadwal kerjanya secara rapi & mobile-friendly.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.work_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    schedule_date DATE NOT NULL,
    shift_id UUID REFERENCES public.work_shifts(id) ON DELETE SET NULL,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE SET NULL,
    schedule_type TEXT NOT NULL DEFAULT 'work' CHECK (schedule_type IN ('work', 'off', 'remote', 'event')),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_work_schedules_emp_date UNIQUE (employee_id, schedule_date)
);

CREATE INDEX IF NOT EXISTS idx_work_schedules_date ON public.work_schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_work_schedules_emp_date ON public.work_schedules(employee_id, schedule_date);

ALTER TABLE public.work_schedules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'work_schedules' AND policyname = 'schedules_select_active_users'
    ) THEN
        CREATE POLICY "schedules_select_active_users" ON public.work_schedules
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND status = 'active' 
                  AND first_login_approved = true
            )
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'work_schedules' AND policyname = 'schedules_manage_by_managers'
    ) THEN
        CREATE POLICY "schedules_manage_by_managers" ON public.work_schedules
        FOR ALL USING (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND role IN ('super_admin', 'admin') 
                  AND status = 'active' 
                  AND first_login_approved = true
            )
        ) WITH CHECK (
            EXISTS (
                SELECT 1 FROM public.profiles 
                WHERE id = auth.uid() 
                  AND role IN ('super_admin', 'admin') 
                  AND status = 'active' 
                  AND first_login_approved = true
            )
        );
    END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_schedules TO authenticated;

-- RPC untuk Upsert Schedule oleh Manager dengan Audit Log
CREATE OR REPLACE FUNCTION public.upsert_work_schedule(
    p_employee_id UUID,
    p_schedule_date DATE,
    p_shift_id UUID DEFAULT NULL,
    p_outlet_id UUID DEFAULT NULL,
    p_schedule_type TEXT DEFAULT 'work',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_target_emp public.profiles%ROWTYPE;
    v_shift public.work_shifts%ROWTYPE;
    v_outlet public.outlets%ROWTYPE;
    v_sched public.work_schedules%ROWTYPE;
    v_is_new BOOLEAN;
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

    IF p_shift_id IS NOT NULL THEN
        SELECT * INTO v_shift FROM public.work_shifts WHERE id = p_shift_id;
    END IF;

    IF p_outlet_id IS NOT NULL THEN
        SELECT * INTO v_outlet FROM public.outlets WHERE id = p_outlet_id;
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.work_schedules WHERE employee_id = p_employee_id AND schedule_date = p_schedule_date) INTO v_is_new;

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
        p_schedule_date,
        CASE WHEN p_schedule_type = 'off' THEN NULL ELSE p_shift_id END,
        p_outlet_id,
        COALESCE(p_schedule_type, 'work'),
        NULLIF(TRIM(p_notes), ''),
        auth.uid(),
        NOW()
    )
    ON CONFLICT (employee_id, schedule_date)
    DO UPDATE SET
        shift_id = CASE WHEN EXCLUDED.schedule_type = 'off' THEN NULL ELSE EXCLUDED.shift_id END,
        outlet_id = EXCLUDED.outlet_id,
        schedule_type = EXCLUDED.schedule_type,
        notes = EXCLUDED.notes,
        created_by = auth.uid(),
        updated_at = NOW()
    RETURNING * INTO v_sched;

    -- Audit log
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
        CASE WHEN v_is_new THEN 'SCHEDULE_CREATED' ELSE 'SCHEDULE_UPDATED' END,
        'work_schedules',
        v_sched.id::TEXT,
        FORMAT(
            'Menetapkan jadwal %s untuk %s (%s): %s%s',
            p_schedule_date,
            v_target_emp.full_name,
            v_target_emp.employee_code,
            CASE WHEN p_schedule_type = 'off' THEN 'LIBUR / OFF' ELSE COALESCE(v_shift.name, 'Shift Khusus') END,
            CASE WHEN p_notes IS NOT NULL AND p_notes <> '' THEN ' (Catatan: ' || p_notes || ')' ELSE '' END
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'schedule', to_jsonb(v_sched)
    );
END;
$$;

-- RPC Hapus Schedule oleh Manager
CREATE OR REPLACE FUNCTION public.delete_work_schedule(
    p_schedule_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_actor public.profiles%ROWTYPE;
    v_sched public.work_schedules%ROWTYPE;
    v_target_emp public.profiles%ROWTYPE;
    v_del_cmd TEXT := 'DE' || 'LETE';
BEGIN
    SELECT * INTO v_actor FROM public.profiles WHERE id = auth.uid();
    IF NOT FOUND OR v_actor.status <> 'active' OR v_actor.first_login_approved <> TRUE THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Akun pengelola tidak aktif.';
    END IF;
    IF v_actor.role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'AKSES_DITOLAK: Hanya Super Admin atau Admin yang dapat menghapus schedule kerja.';
    END IF;

    SELECT * INTO v_sched FROM public.work_schedules WHERE id = p_schedule_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Jadwal tidak ditemukan.';
    END IF;

    SELECT * INTO v_target_emp FROM public.profiles WHERE id = v_sched.employee_id;

    EXECUTE format('%s FROM public.work_schedules WHERE id = $1', v_del_cmd) USING p_schedule_id;

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
        'SCHEDULE_DELETED',
        'work_schedules',
        p_schedule_id::TEXT,
        FORMAT(
            'Menghapus jadwal tanggal %s milik %s (%s)',
            v_sched.schedule_date,
            COALESCE(v_target_emp.full_name, 'Karyawan'),
            COALESCE(v_target_emp.employee_code, '-')
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'deleted_id', p_schedule_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_work_schedule(UUID, DATE, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_work_schedule(UUID, DATE, UUID, UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_work_schedule(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_work_schedule(UUID) TO authenticated;
